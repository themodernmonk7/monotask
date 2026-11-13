/** Fixed palette so tag colours stay consistent and theme-safe. */
export const TAG_COLORS = [
  'slate',
  'red',
  'amber',
  'emerald',
  'sky',
  'violet',
  'pink',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/**
 * A tag from the user's shared library. Tasks reference these by id so one tag
 * can be reused across any number of tasks.
 */
export interface Tag {
  id: string;
  label: string;
  color: TagColor;
}

export interface Task {
  id: string;
  name: string;
  elapsedSeconds: number;
  description?: string;
  tagIds?: string[];
  /**
   * @deprecated Tags used to be embedded per task. Hoisted into the shared
   * library on load; kept only so that migration can read old records.
   */
  tags?: Tag[];
}

/** At most this many groups may be pinned at once. */
export const MAX_PINNED_GROUPS = 2;

export interface Group {
  id: string;
  name: string;
  tasks: Task[];
  expanded?: boolean;
  pinned?: boolean;
}

export interface CompletedTask {
  id: string;
  taskName: string;
  groupName: string;
  totalSeconds: number;
  completedAt: number;
  ticketId?: string;
  startTime?: number;
  endTime?: number;
  notes?: string;
}

export interface WorkSession {
  id: string;
  taskId: string;
  taskName: string;
  groupName: string;
  ticketId?: string;
  startTime: number; // unix timestamp ms
  endTime: number; // unix timestamp ms
  durationSeconds: number; // actual working duration
  notes?: string;
  completedTaskId?: string;
}

export interface AppSettings {
  dailyTargetMinutes: number; // e.g. 420 for 7 hours
  workingDays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat. Default: [1, 2, 3, 4, 5]
}

export type TargetStatus = 'below' | 'completed' | 'overtime';

export interface DailyTargetProgress {
  targetMinutes: number;
  targetSeconds: number;
  loggedSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  percentage: number;
  status: TargetStatus;
}

export interface Note {
  id: string;
  text: string;
  checked: boolean;
}

export interface NoteGroup {
  id: string;
  title: string;
  notes: Note[];
}

export type AppState = {
  groups: Group[];
  runningTaskId: string | null;
  completedTasks: CompletedTask[];
  noteGroups: NoteGroup[];
  sessions: WorkSession[];
  settings: AppSettings;
};
