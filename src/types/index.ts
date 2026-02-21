export interface Task {
  id: string
  name: string
  elapsedSeconds: number
}

export interface Group {
  id: string
  name: string
  tasks: Task[]
  expanded?: boolean
}

export interface CompletedTask {
  id: string
  taskName: string
  groupName: string
  totalSeconds: number
  completedAt: number
}

export interface Note {
  id: string
  text: string
  checked: boolean
}

export type AppState = {
  groups: Group[]
  runningTaskId: string | null
  completedTasks: CompletedTask[]
  notes: Note[]
}
