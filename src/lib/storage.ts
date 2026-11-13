import type { CompletedTask, Note, Group, NoteGroup, WorkSession, AppSettings } from '../types';

const COMPLETED_KEY = 'monotask-completed';
const NOTES_KEY = 'monotask-notes';
const NOTE_GROUPS_KEY = 'monotask-note-groups';
const GROUPS_KEY = 'monotask-groups';
const RUNNING_TASK_ID_KEY = 'monotask-running-task-id';
const LAST_ACTIVE_KEY = 'monotask-last-active';
const SESSIONS_KEY = 'monotask-sessions';
const SETTINGS_KEY = 'monotask-settings';
const ACTIVE_SESSION_KEY = 'monotask-active-session';

export const DEFAULT_SETTINGS: AppSettings = {
  dailyTargetMinutes: 420, // 7 hours
  workingDays: [1, 2, 3, 4, 5], // Monday - Friday
};

export function getCompletedTasks(): CompletedTask[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function setCompletedTasks(tasks: CompletedTask[]): void {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(tasks));
}

export function getNoteGroups(): NoteGroup[] {
  try {
    const raw = localStorage.getItem(NOTE_GROUPS_KEY);
    if (raw) return JSON.parse(raw);

    const legacyNotesRaw = localStorage.getItem(NOTES_KEY);
    if (legacyNotesRaw) {
      const legacyNotes = JSON.parse(legacyNotesRaw) as Note[];
      if (legacyNotes.length > 0) {
        return [
          {
            id: 'legacy-default',
            title: 'General',
            notes: legacyNotes,
          },
        ];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function setNoteGroups(groups: NoteGroup[]): void {
  localStorage.setItem(NOTE_GROUPS_KEY, JSON.stringify(groups));
}

export function getGroupsFromStorage(): Group[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Group[];
    return parsed.map((g) => ({ ...g, expanded: g.expanded ?? true }));
  } catch {
    return [];
  }
}

export function setGroupsToStorage(groups: Group[]): void {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function getRunningTaskId(): string | null {
  return localStorage.getItem(RUNNING_TASK_ID_KEY);
}

export function setRunningTaskId(id: string | null): void {
  if (id) {
    localStorage.setItem(RUNNING_TASK_ID_KEY, id);
  } else {
    localStorage.removeItem(RUNNING_TASK_ID_KEY);
  }
}

export function getLastActiveTimestamp(): number | null {
  const val = localStorage.getItem(LAST_ACTIVE_KEY);
  return val ? parseInt(val, 10) : null;
}

export function setLastActiveTimestamp(ts: number | null): void {
  if (ts) {
    localStorage.setItem(LAST_ACTIVE_KEY, ts.toString());
  } else {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  }
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      dailyTargetMinutes:
        typeof parsed.dailyTargetMinutes === 'number' && parsed.dailyTargetMinutes > 0
          ? parsed.dailyTargetMinutes
          : DEFAULT_SETTINGS.dailyTargetMinutes,
      workingDays: Array.isArray(parsed.workingDays)
        ? parsed.workingDays
        : DEFAULT_SETTINGS.workingDays,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getWorkSessions(): WorkSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function setWorkSessions(sessions: WorkSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getActiveSession(): { taskId: string; startTime: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setActiveSession(session: { taskId: string; startTime: number } | null): void {
  if (session) {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}
