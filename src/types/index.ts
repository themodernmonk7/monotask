export interface Task {
  id: string;
  name: string;
  elapsedSeconds: number;
}

export interface Group {
  id: string;
  name: string;
  tasks: Task[];
  expanded?: boolean;
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
