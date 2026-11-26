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
  /**
   * In the UI: the task's derived total (see lib/timeModel.ts). In storage:
   * kept only so older app versions still read something sensible — current
   * code never trusts the stored value except to migrate it once.
   */
  elapsedSeconds: number;
  /** Time that predates recorded sessions. Fixed once migrated. */
  baseSeconds?: number;
  /** When baseSeconds was migrated, so reports place it on one day, not "today" forever. */
  baseAt?: number;
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
  /** Unset reads as a neutral default, same as a task with no tags. */
  color?: TagColor;
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
  /** Plays a short sound on a repeating interval while a timer is running. Off by default. */
  timerReminderEnabled: boolean;
  /** Minutes between reminder sounds while a timer runs. */
  timerReminderMinutes: number;
  /** Defaults to 'dark' to preserve the app's original always-dark look. */
  theme: 'light' | 'dark';
  /** IANA zone the reminder times are in; kept in step with the device. */
  timezone: string;
  /** Push "were you working while away?" when a timer runs unattended. */
  idlePushEnabled: boolean;
  /** Push one summary of open tasks at set times. */
  pendingReminderEnabled: boolean;
  /** 'HH:mm', first reminder of the day. */
  pendingReminderStart: string;
  pendingReminderIntervalMinutes: number;
  /** Reminders per day, at most. */
  pendingReminderCount: number;
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
