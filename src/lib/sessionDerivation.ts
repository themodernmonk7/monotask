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
 *   2. task-accum-*  — elapsed time on an open task beyond what its sessions
 *                      account for (e.g. the timer ran before sessions existed).
 *   3. active-live-* — the segment currently being timed.
 *
 * The subtle part is (2): it subtracts the live segment as well as recorded
 * sessions, otherwise the time currently being timed would be counted twice.
 */
export function deriveAllSessions({
  sessions,
  completedTasks,
  groups,
  runningTaskId,
  activeSession,
  now,
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

  // 2. Elapsed time on open tasks not yet covered by a session
  const sessionSecondsByTaskId = new Map<string, number>();
  for (const s of sessions) {
    sessionSecondsByTaskId.set(
      s.taskId,
      (sessionSecondsByTaskId.get(s.taskId) || 0) + s.durationSeconds,
    );
  }

  for (const group of groups) {
    for (const task of group.tasks) {
      const recordedSeconds = sessionSecondsByTaskId.get(task.id) || 0;
      const activeNowSeconds =
        runningTaskId === task.id && activeSession
          ? Math.max(0, Math.floor((now - activeSession.startTime) / 1000))
          : 0;

      const unrecordedSeconds =
        task.elapsedSeconds - recordedSeconds - activeNowSeconds;

      if (unrecordedSeconds > 0) {
        list.push({
          id: `task-accum-${task.id}`,
          taskId: task.id,
          taskName: task.name,
          groupName: group.name,
          ticketId: extractTicketId(task.name) || undefined,
          startTime: now - unrecordedSeconds * 1000,
          endTime: now,
          durationSeconds: unrecordedSeconds,
        });
      }
    }
  }

  // 3. The live running segment
  if (runningTaskId && activeSession) {
    const activeDuration = Math.max(
      0,
      Math.floor((now - activeSession.startTime) / 1000),
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
          endTime: now,
          durationSeconds: activeDuration,
        });
      }
    }
  }

  return list;
}
