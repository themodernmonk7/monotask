import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Group,
  CompletedTask,
  NoteGroup,
  WorkSession,
  AppSettings,
  DailyTargetProgress,
  TagColor,
  Tag,
} from '../types';
import {
  extractTicketId,
  getAllSlicesInRange,
  calculateDailyTargetProgress,
} from '../lib/analytics';
import { useAuth } from '@/hooks/useAuth';
import {
  DEFAULT_SETTINGS,
  fetchUserData,
  persistActiveState,
  persistCompletedTasks,
  persistGroups,
  persistNoteGroups,
  persistSessions,
  persistSettings,
  persistTags,
} from '../lib/supabaseDb';
import type { ActiveState } from '../lib/supabaseDb';
import { useOptimisticState } from '@/hooks/useOptimisticState';
import type { PersistGate } from '@/hooks/useOptimisticState';
import { SyncQueue, isTransientError } from '@/lib/syncQueue';
import { readCache, writeCache } from '@/lib/localCache';
import { deriveAllSessions } from '@/lib/sessionDerivation';
import { resolveIdleAdjustment } from '@/lib/idleResolution';
import {
  adjustTaskElapsed as adjustTaskElapsedIn,
  applySessionPatch,
  mapTask,
  migrateLegacyTags,
  moveTaskBetweenGroups,
  pinnedFirst,
  removeTagFromTasks,
  toggleGroupPinned as toggleGroupPinnedIn,
} from '@/lib/taskMutations';
import type { UserDbData } from '../lib/supabaseDb';

/** How often running-timer progress is checkpointed to the server. */
const HEARTBEAT_MS = 30_000;

/** A running timer unattended for longer than this asks before counting it. */
const IDLE_THRESHOLD_SECONDS = 5 * 60;

/** How long the undo affordance stays on screen. */
const UNDO_WINDOW_MS = 8_000;

const EMPTY_ACTIVE_STATE: ActiveState = {
  runningTaskId: null,
  lastActiveTimestamp: null,
  activeSessionStart: null,
};

interface AppContextValue {
  groups: Group[];
  runningTaskId: string | null;
  completedTasks: CompletedTask[];
  noteGroups: NoteGroup[];
  tags: Tag[];
  sessions: WorkSession[];
  allSessions: WorkSession[];
  settings: AppSettings;
  todayProgress: DailyTargetProgress;
  activeSession: { taskId: string; startTime: number } | null;
  isLoading: boolean;
  isSyncing: boolean;
  tablesMissing: boolean;
  loadError: string | null;
  /** True while nothing can be saved — schema missing or the initial load failed. */
  isSaveBlocked: boolean;
  retryLoad: () => void;
  /** Writes waiting on the network to come back. */
  pendingWrites: number;
  /** Running on cached data because the server could not be reached. */
  isOffline: boolean;
  /** When the cached snapshot shown offline was captured. */
  lastSyncedAt: number | null;
  syncError: string | null;
  dismissSyncError: () => void;
  pinnedGroupCount: number;

  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addGroup: (name: string) => void;
  removeGroup: (groupId: string) => void;
  reorderGroups: (startIndex: number, endIndex: number) => void;
  toggleGroupExpanded: (groupId: string) => void;
  toggleGroupPinned: (groupId: string) => void;
  addTask: (groupId: string, name: string) => void;
  reorderTasks: (groupId: string, startIndex: number, endIndex: number) => void;
  updateTaskElapsed: (
    groupId: string,
    taskId: string,
    elapsedSeconds: number,
  ) => void;
  updateTaskName: (groupId: string, taskId: string, name: string) => void;
  updateTaskDescription: (
    groupId: string,
    taskId: string,
    description: string,
  ) => void;
  /** Creates a tag in the shared library and returns it (or the existing match). */
  createTag: (label: string, color: TagColor) => Tag | null;
  deleteTag: (tagId: string) => void;
  toggleTaskTag: (groupId: string, taskId: string, tagId: string) => void;
  removeTask: (groupId: string, taskId: string) => void;
  moveTask: (fromGroupId: string, toGroupId: string, taskId: string) => void;
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

  /** Manual time entry and corrections to recorded sessions. */
  addManualSession: (input: ManualSessionInput) => void;
  updateSession: (sessionId: string, patch: SessionPatch) => void;
  removeSession: (sessionId: string) => void;

  /** One-level undo for destructive actions. */
  undoLabel: string | null;
  undo: () => void;
  dismissUndo: () => void;

  /** Set when a timer appears to have run while the user was away. */
  idlePrompt: IdlePrompt | null;
  resolveIdle: (decision: 'keep' | 'discard') => void;
}

