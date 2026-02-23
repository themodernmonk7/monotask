import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import type { Group, CompletedTask, Note } from '../types';
import * as storage from '../lib/storage';
import {
  getRunningTaskId,
  setRunningTaskId,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
} from '../lib/storage';

interface AppContextValue {
  groups: Group[];
  runningTaskId: string | null;
  completedTasks: CompletedTask[];
  notes: Note[];

  addGroup: (name: string) => void;
  removeGroup: (groupId: string) => void;
  toggleGroupExpanded: (groupId: string) => void;
  addTask: (groupId: string, name: string) => void;
  updateTaskElapsed: (
    groupId: string,
    taskId: string,
    elapsedSeconds: number,
  ) => void;
  updateTaskName: (groupId: string, taskId: string, name: string) => void;
  removeTask: (groupId: string, taskId: string) => void;
  startTask: (groupId: string, taskId: string) => void;
  pauseTask: () => void;
  markTaskDone: (groupId: string, taskId: string) => void;
  addNote: (text: string) => void;
  toggleNote: (noteId: string) => void;
  updateNote: (noteId: string, text: string) => void;
  removeNote: (noteId: string) => void;

  updateCompletedTaskName: (completedTaskId: string, name: string) => void;
  updateCompletedTask: (completedTaskId: string, totalSeconds: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<Group[]>(() =>
    storage.getGroupsFromStorage(),
  );
  const [runningTaskId, setRunningTaskIdState] = useState<string | null>(() =>
    getRunningTaskId(),
  );
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() =>
    storage.getCompletedTasks(),
  );
  const [notes, setNotes] = useState<Note[]>(() => storage.getNotes());

  // Handle persistence and gap calculation on load
  useEffect(() => {
    const runningId = getRunningTaskId();
    const lastActive = getLastActiveTimestamp();

    if (runningId && lastActive) {
      const gapSeconds = Math.floor((Date.now() - lastActive) / 1000);
      if (gapSeconds > 0) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) =>
              t.id === runningId
                ? { ...t, elapsedSeconds: t.elapsedSeconds + gapSeconds }
                : t,
            ),
          })),
        );
      }
    }
  }, []); // Run once on mount

  // Persist groups
  useEffect(() => {
    storage.setGroupsToStorage(groups);
  }, [groups]);

  // Persist completed tasks
  useEffect(() => {
    storage.setCompletedTasks(completedTasks);
  }, [completedTasks]);

  // Persist notes
  useEffect(() => {
    storage.setNotes(notes);
  }, [notes]);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseSecondsRef = useRef<number>(0);
  const groupsRef = useRef(groups);

  // Keep groupsRef in sync
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Global timer: tick every second for the running task
  useEffect(() => {
    if (!runningTaskId) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      startTimeRef.current = null;
      return;
    }

    // Capture the state when we start/resume
    const task = groupsRef.current
      .flatMap((g) => g.tasks)
      .find((t) => t.id === runningTaskId);
    baseSecondsRef.current = task ? task.elapsedSeconds : 0;
    startTimeRef.current = Date.now();

    let lastSecondReported = -1;

    const tick = () => {
      if (!startTimeRef.current) return;

      const now = Date.now();
      const elapsedSinceStart = Math.floor((now - startTimeRef.current) / 1000);
      const totalElapsed = baseSecondsRef.current + elapsedSinceStart;

      // Update state only when the second changes to avoid unnecessary re-renders
      if (totalElapsed !== lastSecondReported) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) =>
              t.id === runningTaskId
                ? { ...t, elapsedSeconds: totalElapsed }
                : t,
            ),
          })),
        );
        setLastActiveTimestamp(now);
        lastSecondReported = totalElapsed;
      }

      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [runningTaskId]);

  const addGroup = useCallback((name: string) => {
    setGroups((prev) => [
      ...prev,
      { id: generateId(), name, tasks: [], expanded: true },
    ]);
  }, []);

  const removeGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (runningTaskId) {
        const group = groups.find((g) => g.id === groupId);
        const taskInGroup = group?.tasks.some((t) => t.id === runningTaskId);
        if (taskInGroup) {
          setRunningTaskIdState(null);
          setRunningTaskId(null);
          setLastActiveTimestamp(null);
        }
      }
    },
    [runningTaskId, groups],
  );

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g)),
    );
  }, []);

  const addTask = useCallback((groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tasks: [
                { id: generateId(), name, elapsedSeconds: 0 },
                ...g.tasks,
              ],
            }
          : g,
      ),
    );
  }, []);

  const updateTaskElapsed = useCallback(
    (groupId: string, taskId: string, elapsedSeconds: number) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                tasks: g.tasks.map((t) =>
                  t.id === taskId ? { ...t, elapsedSeconds } : t,
                ),
              }
            : g,
        ),
      );
    },
    [],
  );

  const updateTaskName = useCallback(
    (groupId: string, taskId: string, name: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                tasks: g.tasks.map((t) =>
                  t.id === taskId ? { ...t, name } : t,
                ),
              }
            : g,
        ),
      );
    },
    [],
  );

  const removeTask = useCallback(
    (groupId: string, taskId: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }
            : g,
        ),
      );
      if (runningTaskId === taskId) {
        setRunningTaskIdState(null);
        setRunningTaskId(null);
        setLastActiveTimestamp(null);
      }
    },
    [runningTaskId],
  );

  const startTask = useCallback((_groupId: string, taskId: string) => {
    setRunningTaskIdState(taskId);
    setRunningTaskId(taskId);
    setLastActiveTimestamp(Date.now());
  }, []);

  const pauseTask = useCallback(() => {
    setRunningTaskIdState(null);
    setRunningTaskId(null);
    setLastActiveTimestamp(null);
  }, []);

  const markTaskDone = useCallback(
    (groupId: string, taskId: string) => {
      const group = groups.find((g) => g.id === groupId);
      const task = group?.tasks.find((t) => t.id === taskId);
      if (!group || !task) return;
      if (runningTaskId === taskId) {
        setRunningTaskIdState(null);
        setRunningTaskId(null);
        setLastActiveTimestamp(null);
      }
      setCompletedTasks((prev) => [
        ...prev,
        {
          id: generateId(),
          taskName: task.name,
          groupName: group.name,
          totalSeconds: task.elapsedSeconds,
          completedAt: Date.now(),
        },
      ]);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }
            : g,
        ),
      );
    },
    [groups, runningTaskId],
  );

  const updateCompletedTaskName = useCallback(
    (completedTaskId: string, taskName: string) => {
      setCompletedTasks((prev) =>
        prev.map((t) => (t.id === completedTaskId ? { ...t, taskName } : t)),
      );
    },
    [],
  );

  const updateCompletedTask = useCallback(
    (completedTaskId: string, totalSeconds: number) => {
      setCompletedTasks((prev) =>
        prev.map((t) =>
          t.id === completedTaskId
            ? { ...t, totalSeconds: Math.max(0, Math.floor(totalSeconds)) }
            : t,
        ),
      );
    },
    [],
  );

  const addNote = useCallback((text: string) => {
    setNotes((prev) => [{ id: generateId(), text, checked: false }, ...prev]);
  }, []);

  const toggleNote = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, checked: !n.checked } : n)),
    );
  }, []);

  const updateNote = useCallback((noteId: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, text } : n)));
  }, []);

  const removeNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

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
      updateTaskName,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addNote,
      toggleNote,
      updateNote,
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
      updateTaskName,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addNote,
      toggleNote,
      updateNote,
      removeNote,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
