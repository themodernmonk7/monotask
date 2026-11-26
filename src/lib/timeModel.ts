import type { CompletedTask, Group, Task, WorkSession } from '../types';

/**
 * How time is modelled, so every device computes the same numbers.
 *
 * A task's total is DERIVED, never accumulated in a counter:
 *
 *     total = baseSeconds + sum(recorded sessions for the task) + live segment
 *
 *  - Sessions are individual rows, so devices merge them instead of fighting
 *    over one number. (The old per-second `elapsedSeconds` counter was written
 *    by whichever device ran the timer, every 30s, as part of the whole group —
 *    which is exactly how a task completed on one device came back to life.)
 *  - `baseSeconds` is time that predates sessions (migrated once from the old
 *    counter) and never changes afterwards.
 *  - The live segment is `now - activeSessionStart`, computed on read.
 *
 * Ids for things two devices might both create are deterministic, so doing
 * the same thing twice converges on one row instead of duplicating it.
 */

/** A task's completion record. Completing twice (two devices) upserts one row. */
export function completionIdFor(taskId: string): string {
  return `done-${taskId}`;
}

/** A closed timer segment. Two devices closing the same segment write one row. */
export function sessionIdFor(taskId: string, startTime: number): string {
  return `seg-${taskId}-${startTime}`;
}

export function recordedSecondsByTask(sessions: WorkSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.taskId, (map.get(s.taskId) ?? 0) + s.durationSeconds);
  }
  return map;
}

export interface LiveSegment {
  taskId: string;
  startTime: number;
}

/** Seconds in the live segment, ending at `end` (now, or when the user left). */
export function liveSeconds(live: LiveSegment | null, end: number): number {
  return live ? Math.max(0, Math.floor((end - live.startTime) / 1000)) : 0;
}

/**
 * Bring tasks saved by the old counter model onto `baseSeconds`.
 *
 * Old `elapsedSeconds` = pre-session time + recorded sessions + whatever of
 * the live segment had been checkpointed (up to lastActive). Only the first
 * part is base; the rest is already counted elsewhere.
 */
export function migrateTaskBase(
  groups: Group[],
  sessions: WorkSession[],
  active: { runningTaskId: string | null; activeSessionStart: number | null; lastActiveTimestamp: number | null } | null,
  now: number,
): Group[] {
  if (!groups.some((g) => g.tasks.some((t) => t.baseSeconds === undefined))) return groups;

  const recorded = recordedSecondsByTask(sessions);
  const migrate = (t: Task): Task => {
    if (t.baseSeconds !== undefined) return t;
    const running =
      active?.runningTaskId === t.id && active.activeSessionStart
        ? Math.max(
            0,
            Math.floor(
              ((active.lastActiveTimestamp ?? active.activeSessionStart) -
                active.activeSessionStart) /
                1000,
            ),
          )
        : 0;
    const base = Math.max(0, (t.elapsedSeconds ?? 0) - (recorded.get(t.id) ?? 0) - running);
    return base > 0
      ? { ...t, baseSeconds: base, baseAt: active?.lastActiveTimestamp ?? now }
      : { ...t, baseSeconds: 0 };
  };

  return groups.map((g) =>
    g.tasks.some((t) => t.baseSeconds === undefined)
      ? { ...g, tasks: g.tasks.map(migrate) }
      : g,
  );
}

/**
 * Task ids that have been completed. Covers completions made under the
 * deterministic id scheme and older ones, identified through the sessions
 * that were attributed to them.
 */
export function completedTaskIds(
  completedTasks: CompletedTask[],
  sessions: WorkSession[],
): Set<string> {
  const completionIds = new Set(completedTasks.map((c) => c.id));
  const done = new Set<string>();
  for (const c of completedTasks) {
    if (c.id.startsWith('done-')) done.add(c.id.slice('done-'.length));
  }
  for (const s of sessions) {
    if (s.completedTaskId && completionIds.has(s.completedTaskId)) done.add(s.taskId);
  }
  return done;
}

/** Drop tasks that were completed (possibly on another device) from open lists. */
export function stripCompletedTasks(groups: Group[], done: Set<string>): Group[] {
  if (done.size === 0) return groups;
  let changed = false;
  const next = groups.map((g) => {
    if (!g.tasks.some((t) => done.has(t.id))) return g;
    changed = true;
    return { ...g, tasks: g.tasks.filter((t) => !done.has(t.id)) };
  });
  return changed ? next : groups;
}

/** Total seconds for one task under the derived model. */
export function taskTotalSeconds(
  task: Task,
  recorded: Map<string, number>,
  live: LiveSegment | null,
  liveEnd: number,
): number {
  return (
    (task.baseSeconds ?? 0) +
    (recorded.get(task.id) ?? 0) +
    (live?.taskId === task.id ? liveSeconds(live, liveEnd) : 0)
  );
}

/**
 * The groups the UI renders: identical to the stored groups except that each
 * task's `elapsedSeconds` is its derived total. Untouched groups keep their
 * identity so memoised rows don't re-render.
 */
export function withDerivedElapsed(
  groups: Group[],
  sessions: WorkSession[],
  live: LiveSegment | null,
  liveEnd: number,
): Group[] {
  const recorded = recordedSecondsByTask(sessions);
  return groups.map((g) => {
    let changed = false;
    const tasks = g.tasks.map((t) => {
      const total = taskTotalSeconds(t, recorded, live, liveEnd);
      if (total === t.elapsedSeconds) return t;
      changed = true;
      return { ...t, elapsedSeconds: total };
    });
    return changed ? { ...g, tasks } : g;
  });
}
