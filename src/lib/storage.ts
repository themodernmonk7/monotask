import type { CompletedTask, Note, Group } from "../types"

const COMPLETED_KEY = "monotask-completed"
const NOTES_KEY = "monotask-notes"
const GROUPS_KEY = "monotask-groups"

export function getCompletedTasks(): CompletedTask[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function setCompletedTasks(tasks: CompletedTask[]): void {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(tasks))
}

export function getNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function setNotes(notes: Note[]): void {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

export function getGroupsFromStorage(): Group[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Group[]
    return parsed.map((g) => ({ ...g, expanded: g.expanded ?? true }))
  } catch {
    return []
  }
}

export function setGroupsToStorage(groups: Group[]): void {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
}
