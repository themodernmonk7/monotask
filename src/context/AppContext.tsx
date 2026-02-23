import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import type { Group, CompletedTask, NoteGroup } from '../types';
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
  noteGroups: NoteGroup[];

  addGroup: (name: string) => void;
  removeGroup: (groupId: string) => void;
  reorderGroups: (startIndex: number, endIndex: number) => void;
  toggleGroupExpanded: (groupId: string) => void;
  addTask: (groupId: string, name: string) => void;
  reorderTasks: (groupId: string, startIndex: number, endIndex: number) => void;
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

  addNoteGroup: (title: string) => void;
  updateNoteGroupTitle: (groupId: string, title: string) => void;
  removeNoteGroup: (groupId: string) => void;
  addNote: (groupId: string, text: string) => void;
  toggleNote: (groupId: string, noteId: string) => void;
  updateNote: (groupId: string, noteId: string, text: string) => void;
  removeNote: (groupId: string, noteId: string) => void;

  updateCompletedTaskName: (completedTaskId: string, name: string) => void;
  updateCompletedTask: (completedTaskId: string, totalSeconds: number) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

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
  const [noteGroups, setNoteGroups] = useState<NoteGroup[]>(() => {
    const groups = storage.getNoteGroups();
    if (groups.length === 0) {
      return [{ id: 'general', title: 'General', notes: [] }];
    }
    return groups;
  });

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
  }, []);

  useEffect(() => {
    storage.setGroupsToStorage(groups);
  }, [groups]);

  useEffect(() => {
    storage.setCompletedTasks(completedTasks);
  }, [completedTasks]);

  useEffect(() => {
    storage.setNoteGroups(noteGroups);
    if (localStorage.getItem('monotask-notes')) {
      localStorage.removeItem('monotask-notes');
    }
  }, [noteGroups]);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseSecondsRef = useRef<number>(0);
  const groupsRef = useRef(groups);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(() => {
    if (!runningTaskId) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      startTimeRef.current = null;
      return;
    }

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
      { id: generateId(), name, tasks: [], expanded: true },
      ...prev,
    ]);
  }, []);

  const removeGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (runningTaskId) {
        const group = groupsRef.current.find((g) => g.id === groupId);
        const taskInGroup = group?.tasks.some((t) => t.id === runningTaskId);
        if (taskInGroup) {
          setRunningTaskIdState(null);
          setRunningTaskId(null);
          setLastActiveTimestamp(null);
        }
      }
    },
    [runningTaskId],
  );

  const reorderGroups = useCallback((startIndex: number, endIndex: number) => {
    setGroups((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

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

  const reorderTasks = useCallback(
    (groupId: string, startIndex: number, endIndex: number) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const newTasks = Array.from(g.tasks);
          const [removed] = newTasks.splice(startIndex, 1);
          newTasks.splice(endIndex, 0, removed);
          return { ...g, tasks: newTasks };
        }),
      );
    },
    [],
  );

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
      const group = groupsRef.current.find((g) => g.id === groupId);
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
    [runningTaskId],
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

  const addNoteGroup = useCallback((title: string) => {
    setNoteGroups((prev) => [...prev, { id: generateId(), title, notes: [] }]);
  }, []);

  const updateNoteGroupTitle = useCallback((groupId: string, title: string) => {
    setNoteGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, title } : g)),
    );
  }, []);

  const removeNoteGroup = useCallback((groupId: string) => {
    setNoteGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const addNote = useCallback((groupId: string, text: string) => {
    setNoteGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              notes: [{ id: generateId(), text, checked: false }, ...g.notes],
            }
          : g,
      ),
    );
  }, []);

  const toggleNote = useCallback((groupId: string, noteId: string) => {
    setNoteGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              notes: g.notes.map((n) =>
                n.id === noteId ? { ...n, checked: !n.checked } : n,
              ),
            }
          : g,
      ),
    );
  }, []);

  const updateNote = useCallback(
    (groupId: string, noteId: string, text: string) => {
      setNoteGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                notes: g.notes.map((n) =>
                  n.id === noteId ? { ...n, text } : n,
                ),
              }
            : g,
        ),
      );
    },
    [],
  );

  const removeNote = useCallback((groupId: string, noteId: string) => {
    setNoteGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) }
          : g,
      ),
    );
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      groups,
      runningTaskId,
      completedTasks,
      noteGroups,
      addGroup,
      removeGroup,
      reorderGroups,
      toggleGroupExpanded,
      addTask,
      reorderTasks,
      updateTaskElapsed,
      updateTaskName,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addNoteGroup,
      updateNoteGroupTitle,
      removeNoteGroup,
      addNote,
      toggleNote,
      updateNote,
      removeNote,
    }),
    [
      groups,
      runningTaskId,
      completedTasks,
      noteGroups,
      addGroup,
      removeGroup,
      reorderGroups,
      toggleGroupExpanded,
      addTask,
      reorderTasks,
      updateTaskElapsed,
      updateTaskName,
      removeTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addNoteGroup,
      updateNoteGroupTitle,
      removeNoteGroup,
      addNote,
      toggleNote,
      updateNote,
      removeNote,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
