import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { Group, CompletedTask, Note } from "../types"
import * as storage from "../lib/storage"

interface AppContextValue {
  groups: Group[]
  runningTaskId: string | null
  completedTasks: CompletedTask[]
  notes: Note[]

  addGroup: (name: string) => void
  removeGroup: (groupId: string) => void
  toggleGroupExpanded: (groupId: string) => void
  addTask: (groupId: string, name: string) => void
  updateTaskElapsed: (groupId: string, taskId: string, elapsedSeconds: number) => void
  removeTask: (groupId: string, taskId: string) => void
  startTask: (groupId: string, taskId: string) => void
  pauseTask: () => void
  markTaskDone: (groupId: string, taskId: string) => void
  updateCompletedTask: (completedTaskId: string, totalSeconds: number) => void

  addNote: (text: string) => void
  toggleNote: (noteId: string) => void
  removeNote: (noteId: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<Group[]>(() => storage.getGroupsFromStorage())
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() =>
    storage.getCompletedTasks()
  )
  const [notes, setNotes] = useState<Note[]>(() => storage.getNotes())

  // Persist groups
  useEffect(() => {
    storage.setGroupsToStorage(groups)
  }, [groups])

  // Persist completed tasks
  useEffect(() => {
    storage.setCompletedTasks(completedTasks)
  }, [completedTasks])

  // Persist notes
  useEffect(() => {
    storage.setNotes(notes)
  }, [notes])

  // Global timer: tick every second for the running task
  useEffect(() => {
    if (!runningTaskId) return
    const interval = setInterval(() => {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          tasks: g.tasks.map((t) =>
            t.id === runningTaskId ? { ...t, elapsedSeconds: t.elapsedSeconds + 1 } : t
          ),
        }))
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [runningTaskId])

  const addGroup = useCallback((name: string) => {
    setGroups((prev) => [
      ...prev,
      { id: generateId(), name, tasks: [], expanded: true },
    ])
  }, [])

  const removeGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
    if (runningTaskId) {
      const group = groups.find((g) => g.id === groupId)
      const taskInGroup = group?.tasks.some((t) => t.id === runningTaskId)
      if (taskInGroup) setRunningTaskId(null)
    }
  }, [runningTaskId, groups])

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g))
    )
  }, [])

  const addTask = useCallback((groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tasks: [...g.tasks, { id: generateId(), name, elapsedSeconds: 0 }],
            }
          : g
      )
    )
  }, [])

  const updateTaskElapsed = useCallback((groupId: string, taskId: string, elapsedSeconds: number) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tasks: g.tasks.map((t) =>
                t.id === taskId ? { ...t, elapsedSeconds } : t
              ),
            }
          : g
      )
    )
  }, [])

  const removeTask = useCallback((groupId: string, taskId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) } : g
      )
    )
    if (runningTaskId === taskId) setRunningTaskId(null)
  }, [runningTaskId])

  const startTask = useCallback((_groupId: string, taskId: string) => {
    setRunningTaskId(taskId)
  }, [])

  const pauseTask = useCallback(() => {
    setRunningTaskId(null)
  }, [])

  const markTaskDone = useCallback((groupId: string, taskId: string) => {
    const group = groups.find((g) => g.id === groupId)
    const task = group?.tasks.find((t) => t.id === taskId)
    if (!group || !task) return
    if (runningTaskId === taskId) setRunningTaskId(null)
    setCompletedTasks((prev) => [
      ...prev,
      {
        id: generateId(),
        taskName: task.name,
        groupName: group.name,
        totalSeconds: task.elapsedSeconds,
        completedAt: Date.now(),
      },
    ])
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) } : g
      )
    )
  }, [groups, runningTaskId])

  const updateCompletedTask = useCallback((completedTaskId: string, totalSeconds: number) => {
    setCompletedTasks((prev) =>
      prev.map((t) =>
        t.id === completedTaskId ? { ...t, totalSeconds: Math.max(0, Math.floor(totalSeconds)) } : t
      )
    )
  }, [])

  const addNote = useCallback((text: string) => {
    setNotes((prev) => [...prev, { id: generateId(), text, checked: false }])
  }, [])

  const toggleNote = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, checked: !n.checked } : n))
    )
  }, [])

  const removeNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      groups,
      runningTaskId,
      completedTasks,
      notes,
      addGroup,
      removeGroup,
      toggleGroupExpanded,
      addTask,
      updateTaskElapsed,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTask,
      addNote,
      toggleNote,
      removeNote,
    }),
    [
      groups,
      runningTaskId,
      completedTasks,
      notes,
      addGroup,
      removeGroup,
      toggleGroupExpanded,
      addTask,
      updateTaskElapsed,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTask,
      addNote,
      toggleNote,
      removeNote,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