export interface ManualSessionInput {
  groupId?: string;
  taskId?: string;
  taskName: string;
  groupName: string;
  startTime: number;
  endTime: number;
  notes?: string;
}

export interface SessionPatch {
  startTime?: number;
  endTime?: number;
  notes?: string;
}

export interface IdlePrompt {
  taskId: string;
  taskName: string;
  idleSeconds: number;
  since: number;
  /**
   * True when the idle time is already inside the task's elapsedSeconds (the
   * tab was open and the tick resumed), false when it was never credited (a
   * gap restored from the server). Decides which way resolveIdle adjusts.
   */
  alreadyCounted: boolean;
}

export const AppContext = createContext<AppContextValue | null>(null);

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [idlePrompt, setIdlePromptState] = useState<IdlePrompt | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());

  // Writes stay gated until the first read lands, so an empty initial render
  // can never overwrite real server data.
  const queueRef = useRef<SyncQueue>(new SyncQueue());
  const [pendingWrites, setPendingWrites] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  // Any local edit that has not round-tripped since the last successful load.
  // Queue size alone is not enough: a background retry can drain it between
  // reconnecting and this handler running, after which a refetch would
  // overwrite the very edit that was just sent.
  const dirtySinceLoadRef = useRef(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const queue = queueRef.current;
    const unsubscribe = queue.subscribe(() => {
      if (queue.size > 0) dirtySinceLoadRef.current = true;
      setPendingWrites(queue.size);
    });
    return () => {
      unsubscribe();
      queue.stop();
    };
  }, []);

  const gateRef = useRef<PersistGate>({ userId: null, ready: false });
  // Marked the moment any write is attempted — see dirtySinceLoadRef.
  const markDirtyRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    markDirtyRef.current = () => {
      dirtySinceLoadRef.current = true;
    };
  }, []);
  const onSyncError = useRef<(message: string) => void>(() => {});
  useEffect(() => {
    onSyncError.current = (message: string) => setSyncError(message);
  }, []);

  const optimisticOptions = useMemo(
    () => ({
      gateRef,
      onErrorRef: onSyncError,
      queueRef,
      onWriteAttemptRef: markDirtyRef,
    }),
    [],
  );

  const groupsState = useOptimisticState<Group[]>(
    'groups',
    [],
    persistGroups,
    optimisticOptions,
  );
  const completedState = useOptimisticState<CompletedTask[]>(
    'completedTasks',
    [],
    persistCompletedTasks,
    optimisticOptions,
  );
  const sessionsState = useOptimisticState<WorkSession[]>(
    'sessions',
    [],
    persistSessions,
    optimisticOptions,
  );
  const noteGroupsState = useOptimisticState<NoteGroup[]>(
    'noteGroups',
    [],
    persistNoteGroups,
    optimisticOptions,
  );
  const tagsState = useOptimisticState<Tag[]>(
    'tags',
    [],
    persistTags,
    optimisticOptions,
  );
  const settingsState = useOptimisticState<AppSettings>(
    'settings',
    DEFAULT_SETTINGS,
    persistSettings,
    optimisticOptions,
  );
  const activeState = useOptimisticState<ActiveState>(
    'activeState',
    EMPTY_ACTIVE_STATE,
    persistActiveState,
    optimisticOptions,
  );

  const groups = groupsState.value;
  const completedTasks = completedState.value;
  const sessions = sessionsState.value;
  const noteGroups = noteGroupsState.value;
  const tags = tagsState.value;
  const settings = settingsState.value;

  const runningTaskId = activeState.value.runningTaskId;
  const activeSessionStart = activeState.value.activeSessionStart;

  const activeSession = useMemo(
    () =>
      runningTaskId && activeSessionStart
        ? { taskId: runningTaskId, startTime: activeSessionStart }
        : null,
    [runningTaskId, activeSessionStart],
  );

  const idlePromptRef = useRef<IdlePrompt | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const undoRestoreRef = useRef<(() => void) | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const pendingLegacyMigration = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseSecondsRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Initial load — the single read path
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    let alive = true;
    gateRef.current = { userId: user.id, ready: false };
    setIsLoading(true);
    setLoadError(null);

    const hydrate = (data: UserDbData, fromCache: boolean) => {
      // Credit time that passed while the app was closed with a timer running.
      const gapSeconds = data.activeState?.lastActiveTimestamp
        ? Math.floor((Date.now() - data.activeState.lastActiveTimestamp) / 1000)
        : 0;
      const restoredRunningId = data.activeState?.runningTaskId ?? null;

      // Only credit a short gap automatically; anything longer gets confirmed,
      // otherwise a timer left running overnight silently inflates the day.
      const autoCredit =
        Boolean(restoredRunningId) &&
        gapSeconds > 0 &&
        gapSeconds <= IDLE_THRESHOLD_SECONDS;

      const credited =
        autoCredit
          ? data.groups.map((g) => ({
              ...g,
              tasks: g.tasks.map((t) =>
                t.id === restoredRunningId
                  ? { ...t, elapsedSeconds: t.elapsedSeconds + gapSeconds }
                  : t,
              ),
            }))
          : data.groups;

      const { groups: migratedGroups, tags: migratedTags } = migrateLegacyTags(
        credited,
        data.tags,
      );

      groupsState.set(pinnedFirst(migratedGroups));

      if (
        restoredRunningId &&
        gapSeconds > IDLE_THRESHOLD_SECONDS &&
        data.activeState?.lastActiveTimestamp
      ) {
        const runningTask = data.groups
          .flatMap((g) => g.tasks)
          .find((t) => t.id === restoredRunningId);
        setIdlePrompt({
          taskId: restoredRunningId,
          taskName: runningTask?.name ?? 'your task',
          idleSeconds: gapSeconds,
          since: data.activeState.lastActiveTimestamp,
          alreadyCounted: false,
        });
      }
      tagsState.set(migratedTags);
      if (migratedTags.length !== data.tags.length) {
        // Legacy tags were hoisted out of tasks — push both sides back up.
        pendingLegacyMigration.current = true;
      }
      completedState.set(data.completedTasks);
      sessionsState.set(data.sessions);
      noteGroupsState.set(
        data.noteGroups.length
          ? data.noteGroups
          : [{ id: 'general', title: 'General', notes: [] }],
      );
      settingsState.set(data.settings);
      activeState.set(data.activeState ?? EMPTY_ACTIVE_STATE);

      // Reads are done; writes may now proceed. Deliberately true for a
      // cache-backed start too: edits must be accepted and queued, otherwise
      // working offline silently loses everything.
      gateRef.current = { userId: user.id, ready: true };

      if (!fromCache && pendingLegacyMigration.current) {
        pendingLegacyMigration.current = false;
        tagsState.flush();
        groupsState.flush();
      }
    };

    fetchUserData(user.id).then(({ data, error, tablesMissing: missing }) => {
      if (!alive) return;

      setIsLoading(false);
      setTablesMissing(missing);

      if (data && !missing && !error) {
        setIsOffline(false);
        setLastSyncedAt(Date.now());
        dirtySinceLoadRef.current = false;
        hydrate(data, false);
        writeCache(user.id, data); // refresh the offline snapshot
        return;
      }

      if (missing) return;

      // Server unreachable but we have a snapshot: run from it rather than
      // spinning forever. Only for transient failures — a rejection means the
      // server answered, and cached data would be the wrong thing to show.
      const cached =
        !error || isTransientError(error) ? readCache(user.id) : null;

      if (cached) {
        setIsOffline(true);
        setLastSyncedAt(cached.savedAt);
        hydrate(cached.data, true);
        return;
      }

      // Nothing cached — the gate stays shut, because writing from empty
      // local state would overwrite real server data. Recovery is retryLoad().
      setLoadError(error || 'Could not load your data.');
    });

    return () => {
      alive = false;
      gateRef.current = { userId: user.id, ready: false };
    };
    // Slice helpers are stable; re-running on them would refetch needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, reloadNonce]);

  // ---------------------------------------------------------------------------
  // Offline snapshot + reconnection
  // ---------------------------------------------------------------------------

  // Mirror current state into the cache so edits made offline survive a
  // reload. Debounced because a running timer touches `groups` every second
  // and localStorage writes are synchronous.
  useEffect(() => {
    const gate = gateRef.current;
    if (!gate.userId || !gate.ready) return;

    const userId = gate.userId;
    const timeout = window.setTimeout(() => {
      writeCache(userId, {
        groups: groupsState.ref.current,
        completedTasks: completedState.ref.current,
        sessions: sessionsState.ref.current,
        noteGroups: noteGroupsState.ref.current,
        tags: tagsState.ref.current,
        settings: settingsState.ref.current,
        activeState: activeState.ref.current,
      });
    }, 3_000);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, completedTasks, sessions, noteGroups, tags, settings, activeState.value]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);

    const goOnline = async () => {
      const queue = queueRef.current;
      // Read synchronously, before any await, and include the dirty flag: a
      // retry may already have drained the queue, and refetching then would
      // clobber the edit it just pushed.
      const hadPendingEdits = queue.size > 0 || dirtySinceLoadRef.current;

      if (hadPendingEdits) {
        // Push local edits first — refetching would overwrite work done offline.
        await queue.flushNow();
        if (queue.size === 0) {
          setIsOffline(false);
          setLastSyncedAt(Date.now());
        }
        return;
      }

      // Nothing local to push, so pull whatever changed elsewhere.
      setReloadNonce((n) => n + 1);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Running timer — ticks locally, checkpoints on an interval
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!runningTaskId) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      startTimeRef.current = null;
      return;
    }

    const task = groupsState.ref.current
      .flatMap((g) => g.tasks)
      .find((t) => t.id === runningTaskId);
    baseSecondsRef.current = task ? task.elapsedSeconds : 0;
    startTimeRef.current = Date.now();

    let lastSecondReported = -1;

    const tick = () => {
      if (!startTimeRef.current) return;

      const now = Date.now();
      const totalElapsed =
        baseSecondsRef.current +
        Math.floor((now - startTimeRef.current) / 1000);

      if (totalElapsed !== lastSecondReported) {
        lastSecondReported = totalElapsed;
        setNowTimestamp(now);
        // Local-only: a per-second write to Supabase would be absurd.
        groupsState.set((prev) =>
          prev.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) =>
              t.id === runningTaskId ? { ...t, elapsedSeconds: totalElapsed } : t,
            ),
          })),
        );
        activeState.set((prev) => ({ ...prev, lastActiveTimestamp: now }));
      }

      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);

    // Checkpoint so a crash or closed tab loses at most HEARTBEAT_MS.
    const heartbeat = window.setInterval(() => {
      groupsState.flush();
      activeState.flush();
    }, HEARTBEAT_MS);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      window.clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningTaskId]);

  // Persist accumulated timer progress when the tab goes away.
  useEffect(() => {
    const checkpoint = () => {
      if (!activeState.ref.current.runningTaskId) return;
      groupsState.flush();
      activeState.flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        checkpoint();
        hiddenAtRef.current = activeState.ref.current.runningTaskId
          ? Date.now()
          : null;
        return;
      }

      // Back on screen: a timer that ran through a long absence gets confirmed.
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!hiddenAt) return;

      const runningId = activeState.ref.current.runningTaskId;
      if (!runningId) return;

      const awaySeconds = Math.floor((Date.now() - hiddenAt) / 1000);
      if (awaySeconds <= IDLE_THRESHOLD_SECONDS) return;
      if (idlePromptRef.current) return;

      const runningTask = groupsState.ref.current
        .flatMap((g) => g.tasks)
        .find((t) => t.id === runningId);

      setIdlePrompt({
        taskId: runningId,
        taskName: runningTask?.name ?? 'your task',
        idleSeconds: awaySeconds,
        since: hiddenAt,
        alreadyCounted: true,
      });
    };
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setIdlePrompt = useCallback((next: IdlePrompt | null) => {
    idlePromptRef.current = next;
    setIdlePromptState(next);
  }, []);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  // ---------------------------------------------------------------------------
  // Undo — whole-collection slices make this a snapshot/restore, not a log
  // ---------------------------------------------------------------------------
  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    undoRestoreRef.current = null;
    setUndoLabel(null);
  }, []);

  const offerUndo = useCallback(
    (label: string) => {
      const groupsBefore = groupsState.ref.current;
      const completedBefore = completedState.ref.current;
      const sessionsBefore = sessionsState.ref.current;
      const tagsBefore = tagsState.ref.current;
      const notesBefore = noteGroupsState.ref.current;
      const activeBefore = activeState.ref.current;

      undoRestoreRef.current = () => {
        // commit() no-ops when the value is identical, so untouched slices
        // cost nothing.
        groupsState.commit(() => groupsBefore);
        completedState.commit(() => completedBefore);
        sessionsState.commit(() => sessionsBefore);
        tagsState.commit(() => tagsBefore);
        noteGroupsState.commit(() => notesBefore);
        activeState.commit(() => activeBefore);
      };

      setUndoLabel(label);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(clearUndo, UNDO_WINDOW_MS);
    },
    [
      activeState,
      clearUndo,
      completedState,
      groupsState,
      noteGroupsState,
      sessionsState,
      tagsState,
    ],
  );

  /** Keep a task's own counter in step when its recorded time changes. */
  const adjustTaskElapsed = useCallback(
    (taskId: string, deltaSeconds: number) => {
      groupsState.commit((prev) => adjustTaskElapsedIn(prev, taskId, deltaSeconds));
    },
    [groupsState],
  );

  /**
   * "keep" counts the away time; "discard" removes it. Discarding has to move
   * activeSessionStart forward too, otherwise the live segment in allSessions
   * would still cover the gap we just took back.
   */
  const resolveIdle = useCallback(
    (decision: 'keep' | 'discard') => {
      const prompt = idlePromptRef.current;
      if (!prompt) return;
      setIdlePrompt(null);

      const now = Date.now();

      const { elapsedDelta, restartLiveSegment } = resolveIdleAdjustment(
        prompt,
        decision,
      );

      if (elapsedDelta !== 0) {
        adjustTaskElapsed(prompt.taskId, elapsedDelta);
        if (elapsedDelta < 0) {
          // The running tick derives from this base, so pull it back too.
          baseSecondsRef.current = Math.max(
            0,
            baseSecondsRef.current + elapsedDelta,
          );
        }
      }

      activeState.commit((prev) => ({
        ...prev,
        lastActiveTimestamp: now,
        ...(restartLiveSegment ? { activeSessionStart: now } : {}),
      }));
    },
    [activeState, adjustTaskElapsed, setIdlePrompt],
  );

  const undo = useCallback(() => {
    undoRestoreRef.current?.();
    clearUndo();
  }, [clearUndo]);

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);
  const retryLoad = useCallback(() => setReloadNonce((n) => n + 1), []);

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const updateSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      settingsState.commit((prev) => ({
        ...prev,
        dailyTargetMinutes:
          newSettings.dailyTargetMinutes !== undefined &&
          newSettings.dailyTargetMinutes > 0
            ? newSettings.dailyTargetMinutes
            : prev.dailyTargetMinutes,
        workingDays: newSettings.workingDays ?? prev.workingDays,
      }));
    },
    [settingsState],
  );

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------
  const addGroup = useCallback(
    (name: string) => {
      groupsState.commit((prev) =>
        pinnedFirst([
          { id: generateId(), name, tasks: [], expanded: true, pinned: false },
          ...prev,
        ]),
      );
    },
    [groupsState],
  );

  const stopTimer = useCallback(() => {
    activeState.commit(() => EMPTY_ACTIVE_STATE);
  }, [activeState]);

  const removeGroup = useCallback(
    (groupId: string) => {
      const group = groupsState.ref.current.find((g) => g.id === groupId);
      if (!group) return;
      const hadRunningTask = group.tasks.some((t) => t.id === runningTaskId);

      offerUndo(`Deleted “${group.name}”`);
      groupsState.commit((prev) => prev.filter((g) => g.id !== groupId));
      if (hadRunningTask) stopTimer();
    },
    [groupsState, offerUndo, runningTaskId, stopTimer],
  );

  const reorderGroups = useCallback(
    (startIndex: number, endIndex: number) => {
      groupsState.commit((prev) => {
        const result = Array.from(prev);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return pinnedFirst(result);
      });
    },
    [groupsState],
  );

  const toggleGroupExpanded = useCallback(
    (groupId: string) => {
      groupsState.commit((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g)),
      );
    },
    [groupsState],
  );

  const pinnedGroupCount = useMemo(
    () => groups.filter((g) => g.pinned).length,
    [groups],
  );

  const toggleGroupPinned = useCallback(
    (groupId: string) => {
      groupsState.commit((prev) => toggleGroupPinnedIn(prev, groupId));
    },
    [groupsState],
  );

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------
  const addTask = useCallback(
    (groupId: string, name: string) => {
      groupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                tasks: [
                  { id: generateId(), name, elapsedSeconds: 0, tagIds: [] },
                  ...g.tasks,
                ],
              }
            : g,
        ),
      );
    },
    [groupsState],
  );

  const reorderTasks = useCallback(
    (groupId: string, startIndex: number, endIndex: number) => {
      groupsState.commit((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const newTasks = Array.from(g.tasks);
          const [removed] = newTasks.splice(startIndex, 1);
          newTasks.splice(endIndex, 0, removed);
          return { ...g, tasks: newTasks };
        }),
      );
    },
    [groupsState],
  );

  const updateTaskElapsed = useCallback(
    (groupId: string, taskId: string, elapsedSeconds: number) => {
      groupsState.commit((prev) =>
        mapTask(prev, groupId, taskId, (t) => ({ ...t, elapsedSeconds })),
      );
    },
    [groupsState],
  );

  const updateTaskName = useCallback(
    (groupId: string, taskId: string, name: string) => {
      groupsState.commit((prev) =>
        mapTask(prev, groupId, taskId, (t) => ({ ...t, name })),
      );
      sessionsState.commit((prev) =>
        prev.map((s) =>
          s.taskId === taskId
            ? { ...s, taskName: name, ticketId: extractTicketId(name) || undefined }
            : s,
        ),
      );
    },
    [groupsState, sessionsState],
  );

  const updateTaskDescription = useCallback(
    (groupId: string, taskId: string, description: string) => {
      const trimmed = description.trim();
      groupsState.commit((prev) =>
        mapTask(prev, groupId, taskId, (t) => ({
          ...t,
          description: trimmed || undefined,
        })),
      );
    },
    [groupsState],
  );

  const createTag = useCallback(
    (label: string, color: TagColor): Tag | null => {
      const trimmed = label.trim();
      if (!trimmed) return null;

      const existing = tagsState.ref.current.find(
        (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) return existing;

      const tag: Tag = { id: generateId(), label: trimmed, color };
      tagsState.commit((prev) => [...prev, tag]);
      return tag;
    },
    [tagsState],
  );

  const deleteTag = useCallback(
    (tagId: string) => {
      const tag = tagsState.ref.current.find((t) => t.id === tagId);
      offerUndo(tag ? `Deleted tag “${tag.label}”` : 'Tag deleted');
      tagsState.commit((prev) => prev.filter((t) => t.id !== tagId));

      // Drop the reference from every task that used it.
      groupsState.commit((prev) => removeTagFromTasks(prev, tagId));
    },
    [groupsState, offerUndo, tagsState],
  );

  const toggleTaskTag = useCallback(
    (groupId: string, taskId: string, tagId: string) => {
      groupsState.commit((prev) =>
        mapTask(prev, groupId, taskId, (t) => {
          const ids = t.tagIds ?? [];
          return {
            ...t,
            tagIds: ids.includes(tagId)
              ? ids.filter((id) => id !== tagId)
              : [...ids, tagId],
          };
        }),
      );
    },
    [groupsState],
  );

  const removeTask = useCallback(
    (groupId: string, taskId: string) => {
      const task = groupsState.ref.current
        .find((g) => g.id === groupId)
        ?.tasks.find((t) => t.id === taskId);
      offerUndo(task ? `Deleted “${task.name}”` : 'Task deleted');

      groupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }
            : g,
        ),
      );
      if (runningTaskId === taskId) stopTimer();
    },
    [groupsState, offerUndo, runningTaskId, stopTimer],
  );

  /** Move a task to another group, keeping its history, tags and elapsed time. */
  const moveTask = useCallback(
    (fromGroupId: string, toGroupId: string, taskId: string) => {
      if (fromGroupId === toGroupId) return;

      const task = groupsState.ref.current
        .find((g) => g.id === fromGroupId)
        ?.tasks.find((t) => t.id === taskId);
      if (!task) return;

      const target = groupsState.ref.current.find((g) => g.id === toGroupId);
      if (!target) return;

      groupsState.commit((prev) =>
        moveTaskBetweenGroups(prev, fromGroupId, toGroupId, taskId),
      );

      // Recorded sessions carry the project name, so keep them in step.
      sessionsState.commit((prev) =>
        prev.some((sn) => sn.taskId === taskId)
          ? prev.map((sn) =>
              sn.taskId === taskId ? { ...sn, groupName: target.name } : sn,
            )
          : prev,
      );
    },
    [groupsState, sessionsState],
  );

  /** Close out the live segment of whatever is running into a WorkSession. */
  const closeOpenSession = useCallback(
    (now: number, completedTaskId?: string): void => {
      const current = activeState.ref.current;
      if (!current.runningTaskId || !current.activeSessionStart) return;

      const duration = Math.floor((now - current.activeSessionStart) / 1000);
      if (duration <= 0) return;

      const group = groupsState.ref.current.find((g) =>
        g.tasks.some((t) => t.id === current.runningTaskId),
      );
      const task = group?.tasks.find((t) => t.id === current.runningTaskId);
      if (!group || !task) return;

      const session: WorkSession = {
        id: generateId(),
        taskId: task.id,
        taskName: task.name,
        groupName: group.name,
        ticketId: extractTicketId(task.name) || undefined,
        startTime: current.activeSessionStart,
        endTime: now,
        durationSeconds: duration,
        completedTaskId,
      };
      sessionsState.commit((prev) => [session, ...prev]);
    },
    [activeState, groupsState, sessionsState],
  );

  const startTask = useCallback(
    (_groupId: string, taskId: string) => {
      const now = Date.now();
      const current = activeState.ref.current;

      if (current.runningTaskId && current.runningTaskId !== taskId) {
        closeOpenSession(now);
      }

      // Durably record the elapsed seconds accrued so far before switching.
      groupsState.flush();

      activeState.commit(() => ({
        runningTaskId: taskId,
        lastActiveTimestamp: now,
        activeSessionStart: now,
      }));
    },
    [activeState, closeOpenSession, groupsState],
  );

  const pauseTask = useCallback(() => {
    const now = Date.now();
    closeOpenSession(now);
    groupsState.flush();
    activeState.commit(() => EMPTY_ACTIVE_STATE);
  }, [activeState, closeOpenSession, groupsState]);

  const markTaskDone = useCallback(
    (groupId: string, taskId: string) => {
      const group = groupsState.ref.current.find((g) => g.id === groupId);
      const task = group?.tasks.find((t) => t.id === taskId);
      if (!group || !task) return;

      const now = Date.now();
      const completedId = generateId();
      const wasRunning = activeState.ref.current.runningTaskId === taskId;

      offerUndo(`Completed “${task.name}”`);

      if (wasRunning) {
        closeOpenSession(now, completedId);
        activeState.commit(() => EMPTY_ACTIVE_STATE);
      }

      // Attribute EVERY session for this task, not just the one being closed.
      // Untagged sessions are invisible to the completed-task total, which is
      // what made a task completed while paused get counted twice.
      sessionsState.commit((prev) => {
        let changed = false;
        const next = prev.map((sn) => {
          if (sn.taskId !== taskId || sn.completedTaskId) return sn;
          changed = true;
          return { ...sn, completedTaskId: completedId };
        });
        return changed ? next : prev;
      });

      completedState.commit((prev) => [
        ...prev,
        {
          id: completedId,
          taskName: task.name,
          groupName: group.name,
          totalSeconds: task.elapsedSeconds,
          completedAt: now,
          ticketId: extractTicketId(task.name) || undefined,
          notes: task.description,
        },
      ]);

      groupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }
            : g,
        ),
      );
    },
    [
      activeState,
      closeOpenSession,
      completedState,
      groupsState,
      offerUndo,
      sessionsState,
    ],
  );

  // ---------------------------------------------------------------------------
  // Completed tasks
  // ---------------------------------------------------------------------------
  const updateCompletedTaskName = useCallback(
    (completedTaskId: string, taskName: string) => {
      const ticketId = extractTicketId(taskName) || undefined;
      completedState.commit((prev) =>
        prev.map((t) =>
          t.id === completedTaskId ? { ...t, taskName, ticketId } : t,
        ),
      );
      sessionsState.commit((prev) =>
        prev.map((s) =>
          s.completedTaskId === completedTaskId
            ? { ...s, taskName, ticketId }
            : s,
        ),
      );
    },
    [completedState, sessionsState],
  );

  const updateCompletedTask = useCallback(
    (completedTaskId: string, totalSeconds: number) => {
      const sanitized = Math.max(0, Math.floor(totalSeconds));
      completedState.commit((prev) =>
        prev.map((t) =>
          t.id === completedTaskId ? { ...t, totalSeconds: sanitized } : t,
        ),
      );
      sessionsState.commit((prev) =>
        prev.some((s) => s.completedTaskId === completedTaskId)
          ? prev.map((s) =>
              s.completedTaskId === completedTaskId
                ? {
                    ...s,
                    durationSeconds: sanitized,
                    endTime: s.startTime + sanitized * 1000,
                  }
                : s,
            )
          : prev,
      );
    },
    [completedState, sessionsState],
  );

  // ---------------------------------------------------------------------------
  // Manual time entry & session corrections
  // ---------------------------------------------------------------------------

  const addManualSession = useCallback(
    (input: ManualSessionInput) => {
      const start = Math.min(input.startTime, input.endTime);
      const end = Math.max(input.startTime, input.endTime);
      const durationSeconds = Math.floor((end - start) / 1000);
      if (durationSeconds <= 0) return;

      const session: WorkSession = {
        id: generateId(),
        taskId: input.taskId ?? `manual-${generateId()}`,
        taskName: input.taskName,
        groupName: input.groupName,
        ticketId: extractTicketId(input.taskName) || undefined,
        startTime: start,
        endTime: end,
        durationSeconds,
        notes: input.notes?.trim() || undefined,
      };

      sessionsState.commit((prev) => [session, ...prev]);
      if (input.taskId) adjustTaskElapsed(input.taskId, durationSeconds);
    },
    [adjustTaskElapsed, sessionsState],
  );

  const updateSession = useCallback(
    (sessionId: string, patch: SessionPatch) => {
      const existing = sessionsState.ref.current.find((sn) => sn.id === sessionId);
      if (!existing) return; // synthetic rows in allSessions aren't editable

      const patched = applySessionPatch(existing, patch);
      if (!patched) return; // invalid range — leave state alone

      const { session: updated, deltaSeconds: delta } = patched;

      sessionsState.commit((prev) =>
        prev.map((sn) => (sn.id === sessionId ? updated : sn)),
      );

      adjustTaskElapsed(existing.taskId, delta);

      // A completed task's headline total should follow its session.
      if (existing.completedTaskId && delta !== 0) {
        completedState.commit((prev) =>
          prev.map((ct) =>
            ct.id === existing.completedTaskId
              ? { ...ct, totalSeconds: Math.max(0, ct.totalSeconds + delta) }
              : ct,
          ),
        );
      }
    },
    [adjustTaskElapsed, completedState, sessionsState],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      const existing = sessionsState.ref.current.find((sn) => sn.id === sessionId);
      if (!existing) return;

      offerUndo('Deleted time entry');
      sessionsState.commit((prev) => prev.filter((sn) => sn.id !== sessionId));
      adjustTaskElapsed(existing.taskId, -existing.durationSeconds);

      if (existing.completedTaskId) {
        completedState.commit((prev) =>
          prev.map((ct) =>
            ct.id === existing.completedTaskId
              ? {
                  ...ct,
                  totalSeconds: Math.max(
                    0,
                    ct.totalSeconds - existing.durationSeconds,
                  ),
                }
              : ct,
          ),
        );
      }
    },
    [adjustTaskElapsed, completedState, offerUndo, sessionsState],
  );

  // ---------------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------------
  const addNoteGroup = useCallback(
    (title: string) => {
      noteGroupsState.commit((prev) => [
        ...prev,
        { id: generateId(), title, notes: [] },
      ]);
    },
    [noteGroupsState],
  );

  const updateNoteGroupTitle = useCallback(
    (groupId: string, title: string) => {
      noteGroupsState.commit((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, title } : g)),
      );
    },
    [noteGroupsState],
  );

  const removeNoteGroup = useCallback(
    (groupId: string) => {
      const group = noteGroupsState.ref.current.find((g) => g.id === groupId);
      offerUndo(group ? `Deleted “${group.title}”` : 'Note group deleted');
      noteGroupsState.commit((prev) => prev.filter((g) => g.id !== groupId));
    },
    [noteGroupsState, offerUndo],
  );

  const addNote = useCallback(
    (groupId: string, text: string) => {
      noteGroupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                notes: [{ id: generateId(), text, checked: false }, ...g.notes],
              }
            : g,
        ),
      );
    },
    [noteGroupsState],
  );

  const toggleNote = useCallback(
    (groupId: string, noteId: string) => {
      noteGroupsState.commit((prev) =>
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
    },
    [noteGroupsState],
  );

  const updateNote = useCallback(
    (groupId: string, noteId: string, text: string) => {
      noteGroupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                notes: g.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
              }
            : g,
        ),
      );
    },
    [noteGroupsState],
  );

  const removeNote = useCallback(
    (groupId: string, noteId: string) => {
      noteGroupsState.commit((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) }
            : g,
        ),
      );
    },
    [noteGroupsState],
  );

  // ---------------------------------------------------------------------------
  // Derived reporting data
  // ---------------------------------------------------------------------------
  const allSessions = useMemo<WorkSession[]>(
    () =>
      deriveAllSessions({
        sessions,
        completedTasks,
        groups,
        runningTaskId,
        activeSession,
        now: nowTimestamp,
      }),
    [sessions, completedTasks, groups, runningTaskId, activeSession, nowTimestamp],
  );

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
      tags,
      sessions,
      allSessions,
      settings,
      todayProgress,
      activeSession,
      isLoading,
      isSyncing: isLoading,
      tablesMissing,
      loadError,
      isSaveBlocked: tablesMissing || loadError !== null,
      retryLoad,
      pendingWrites,
      isOffline,
      lastSyncedAt,
      syncError,
      dismissSyncError,
      pinnedGroupCount,
      updateSettings,
      addGroup,
      removeGroup,
      reorderGroups,
      toggleGroupExpanded,
      toggleGroupPinned,
      addTask,
      reorderTasks,
      updateTaskElapsed,
      updateTaskName,
      updateTaskDescription,
      createTag,
      deleteTag,
      toggleTaskTag,
      removeTask,
      moveTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addManualSession,
      updateSession,
      removeSession,
      undoLabel,
      undo,
      dismissUndo: clearUndo,
      idlePrompt,
      resolveIdle,
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
      tags,
      sessions,
      allSessions,
      settings,
      todayProgress,
      activeSession,
      isLoading,
      tablesMissing,
      loadError,
      retryLoad,
      pendingWrites,
      isOffline,
      lastSyncedAt,
      syncError,
      dismissSyncError,
      pinnedGroupCount,
      updateSettings,
      addGroup,
      removeGroup,
      reorderGroups,
      toggleGroupExpanded,
      toggleGroupPinned,
      addTask,
      reorderTasks,
      updateTaskElapsed,
      updateTaskName,
      updateTaskDescription,
      createTag,
      deleteTag,
      toggleTaskTag,
      removeTask,
      moveTask,
      startTask,
      pauseTask,
      markTaskDone,
      updateCompletedTaskName,
      updateCompletedTask,
      addManualSession,
      updateSession,
      removeSession,
      undoLabel,
      undo,
      clearUndo,
      idlePrompt,
      resolveIdle,
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
