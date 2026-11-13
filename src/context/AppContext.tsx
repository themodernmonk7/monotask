import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import type {
  Group,
  CompletedTask,
  NoteGroup,
  WorkSession,
  AppSettings,
  DailyTargetProgress,
} from '../types';
import * as storage from '../lib/storage';
import {
  getRunningTaskId,
  setRunningTaskId,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
} from '../lib/storage';
import {
  extractTicketId,
  getAllSlicesInRange,
  calculateDailyTargetProgress,
} from '../lib/analytics';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchUserData,
  syncGroupsToSupabase,
  syncCompletedTasksToSupabase,
  syncSessionsToSupabase,
  syncNoteGroupsToSupabase,
  syncSettingsToSupabase,
  syncActiveStateToSupabase,
} from '../lib/supabaseDb';

interface AppContextValue {
  groups: Group[];
  runningTaskId: string | null;
  completedTasks: CompletedTask[];
  noteGroups: NoteGroup[];
  sessions: WorkSession[];
  allSessions: WorkSession[];
  settings: AppSettings;
  todayProgress: DailyTargetProgress;
  activeSession: { taskId: string; startTime: number } | null;
  isSyncing: boolean;
  tablesMissing: boolean;

  updateSettings: (newSettings: Partial<AppSettings>) => void;
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
  const [groups, setGroups] = useState<Group[]>(() => {
    const loaded = storage.getGroupsFromStorage();
    const runningId = getRunningTaskId();
    const lastActive = getLastActiveTimestamp();
    if (runningId && lastActive) {
      const gapSeconds = Math.floor((Date.now() - lastActive) / 1000);
      if (gapSeconds > 0) {
        return loaded.map((g) => ({
          ...g,
          tasks: g.tasks.map((t) =>
            t.id === runningId
              ? { ...t, elapsedSeconds: t.elapsedSeconds + gapSeconds }
              : t,
          ),
        }));
      }
    }
    return loaded;
  });
  const [runningTaskId, setRunningTaskIdState] = useState<string | null>(() =>
    getRunningTaskId(),
  );
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() =>
    storage.getCompletedTasks(),
  );
  const [sessions, setSessions] = useState<WorkSession[]>(() =>
    storage.getWorkSessions(),
  );
  const [activeSession, setActiveSessionState] = useState<{
    taskId: string;
    startTime: number;
  } | null>(() => storage.getActiveSession());
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    storage.getSettings(),
  );
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());

  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [tablesMissing, setTablesMissing] = useState(false);
  const initialFetchDoneRef = useRef(false);

  const [noteGroups, setNoteGroups] = useState<NoteGroup[]>(() => {
    const loaded = storage.getNoteGroups();
    if (loaded.length === 0) {
      return [{ id: 'general', title: 'General', notes: [] }];
    }
    return loaded;
  });

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseSecondsRef = useRef<number>(0);
  const groupsRef = useRef(groups);
  const activeSessionRef = useRef(activeSession);
  const completedTasksRef = useRef(completedTasks);
  const sessionsRef = useRef(sessions);
  const noteGroupsRef = useRef(noteGroups);
  const settingsRef = useRef(settings);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    completedTasksRef.current = completedTasks;
  }, [completedTasks]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    noteGroupsRef.current = noteGroups;
  }, [noteGroups]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Sync from Supabase when user logs in
  useEffect(() => {
    if (!user) {
      initialFetchDoneRef.current = false;
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setIsSyncing(true);
    });

    fetchUserData(user.id).then(({ data, tablesMissing }) => {
      if (!isMounted) return;
      setIsSyncing(false);

      if (tablesMissing) {
        setTablesMissing(true);
        return;
      }
      setTablesMissing(false);

      if (data) {
        const hasRemote =
          data.groups.length > 0 ||
          data.completedTasks.length > 0 ||
          data.sessions.length > 0 ||
          data.noteGroups.length > 0;

        if (hasRemote) {
          if (data.groups.length > 0) setGroups(data.groups);
          if (data.completedTasks.length > 0) setCompletedTasks(data.completedTasks);
          if (data.sessions.length > 0) setSessions(data.sessions);
          if (data.noteGroups.length > 0) setNoteGroups(data.noteGroups);
          if (data.settings) setSettingsState(data.settings);
        } else {
          // If remote is empty, migrate current local state to Supabase
          if (groupsRef.current.length > 0) syncGroupsToSupabase(user.id, groupsRef.current);
          if (completedTasksRef.current.length > 0) syncCompletedTasksToSupabase(user.id, completedTasksRef.current);
          if (sessionsRef.current.length > 0) syncSessionsToSupabase(user.id, sessionsRef.current);
          if (noteGroupsRef.current.length > 0) syncNoteGroupsToSupabase(user.id, noteGroupsRef.current);
          syncSettingsToSupabase(user.id, settingsRef.current);
        }
        initialFetchDoneRef.current = true;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    storage.setGroupsToStorage(groups);
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncGroupsToSupabase(user.id, groups);
    }
  }, [groups, user, tablesMissing]);

  useEffect(() => {
    storage.setCompletedTasks(completedTasks);
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncCompletedTasksToSupabase(user.id, completedTasks);
    }
  }, [completedTasks, user, tablesMissing]);

  useEffect(() => {
    storage.setWorkSessions(sessions);
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncSessionsToSupabase(user.id, sessions);
    }
  }, [sessions, user, tablesMissing]);

  useEffect(() => {
    storage.setActiveSession(activeSession);
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncActiveStateToSupabase(
        user.id,
        runningTaskId,
        getLastActiveTimestamp(),
        activeSession?.startTime || null
      );
    }
  }, [activeSession, runningTaskId, user, tablesMissing]);

  useEffect(() => {
    storage.setSettings(settings);
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncSettingsToSupabase(user.id, settings);
    }
  }, [settings, user, tablesMissing]);

  useEffect(() => {
    storage.setNoteGroups(noteGroups);
    if (localStorage.getItem('monotask-notes')) {
      localStorage.removeItem('monotask-notes');
    }
    if (user && !tablesMissing && initialFetchDoneRef.current) {
      syncNoteGroupsToSupabase(user.id, noteGroups);
    }
  }, [noteGroups, user, tablesMissing]);


  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // Active Timer Tick
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
        setNowTimestamp(now);
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

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const updated: AppSettings = {
        ...prev,
        ...newSettings,
        dailyTargetMinutes:
          newSettings.dailyTargetMinutes !== undefined &&
          newSettings.dailyTargetMinutes > 0
            ? newSettings.dailyTargetMinutes
            : prev.dailyTargetMinutes,
        workingDays:
          newSettings.workingDays !== undefined
            ? newSettings.workingDays
            : prev.workingDays,
      };
      return updated;
    });
  }, []);

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
          setActiveSessionState(null);
          storage.setActiveSession(null);
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
      // Also update any active session or sessions with this taskId
      setSessions((prev) =>
        prev.map((s) =>
          s.taskId === taskId
            ? {
                ...s,
                taskName: name,
                ticketId: extractTicketId(name) || undefined,
              }
            : s,
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
        setActiveSessionState(null);
        storage.setActiveSession(null);
      }
    },
    [runningTaskId],
  );

  const startTask = useCallback((_groupId: string, taskId: string) => {
    // If a different task was running, pause it first
    const currentActive = activeSessionRef.current || storage.getActiveSession();
    const now = Date.now();

    if (currentActive && currentActive.taskId !== taskId) {
      const duration = Math.floor((now - currentActive.startTime) / 1000);
      if (duration > 0) {
        const prevGroup = groupsRef.current.find((g) =>
          g.tasks.some((t) => t.id === currentActive.taskId),
        );
        const prevTask = prevGroup?.tasks.find(
          (t) => t.id === currentActive.taskId,
        );
        if (prevTask && prevGroup) {
          const finishedSession: WorkSession = {
            id: generateId(),
            taskId: prevTask.id,
            taskName: prevTask.name,
            groupName: prevGroup.name,
            ticketId: extractTicketId(prevTask.name) || undefined,
            startTime: currentActive.startTime,
            endTime: now,
            durationSeconds: duration,
          };
          setSessions((prev) => [finishedSession, ...prev]);
        }
      }
    }

    setRunningTaskIdState(taskId);
    setRunningTaskId(taskId);
    setLastActiveTimestamp(now);

    const newActive = { taskId, startTime: now };
    setActiveSessionState(newActive);
    storage.setActiveSession(newActive);
  }, []);

  const pauseTask = useCallback(() => {
    const currentActive = activeSessionRef.current || storage.getActiveSession();
    const now = Date.now();

    if (currentActive) {
      const duration = Math.floor((now - currentActive.startTime) / 1000);
      if (duration > 0) {
        const group = groupsRef.current.find((g) =>
          g.tasks.some((t) => t.id === currentActive.taskId),
        );
        const task = group?.tasks.find((t) => t.id === currentActive.taskId);
        if (task && group) {
          const newSession: WorkSession = {
            id: generateId(),
            taskId: task.id,
            taskName: task.name,
            groupName: group.name,
            ticketId: extractTicketId(task.name) || undefined,
            startTime: currentActive.startTime,
            endTime: now,
            durationSeconds: duration,
          };
          setSessions((prev) => [newSession, ...prev]);
        }
      }
    }

    setRunningTaskIdState(null);
    setRunningTaskId(null);
    setLastActiveTimestamp(null);
    setActiveSessionState(null);
    storage.setActiveSession(null);
  }, []);

  const markTaskDone = useCallback(
    (groupId: string, taskId: string) => {
      const group = groupsRef.current.find((g) => g.id === groupId);
      const task = group?.tasks.find((t) => t.id === taskId);
      if (!group || !task) return;

      const currentActive = activeSessionRef.current || storage.getActiveSession();
      const now = Date.now();
      const completedId = generateId();

      if (currentActive && currentActive.taskId === taskId) {
        const duration = Math.floor((now - currentActive.startTime) / 1000);
        if (duration > 0) {
          const newSession: WorkSession = {
            id: generateId(),
            taskId: task.id,
            taskName: task.name,
            groupName: group.name,
            ticketId: extractTicketId(task.name) || undefined,
            startTime: currentActive.startTime,
            endTime: now,
            durationSeconds: duration,
            completedTaskId: completedId,
          };
          setSessions((prev) => [newSession, ...prev]);
        }
      }

      if (runningTaskId === taskId) {
        setRunningTaskIdState(null);
        setRunningTaskId(null);
        setLastActiveTimestamp(null);
        setActiveSessionState(null);
        storage.setActiveSession(null);
      }

      setCompletedTasks((prev) => [
        ...prev,
        {
          id: completedId,
          taskName: task.name,
          groupName: group.name,
          totalSeconds: task.elapsedSeconds,
          completedAt: now,
          ticketId: extractTicketId(task.name) || undefined,
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
      const ticketId = extractTicketId(taskName) || undefined;
      setCompletedTasks((prev) =>
        prev.map((t) =>
          t.id === completedTaskId ? { ...t, taskName, ticketId } : t,
        ),
      );
      setSessions((prev) =>
        prev.map((s) =>
          s.completedTaskId === completedTaskId
            ? { ...s, taskName, ticketId }
            : s,
        ),
      );
    },
    [],
  );

  const updateCompletedTask = useCallback(
    (completedTaskId: string, totalSeconds: number) => {
      const sanitized = Math.max(0, Math.floor(totalSeconds));
      setCompletedTasks((prev) =>
        prev.map((t) =>
          t.id === completedTaskId ? { ...t, totalSeconds: sanitized } : t,
        ),
      );
      // Synchronize associated session duration
      setSessions((prev) => {
        const hasSession = prev.some((s) => s.completedTaskId === completedTaskId);
        if (hasSession) {
          return prev.map((s) =>
            s.completedTaskId === completedTaskId
              ? {
                  ...s,
                  durationSeconds: sanitized,
                  endTime: s.startTime + sanitized * 1000,
                }
              : s,
          );
        }
        return prev;
      });
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

  // Compute all unified sessions (canonical single source of truth)
  const allSessions = useMemo<WorkSession[]>(() => {
    const list: WorkSession[] = [...sessions];
    const coveredCompletedTaskIds = new Set(
      sessions
        .filter((s) => s.completedTaskId)
        .map((s) => s.completedTaskId as string),
    );

    // 1. Synthesize sessions for legacy completed tasks that don't have dedicated session records
    for (const ct of completedTasks) {
      if (!coveredCompletedTaskIds.has(ct.id)) {
        const dur = Math.max(0, ct.totalSeconds);
        const end = ct.endTime || ct.completedAt || nowTimestamp;
        const start = ct.startTime || end - dur * 1000;
        list.push({
          id: `legacy-${ct.id}`,
          taskId: ct.id,
          taskName: ct.taskName,
          groupName: ct.groupName,
          ticketId: ct.ticketId || extractTicketId(ct.taskName) || undefined,
          startTime: start,
          endTime: end,
          durationSeconds: dur,
          notes: ct.notes,
          completedTaskId: ct.id,
        });
      }
    }

    // 2. Synthesize session for active in-progress tasks in groups that have elapsedSeconds not yet recorded
    const sessionSecondsByTaskId = new Map<string, number>();
    for (const s of sessions) {
      sessionSecondsByTaskId.set(
        s.taskId,
        (sessionSecondsByTaskId.get(s.taskId) || 0) + s.durationSeconds,
      );
    }

    const now = nowTimestamp;
    for (const group of groups) {
      for (const task of group.tasks) {
        const recordedSeconds = sessionSecondsByTaskId.get(task.id) || 0;
        // If task is actively running, the active running segment is added separately below
        const activeNowSeconds =
          runningTaskId === task.id && activeSession
            ? Math.max(0, Math.floor((now - activeSession.startTime) / 1000))
            : 0;

        const unrecordedSeconds = task.elapsedSeconds - recordedSeconds - activeNowSeconds;
        if (unrecordedSeconds > 0) {
          list.push({
            id: `task-accum-${task.id}`,
            taskId: task.id,
            taskName: task.name,
            groupName: group.name,
            ticketId: extractTicketId(task.name) || undefined,
            startTime: now - unrecordedSeconds * 1000,
            endTime: now,
            durationSeconds: unrecordedSeconds,
          });
        }
      }
    }

    // 3. Current active live timer segment
    if (runningTaskId && activeSession) {
      const activeDuration = Math.max(
        0,
        Math.floor((now - activeSession.startTime) / 1000),
      );
      if (activeDuration > 0) {
        const group = groups.find((g) =>
          g.tasks.some((t) => t.id === runningTaskId),
        );
        const task = group?.tasks.find((t) => t.id === runningTaskId);
        if (task && group) {
          list.push({
            id: `active-live-${task.id}`,
            taskId: task.id,
            taskName: task.name,
            groupName: group.name,
            ticketId: extractTicketId(task.name) || undefined,
            startTime: activeSession.startTime,
            endTime: now,
            durationSeconds: activeDuration,
          });
        }
      }
    }

    return list;
  }, [sessions, completedTasks, groups, runningTaskId, activeSession, nowTimestamp]);

  // Live Today's Target Progress
  const todayProgress = useMemo<DailyTargetProgress>(() => {
    const today = new Date(nowTimestamp);
    const todaySlices = getAllSlicesInRange(allSessions, today, today);
    const totalWorkingSeconds = todaySlices.reduce(
      (sum, s) => sum + s.durationSeconds,
      0,
    );
    return calculateDailyTargetProgress(
      totalWorkingSeconds,
      settings.dailyTargetMinutes,
    );
  }, [allSessions, settings.dailyTargetMinutes, nowTimestamp]);

  const value = useMemo<AppContextValue>(
    () => ({
      groups,
      runningTaskId,
      completedTasks,
      noteGroups,
      sessions,
      allSessions,
      settings,
      todayProgress,
      activeSession,
      isSyncing,
      tablesMissing,
      updateSettings,
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
      sessions,
      allSessions,
      settings,
      todayProgress,
      activeSession,
      isSyncing,
      tablesMissing,
      updateSettings,
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
