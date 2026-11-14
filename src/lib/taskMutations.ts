import type { Group, Tag, Task, WorkSession } from '../types';
import { MAX_PINNED_GROUPS } from '../types';

/**
 * Pure group/task/session transforms, kept out of the provider so they can be
 * tested without a React tree. Each returns the original array unchanged when
 * nothing matched, which lets the optimistic layer skip a needless write.
 */

/** Pinned groups always sort to the top; order within each band is preserved. */
export function pinnedFirst(groups: Group[]): Group[] {
  const pinned: Group[] = [];
  const rest: Group[] = [];
  for (const g of groups) (g.pinned ? pinned : rest).push(g);
  return pinned.length ? [...pinned, ...rest] : groups;
}

/** Map over one task inside one group without touching anything else. */
export function mapTask(
  groups: Group[],
  groupId: string,
  taskId: string,
  fn: (task: Task) => Task,
): Group[] {
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, tasks: g.tasks.map((t) => (t.id === taskId ? fn(t) : t)) }
      : g,
  );
}

/** Add seconds to a task wherever it lives, clamped at zero. */
export function adjustTaskElapsed(
  groups: Group[],
  taskId: string,
  deltaSeconds: number,
): Group[] {
  if (deltaSeconds === 0) return groups;

  let changed = false;
  const next = groups.map((g) => {
    if (!g.tasks.some((t) => t.id === taskId)) return g;
    changed = true;
    return {
      ...g,
      tasks: g.tasks.map((t) =>
        t.id === taskId
          ? { ...t, elapsedSeconds: Math.max(0, t.elapsedSeconds + deltaSeconds) }
          : t,
      ),
    };
  });

  return changed ? next : groups;
}

/** Toggling respects the pin cap; at the cap the groups come back untouched. */
export function toggleGroupPinned(groups: Group[], groupId: string): Group[] {
  const target = groups.find((g) => g.id === groupId);
  if (!target) return groups;

  if (!target.pinned && groups.filter((g) => g.pinned).length >= MAX_PINNED_GROUPS) {
    return groups;
  }

  return pinnedFirst(
    groups.map((g) => (g.id === groupId ? { ...g, pinned: !g.pinned } : g)),
  );
}

/** Move a task between groups, keeping its elapsed time, tags and description. */
export function moveTaskBetweenGroups(
  groups: Group[],
  fromGroupId: string,
  toGroupId: string,
  taskId: string,
): Group[] {
  if (fromGroupId === toGroupId) return groups;

  const task = groups
    .find((g) => g.id === fromGroupId)
    ?.tasks.find((t) => t.id === taskId);
  if (!task) return groups;
  if (!groups.some((g) => g.id === toGroupId)) return groups;

  return groups.map((g) => {
    if (g.id === fromGroupId) {
      return { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) };
    }
    if (g.id === toGroupId) {
      return { ...g, tasks: [task, ...g.tasks] };
    }
    return g;
  });
}

/** Strip a tag id from every task that referenced it. */
export function removeTagFromTasks(groups: Group[], tagId: string): Group[] {
  let changed = false;
  const next = groups.map((g) => {
    let groupChanged = false;
    const tasks = g.tasks.map((t) => {
      if (!t.tagIds?.includes(tagId)) return t;
      groupChanged = true;
      changed = true;
      return { ...t, tagIds: t.tagIds.filter((id) => id !== tagId) };
    });
    return groupChanged ? { ...g, tasks } : g;
  });
  return changed ? next : groups;
}

/**
 * Tags used to live inside each task. Hoist any such tags into the shared
 * library (matching existing ones by label, case-insensitively) and leave the
 * task referencing ids instead.
 */
export function migrateLegacyTags(
  groups: Group[],
  existingTags: Tag[],
): { groups: Group[]; tags: Tag[]; migrated: boolean } {
  const tags = [...existingTags];
  const byLabel = new Map(tags.map((t) => [t.label.toLowerCase(), t]));
  let changed = false;

  const nextGroups = groups.map((g) => ({
    ...g,
    tasks: g.tasks.map((t) => {
      if (!t.tags?.length) return t;
      changed = true;

      const ids = new Set(t.tagIds ?? []);
      for (const legacy of t.tags) {
        const key = legacy.label.toLowerCase();
        let master = byLabel.get(key);
        if (!master) {
          master = { id: legacy.id, label: legacy.label, color: legacy.color };
          byLabel.set(key, master);
          tags.push(master);
        }
        ids.add(master.id);
      }

      const migrated: Task = { ...t, tagIds: Array.from(ids) };
      delete migrated.tags;
      return migrated;
    }),
  }));

  return changed
    ? { groups: nextGroups, tags, migrated: true }
    : { groups, tags: existingTags, migrated: false };
}

export interface SessionPatchInput {
  startTime?: number;
  endTime?: number;
  notes?: string;
}

export interface PatchedSession {
  session: WorkSession;
  /** Change in duration, to apply to the task's elapsed total. */
  deltaSeconds: number;
}

/**
 * Apply an edit to a recorded session. Returns null when the result would be
 * invalid (end at or before start), so the caller leaves state alone.
 */
export function applySessionPatch(
  session: WorkSession,
  patch: SessionPatchInput,
): PatchedSession | null {
  const startTime = patch.startTime ?? session.startTime;
  const endTime = patch.endTime ?? session.endTime;
  if (endTime <= startTime) return null;

  const durationSeconds = Math.floor((endTime - startTime) / 1000);

  return {
    session: {
      ...session,
      startTime,
      endTime,
      durationSeconds,
      notes:
        patch.notes !== undefined ? patch.notes.trim() || undefined : session.notes,
    },
    deltaSeconds: durationSeconds - session.durationSeconds,
  };
}
