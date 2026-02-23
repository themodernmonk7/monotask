import type { CompletedTask, Note, Group, NoteGroup } from '../types';

const COMPLETED_KEY = 'monotask-completed';
const NOTES_KEY = 'monotask-notes';
const NOTE_GROUPS_KEY = 'monotask-note-groups';
const GROUPS_KEY = 'monotask-groups';
const RUNNING_TASK_ID_KEY = 'monotask-running-task-id';
const LAST_ACTIVE_KEY = 'monotask-last-active';

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

    // Migration logic handle here or in AppContext?
    // Let's do it in AppContext to have access to generateId if needed,
    // but we can check for legacy notes here.
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
  // Clear legacy key once we have note groups?
  // Maybe better to do it in AppContext after we are sure.
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
