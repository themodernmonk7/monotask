import type { CompletedTask, Group, WorkSession } from '../types';
import { extractTicketId } from './analytics';

export interface ActiveSessionRef {
  taskId: string;
  startTime: number;
}

export interface DeriveSessionsInput {
  sessions: WorkSession[];
  completedTasks: CompletedTask[];
  groups: Group[];
  runningTaskId: string | null;
  activeSession: ActiveSessionRef | null;
  now: number;
  /**
   * Where the live segment stops. Normally `now`; while the user hasn't yet
   * answered "were you working while away?", it stops where they left, so
   * unconfirmed time is never shown as worked.
   */
  liveEnd?: number;
}

/**
 * The complete picture of tracked time: recorded sessions plus the three kinds
 * of time that have no session row of their own.
 *
 * Every report, the daily target and the CSV export are all built on this, so
 * a mistake here silently corrupts every number the app shows. The three
 * synthesised kinds are:
 *
 *   1. legacy-*      — a completed task with no session covering it.
 *   2. task-accum-*  — an open task's baseSeconds: time from before sessions
 *                      existed. Placed at baseAt, a fixed moment — dating it
 *                      "now" put the same hours on every day until the task
 *                      was completed.
 *   3. active-live-* — the segment currently being timed.
 *
 */
export function deriveAllSessions({
  sessions,
  completedTasks,
  groups,
  runningTaskId,
  activeSession,
  now,
  liveEnd = now,
}: DeriveSessionsInput): WorkSession[] {
  const list: WorkSession[] = [...sessions];

  // Seconds already recorded against each completed task.
  const recordedByCompletedTaskId = new Map<string, number>();
  for (const s of sessions) {
    if (!s.completedTaskId) continue;
    recordedByCompletedTaskId.set(
      s.completedTaskId,
      (recordedByCompletedTaskId.get(s.completedTaskId) ?? 0) + s.durationSeconds,
    );
  }

  // 1. The part of a completed task's total that no session accounts for.
  //
  // This used to be all-or-nothing — skip entirely if any session referenced
  // the completed task, otherwise emit its whole total. Both ends were wrong:
  // a task completed while not running had none of its sessions tagged, so the
  // full total was emitted on top of them (double counting), and a tagged task
  // silently dropped whatever time its sessions had not captured.
  for (const ct of completedTasks) {
    const recorded = recordedByCompletedTaskId.get(ct.id) ?? 0;
    const dur = Math.max(0, ct.totalSeconds - recorded);
    if (dur === 0) continue;

    const end = ct.endTime || ct.completedAt || now;
    const start = ct.startTime || end - dur * 1000;

    list.push({
      id: `legacy-${ct.id}`,
      taskId: ct.id,
      taskName: ct.taskName,
      groupName: ct.groupName,
      ticketId: ct.ticketId || extractTicketId(ct.taskName) || undefined,
      startTime: start,
      endTime: end,
      durationSeconds: dur,
      notes: ct.notes,
      completedTaskId: ct.id,
    });
  }

  // 2. Pre-session time on open tasks
  for (const group of groups) {
    for (const task of group.tasks) {
      const base = task.baseSeconds ?? 0;
      if (base <= 0) continue;
      const end = task.baseAt ?? now;
      list.push({
        id: `task-accum-${task.id}`,
        taskId: task.id,
        taskName: task.name,
        groupName: group.name,
        ticketId: extractTicketId(task.name) || undefined,
        startTime: end - base * 1000,
        endTime: end,
        durationSeconds: base,
      });
    }
  }

  // 3. The live running segment
  if (runningTaskId && activeSession) {
    const activeDuration = Math.max(
      0,
      Math.floor((liveEnd - activeSession.startTime) / 1000),
    );

    if (activeDuration > 0) {
      const group = groups.find((g) =>
        g.tasks.some((t) => t.id === runningTaskId),
      );
      const task = group?.tasks.find((t) => t.id === runningTaskId);

      if (task && group) {
        list.push({
          id: `active-live-${task.id}`,
          taskId: task.id,
          taskName: task.name,
          groupName: group.name,
          ticketId: extractTicketId(task.name) || undefined,
          startTime: activeSession.startTime,
          endTime: Math.max(activeSession.startTime, liveEnd),
          durationSeconds: activeDuration,
        });
      }
    }
  }

  return list;
}
