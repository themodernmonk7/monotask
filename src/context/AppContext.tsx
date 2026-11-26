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
  Task,
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
  touchActiveState,
} from '../lib/supabaseDb';
import type { ActiveState } from '../lib/supabaseDb';
import { useOptimisticState } from '@/hooks/useOptimisticState';
import type { PersistGate } from '@/hooks/useOptimisticState';
import { SyncQueue, isTransientError } from '@/lib/syncQueue';
import { readCache, writeCache } from '@/lib/localCache';
import { deriveAllSessions } from '@/lib/sessionDerivation';
import {
  completedTaskIds,
  completionIdFor,
  migrateTaskBase,
  sessionIdFor,
  stripCompletedTasks,
  withDerivedElapsed,
} from '@/lib/timeModel';
import { supabase } from '@/lib/supabase';
import {
  applySessionPatch,
  mapTask,
  migrateLegacyTags,
  moveTaskBetweenGroups,
  pinnedFirst,
  removeTagFromTasks,
  retimeCompletedTaskSessions,
  toggleGroupPinned as toggleGroupPinnedIn,
  setGroupColor as setGroupColorIn,
} from '@/lib/taskMutations';
import type { UserDbData } from '../lib/supabaseDb';

/** How often a running timer tells the server it is still alive. */
const HEARTBEAT_MS = 30_000;

/**
 * Backstop re-sync while the app is visible, for changes the realtime feed
 * cannot report (deletions) or missed while its socket was asleep.
 */
const POLL_MS = 60_000;

/** Coalesces a burst of realtime events into one refetch. */
const SYNC_DEBOUNCE_MS = 600;

const SYNCED_TABLES = [
  'groups',
  'completed_tasks',
  'work_sessions',
  'note_groups',
  'tags',
  'user_settings',
  'user_active_state',
] as const;

/**
 * A running timer the app finds still going after a gap this long asks before
 * counting it — checked ONLY on load (computer slept, browser was closed or
 * crashed, tab was discarded). Switching tabs or apps while a timer runs is
 * the normal way to use a time tracker and must never trigger this; it used
 * to, at a 5-minute threshold, which meant it fired on almost every tab
 * switch. If a timer is ever left on by mistake, trim it afterwards from the
 * session list in Reports.
 */
const IDLE_THRESHOLD_SECONDS = 30 * 60;

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
  setGroupColor: (groupId: string, color: TagColor) => void;
  addTask: (groupId: string, name: string) => void;
  reorderTasks: (groupId: string, startIndex: number, endIndex: number) => void;
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
  /** Move a completed task back to the task list, keeping all its time. */
  reopenCompletedTask: (completedTaskId: string) => void;

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
  /** Also complete the task, dated when this work ended. */
  completeTask?: boolean;
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
  /** When the device last checked in; the live segment stops here until answered. */
  since: number;
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
  // Set just before a reconnect-triggered refresh bumps reloadNonce, so
  // that one pass of the load effect knows not to show the splash screen —
  // a routine background sync must never look like a page reload.
  const silentReloadRef = useRef(false);
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
  /** Bumped on every local write attempt; a refetch that raced one is discarded. */
  const writeEpochRef = useRef(0);
  // Marked the moment any write is attempted — see dirtySinceLoadRef.
  const markDirtyRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    markDirtyRef.current = () => {
      dirtySinceLoadRef.current = true;
      writeEpochRef.current += 1;
    };
  }, []);
  const onSyncError = useRef<(message: string) => void>(() => {});
  useEffect(() => {
    onSyncError.current = (message: string) => setSyncError(message);
  }, []);

  const inflightRef = useRef(0);
  const optimisticOptions = useMemo(
    () => ({
      gateRef,
      onErrorRef: onSyncError,
      queueRef,
      onWriteAttemptRef: markDirtyRef,
      inflightRef,
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
  const undoRestoreRef = useRef<(() => Promise<void>) | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // Initial load — the single read path
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    let alive = true;
    const silent = silentReloadRef.current;
    silentReloadRef.current = false;

    gateRef.current = { userId: user.id, ready: false };
    if (!silent) setIsLoading(true);
    setLoadError(null);

    const hydrate = (data: UserDbData, fromCache: boolean) => {
      const trusted = !fromCache;
      const now = Date.now();
      const serverActive = data.activeState ?? EMPTY_ACTIVE_STATE;

      // --- Normalise what was loaded -------------------------------------
      // 1. Old counter model -> baseSeconds (once per task, ever).
      // 2. Tasks completed on any device are not open, whatever a stale
      //    device last wrote into its group.
      // 3. Legacy embedded tags -> shared library.
      const done = completedTaskIds(data.completedTasks, data.sessions);
      const migrated = migrateTaskBase(data.groups, data.sessions, serverActive, now);
      const stripped = stripCompletedTasks(migrated, done);
      const { groups: tagMigratedGroups, tags: migratedTags } = migrateLegacyTags(
        stripped,
        data.tags,
      );
      const normalizedGroups = pinnedFirst(tagMigratedGroups);

      // A timer for a task that no longer exists (completed or deleted on
      // another device) must stop here too.
      const runningExists =
        !serverActive.runningTaskId ||
        normalizedGroups.some((g) =>
          g.tasks.some((t) => t.id === serverActive.runningTaskId),
        );
      const normalizedActive = runningExists ? serverActive : EMPTY_ACTIVE_STATE;

      // --- Baseline = exactly what the server holds ------------------------
      groupsState.hydrate(data.groups, trusted);
      tagsState.hydrate(data.tags, trusted);
      completedState.hydrate(data.completedTasks, trusted);
      sessionsState.hydrate(data.sessions, trusted);
      noteGroupsState.hydrate(data.noteGroups, trusted);
      settingsState.hydrate(data.settings, trusted);
      activeState.hydrate(serverActive, trusted);

      // Reads are done; writes may now proceed. Deliberately true for a
      // cache-backed start too: edits must be accepted and queued, otherwise
      // working offline silently loses everything.
      gateRef.current = { userId: user.id, ready: true };

      // --- Push the normalisation as ordinary diffs ------------------------
      void tagsState.commit(() => migratedTags);
      void groupsState.commit(() => normalizedGroups);
      if (!data.noteGroups.length) {
        void noteGroupsState.commit(() => [
          { id: 'general', title: 'General', notes: [] },
        ]);
      }
      if (normalizedActive !== serverActive) {
        void activeState.commit(() => normalizedActive);
      }

      // --- Idle check: only when the app is (re)opened, never on a re-sync --
      // A background re-sync happens while the user is right here; the timer
      // on another device checking in late is not "you were away".
      if (silent) {
        const prompt = idlePromptRef.current;
        if (prompt && prompt.taskId !== normalizedActive.runningTaskId) {
          setIdlePrompt(null); // that timer was stopped elsewhere
        }
        return;
      }

      const lastSeen = normalizedActive.lastActiveTimestamp;
      const gapSeconds = lastSeen ? Math.floor((now - lastSeen) / 1000) : 0;
      if (normalizedActive.runningTaskId && lastSeen && gapSeconds > IDLE_THRESHOLD_SECONDS) {
        const runningTask = normalizedGroups
          .flatMap((g) => g.tasks)
          .find((t) => t.id === normalizedActive.runningTaskId);
        setIdlePrompt({
          taskId: normalizedActive.runningTaskId,
          taskName: runningTask?.name ?? 'your task',
          idleSeconds: gapSeconds,
          since: lastSeen,
        });
      }
    };

    const epochAtFetch = writeEpochRef.current;
    fetchUserData(user.id).then(({ data, error, tablesMissing: missing }) => {
      if (!alive) return;

      // A background re-sync that raced a local edit would hand back rows
      // from before that edit. Drop it and try again once writes settle.
      if (silent && writeEpochRef.current !== epochAtFetch) {
        requestSyncRef.current();
        return;
      }

      if (!silent) setIsLoading(false);
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
    // Depend on the id, not the `user` object: Supabase hands out a NEW
    // session/user object on every token refresh (notably triggered by the
    // tab regaining focus, if the access token happens to be near expiry —
    // see auth-js's _onVisibilityChanged -> _recoverAndRefresh), even though
    // it's the same account. Depending on the object itself reran this whole
    // effect — and the splash it shows — on a plain tab switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reloadNonce]);

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

  // ---------------------------------------------------------------------------
  // Cross-device sync
  //
  // Up to several devices can be signed in at once. Each learns about the
  // others' changes from the realtime feed (within about a second), backed by
  // a re-sync whenever the app regains focus and a slow poll while visible —
  // a sleeping laptop or phone drops its socket and misses events, and
  // deletions are not reported over the filtered feed at all.
  //
  // A re-sync is a quiet full refetch. It waits until this device has no
  // writes queued or in flight, otherwise it could hand back rows from before
  // an edit that is still on its way.
  // ---------------------------------------------------------------------------
  const syncTimerRef = useRef<number | null>(null);
  const requestSyncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const attempt = async () => {
      syncTimerRef.current = null;
      if (!gateRef.current.ready) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const queue = queueRef.current;
      if (queue.size > 0) {
        await queue.flushNow();
        if (queue.size > 0) return; // still can't reach the server
        setIsOffline(false);
        setLastSyncedAt(Date.now());
      }
      if (inflightRef.current > 0) {
        syncTimerRef.current = window.setTimeout(attempt, 300);
        return;
      }
      silentReloadRef.current = true;
      setReloadNonce((n) => n + 1);
    };

    requestSyncRef.current = () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(attempt, SYNC_DEBOUNCE_MS);
    };

    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      requestSyncRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => requestSyncRef.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestSyncRef.current();
    };
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') requestSyncRef.current();
    }, POLL_MS);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const channel = supabase.channel(`monotask-sync-${userId}`);
    for (const table of SYNCED_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => requestSyncRef.current(),
      );
    }
    // (Re)subscribing — including after the socket reconnects — may have
    // missed events, so catch up then too.
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') requestSyncRef.current();
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Running timer — ticks locally, checkpoints on an interval
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!runningTaskId || !activeSessionStart) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      return;
    }

    // The tick only moves the clock. Totals are derived from sessions plus
    // the live segment, so nothing here writes task data — the old per-second
    // counter, flushed with its whole group every 30s, is what let a stale
    // device resurrect a task that was completed elsewhere.
    let lastSecond = -1;
    const tick = () => {
      const now = Date.now();
      const second = Math.floor(now / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        setNowTimestamp(now);
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);

    // "Still running" check-in. Uses setInterval rather than the rAF tick so
    // it keeps going in a background tab (throttled, but well inside the
    // idle threshold). Conditional on the server agreeing this timer is the
    // current one, so a device that missed a stop elsewhere can't revive it.
    const heartbeat = window.setInterval(() => {
      const userId = gateRef.current.userId;
      if (!userId || !gateRef.current.ready) return;
      // While "were you away?" is unanswered, the last check-in must stay
      // where the user left, or a reload would silently count the gap.
      if (idlePromptRef.current) return;
      const now = Date.now();
      activeState.set((prev) =>
        prev.runningTaskId === runningTaskId ? { ...prev, lastActiveTimestamp: now } : prev,
      );
      void touchActiveState(userId, runningTaskId, activeSessionStart, now);
    }, HEARTBEAT_MS);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      window.clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningTaskId, activeSessionStart]);

  // Check in when the tab goes away, so a reopen measures the gap correctly.
  useEffect(() => {
    const checkpoint = () => {
      const { runningTaskId: id, activeSessionStart: start } = activeState.ref.current;
      const userId = gateRef.current.userId;
      if (!id || !start || !userId || !gateRef.current.ready) return;
      if (idlePromptRef.current) return;
      void touchActiveState(userId, id, start, Date.now());
    };
    // Checkpoint only — no idle prompt here. Being in another tab or app
    // while a timer runs is the normal, intended way to use the tracker.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') checkpoint();
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

      undoRestoreRef.current = async () => {
        // commit() no-ops when the value is identical, so untouched slices
        // cost nothing. Order matters for "undo complete": the completion
        // and its session tags must be gone from the server BEFORE the task
        // is written back, or the server-side guard (which strips completed
        // tasks out of groups) would strip it again.
        await Promise.all([
          completedState.commit(() => completedBefore),
          sessionsState.commit(() => sessionsBefore),
        ]);
        await Promise.all([
          groupsState.commit(() => groupsBefore),
          tagsState.commit(() => tagsBefore),
          noteGroupsState.commit(() => notesBefore),
          activeState.commit(() => activeBefore),
        ]);
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

  const undo = useCallback(() => {
    void undoRestoreRef.current?.();
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
        timerReminderEnabled:
          newSettings.timerReminderEnabled ?? prev.timerReminderEnabled,
        timerReminderMinutes:
          newSettings.timerReminderMinutes !== undefined &&
          newSettings.timerReminderMinutes > 0
            ? newSettings.timerReminderMinutes
            : prev.timerReminderMinutes,
        theme: newSettings.theme ?? prev.theme,
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

  const setGroupColor = useCallback(
    (groupId: string, color: TagColor) => {
      groupsState.commit((prev) => setGroupColorIn(prev, groupId, color));
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

  /**
   * Close out the live segment of whatever is running into a WorkSession.
   *
   * The session id is derived from (task, segment start), so if two devices
   * both close the same segment — each pausing a timer the other also saw —
   * they write the same row instead of counting the time twice.
   */
  const closeOpenSession = useCallback(
    (end: number, completedTaskId?: string): void => {
      const current = activeState.ref.current;
      if (!current.runningTaskId || !current.activeSessionStart) return;

      const duration = Math.floor((end - current.activeSessionStart) / 1000);
      if (duration <= 0) return;

      const group = groupsState.ref.current.find((g) =>
        g.tasks.some((t) => t.id === current.runningTaskId),
      );
      const task = group?.tasks.find((t) => t.id === current.runningTaskId);
      if (!group || !task) return;

      const session: WorkSession = {
        id: sessionIdFor(task.id, current.activeSessionStart),
        taskId: task.id,
        taskName: task.name,
        groupName: group.name,
        ticketId: extractTicketId(task.name) || undefined,
        startTime: current.activeSessionStart,
        endTime: end,
        durationSeconds: duration,
        completedTaskId,
      };
      void sessionsState.commit((prev) => [
        session,
        ...prev.filter((sn) => sn.id !== session.id),
      ]);
    },
    [activeState, groupsState, sessionsState],
  );

  const startTask = useCallback(
    (_groupId: string, taskId: string) => {
      const now = Date.now();
      const current = activeState.ref.current;
      if (current.runningTaskId === taskId) return;

      // Switching away from a timer whose "were you away?" is unanswered:
      // the away time is not counted for it.
      const prompt = idlePromptRef.current;
      if (current.runningTaskId) {
        closeOpenSession(prompt?.taskId === current.runningTaskId ? prompt.since : now);
      }
      setIdlePrompt(null);

      void activeState.commit(() => ({
        runningTaskId: taskId,
        lastActiveTimestamp: now,
        activeSessionStart: now,
      }));
    },
    [activeState, closeOpenSession, setIdlePrompt],
  );

  const pauseTask = useCallback(() => {
    // While "were you working while away?" is unanswered, pausing means the
    // away time wasn't work: end the segment where the user left.
    const prompt = idlePromptRef.current;
    const end = prompt ? prompt.since : Date.now();
    setIdlePrompt(null);
    closeOpenSession(end);
    void activeState.commit(() => EMPTY_ACTIVE_STATE);
  }, [activeState, closeOpenSession, setIdlePrompt]);

  /**
   * "keep" counts the away time — the live segment already spans it, so only
   * the check-in moves. "discard" closes the segment where the user left and
   * starts a fresh one now, so the gap is in no session at all.
   */
  const resolveIdle = useCallback(
    (decision: 'keep' | 'discard') => {
      const prompt = idlePromptRef.current;
      if (!prompt) return;
      setIdlePrompt(null);

      const now = Date.now();
      if (activeState.ref.current.runningTaskId !== prompt.taskId) return;

      if (decision === 'discard') closeOpenSession(prompt.since);

      void activeState.commit((prev) => ({
        ...prev,
        lastActiveTimestamp: now,
        ...(decision === 'discard' ? { activeSessionStart: now } : {}),
      }));
    },
    [activeState, closeOpenSession, setIdlePrompt],
  );

  /**
   * Complete an open task. `requestedAt` is when it was finished: now for the
   * Done button, the end of the entry when logging past work. The recorded
   * date is never earlier than the task's last recorded session, so a task
   * also worked on a later day (or still running) lands on that later day.
   */
  const completeTaskAt = useCallback(
    (groupId: string, taskId: string, requestedAt: number) => {
      const group = groupsState.ref.current.find((g) => g.id === groupId);
      const task = group?.tasks.find((t) => t.id === taskId);
      if (!group || !task) return;

      const now = Date.now();
      // Deterministic: if another device completes the same task, both
      // completions land on one row instead of adding the time twice.
      const completedId = completionIdFor(taskId);
      // The timer state is shared, so this is true even when the timer is
      // running on a different device — and this device closes its segment.
      const wasRunning = activeState.ref.current.runningTaskId === taskId;

      if (wasRunning) {
        const prompt = idlePromptRef.current;
        closeOpenSession(prompt?.taskId === taskId ? prompt.since : now, completedId);
        setIdlePrompt(null);
        void activeState.commit(() => EMPTY_ACTIVE_STATE);
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

      // Total = pre-session time + every recorded session (including the one
      // just closed). Derived, so it matches what the task showed.
      const own = sessionsState.ref.current.filter((sn) => sn.taskId === taskId);
      const recorded = own.reduce((sum, sn) => sum + sn.durationSeconds, 0);
      const lastWorked = own.reduce((latest, sn) => Math.max(latest, sn.endTime), 0);

      completedState.commit((prev) => [
        ...prev.filter((c) => c.id !== completedId),
        {
          id: completedId,
          taskName: task.name,
          groupName: group.name,
          totalSeconds: (task.baseSeconds ?? 0) + recorded,
          completedAt: Math.max(requestedAt, lastWorked),
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
      sessionsState,
      setIdlePrompt,
    ],
  );

  const markTaskDone = useCallback(
    (groupId: string, taskId: string) => {
      const task = groupsState.ref.current
        .find((g) => g.id === groupId)
        ?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      offerUndo(`Completed “${task.name}”`);
      completeTaskAt(groupId, taskId, Date.now());
    },
    [completeTaskAt, groupsState, offerUndo],
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
        retimeCompletedTaskSessions(prev, completedTaskId, sanitized),
      );
    },
    [completedState, sessionsState],
  );

  const reopenCompletedTask = useCallback(
    (completedTaskId: string) => {
      const ct = completedState.ref.current.find((c) => c.id === completedTaskId);
      if (!ct) return;

      const tagged = sessionsState.ref.current.filter(
        (sn) => sn.completedTaskId === completedTaskId,
      );
      // Same task id as before, so its time entries line up again.
      const taskId = completedTaskId.startsWith('done-')
        ? completedTaskId.slice('done-'.length)
        : (tagged[0]?.taskId ?? generateId());

      if (groupsState.ref.current.some((g) => g.tasks.some((t) => t.id === taskId))) {
        return; // already open (e.g. reopened on another device)
      }

      // Time the completion holds beyond its entries (older counter time,
      // or a total edited by hand) stays with the task, on the day it was
      // completed, so the total doesn't change.
      const taggedSeconds = tagged.reduce((sum, sn) => sum + sn.durationSeconds, 0);
      const baseSeconds = Math.max(0, ct.totalSeconds - taggedSeconds);

      const task: Task = {
        id: taskId,
        name: ct.taskName,
        description: ct.notes,
        elapsedSeconds: 0,
        baseSeconds,
        ...(baseSeconds > 0 ? { baseAt: ct.completedAt } : {}),
        tagIds: [],
      };

      offerUndo(`Moved “${ct.taskName}” back to tasks`);

      const targetGroup =
        groupsState.ref.current.find((g) => g.name === ct.groupName) ??
        groupsState.ref.current[0];

      void (async () => {
        // Order matters: the server strips any task that still has a
        // completion, so the completion goes first.
        await Promise.all([
          completedState.commit((prev) => prev.filter((c) => c.id !== completedTaskId)),
          sessionsState.commit((prev) =>
            prev.some((sn) => sn.completedTaskId === completedTaskId)
              ? prev.map((sn) =>
                  sn.completedTaskId === completedTaskId
                    ? { ...sn, completedTaskId: undefined }
                    : sn,
                )
              : prev,
          ),
        ]);
        await groupsState.commit((prev) =>
          targetGroup && prev.some((g) => g.id === targetGroup.id)
            ? prev.map((g) =>
                g.id === targetGroup.id
                  ? { ...g, expanded: true, tasks: [task, ...g.tasks] }
                  : g,
              )
            : pinnedFirst([
                ...prev,
                { id: generateId(), name: ct.groupName, tasks: [task], expanded: true, pinned: false },
              ]),
        );
      })();
    },
    [completedState, groupsState, offerUndo, sessionsState],
  );

  // ---------------------------------------------------------------------------
  // Manual time entry & session corrections
  // ---------------------------------------------------------------------------

  /**
   * Log work done without the timer — on an existing task, or on a task that
   * was never added. With `completeTask`, the task is also completed, dated
   * when the work ended (so it shows on that day, not today).
   */
  const addManualSession = useCallback(
    (input: ManualSessionInput) => {
      const start = Math.min(input.startTime, input.endTime);
      const end = Math.max(input.startTime, input.endTime);
      const durationSeconds = Math.floor((end - start) / 1000);
      if (durationSeconds <= 0) return;

      const name = input.taskName.trim();
      if (!name) return;
      const isNew = !input.taskId;
      const taskId = input.taskId ?? generateId();
      const group = groupsState.ref.current.find((g) => g.id === input.groupId);
      const groupName = group?.name ?? input.groupName;

      if (input.completeTask) offerUndo(`Logged and completed “${name}”`);

      const session: WorkSession = {
        id: generateId(),
        taskId,
        taskName: name,
        groupName,
        ticketId: extractTicketId(name) || undefined,
        startTime: start,
        endTime: end,
        durationSeconds,
        notes: input.notes?.trim() || undefined,
        completedTaskId: input.completeTask && isNew ? completionIdFor(taskId) : undefined,
      };

      // The task's total is derived from its sessions, so this is all the
      // time bookkeeping there is.
      sessionsState.commit((prev) => [session, ...prev]);

      if (!isNew) {
        if (input.completeTask && input.groupId) {
          completeTaskAt(input.groupId, taskId, end);
        }
        return;
      }

      if (input.completeTask) {
        // Finished work that was never on the list: straight to Completed.
        completedState.commit((prev) => [
          ...prev,
          {
            id: completionIdFor(taskId),
            taskName: name,
            groupName,
            totalSeconds: durationSeconds,
            completedAt: end,
            ticketId: extractTicketId(name) || undefined,
            notes: session.notes,
          },
        ]);
      } else if (group) {
        groupsState.commit((prev) =>
          prev.map((g) =>
            g.id === group.id
              ? {
                  ...g,
                  tasks: [
                    { id: taskId, name, elapsedSeconds: 0, baseSeconds: 0, tagIds: [] },
                    ...g.tasks,
                  ],
                }
              : g,
          ),
        );
      }
    },
    [completeTaskAt, completedState, groupsState, offerUndo, sessionsState],
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
    [completedState, sessionsState],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      const existing = sessionsState.ref.current.find((sn) => sn.id === sessionId);
      if (!existing) return;

      offerUndo('Deleted time entry');
      sessionsState.commit((prev) => prev.filter((sn) => sn.id !== sessionId));

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
    [completedState, offerUndo, sessionsState],
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
  // Until "were you working while away?" is answered, the live segment stops
  // where the user left — unconfirmed time is never shown as worked.
  const liveEnd = idlePrompt ? Math.min(idlePrompt.since, nowTimestamp) : nowTimestamp;

  const allSessions = useMemo<WorkSession[]>(
    () =>
      deriveAllSessions({
        sessions,
        completedTasks,
        groups,
        runningTaskId,
        activeSession,
        now: nowTimestamp,
        liveEnd,
      }),
    [sessions, completedTasks, groups, runningTaskId, activeSession, nowTimestamp, liveEnd],
  );

  /** What the UI shows: each task's elapsedSeconds is its derived total. */
  const displayGroups = useMemo(
    () => withDerivedElapsed(groups, sessions, activeSession, liveEnd),
    [groups, sessions, activeSession, liveEnd],
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
      groups: displayGroups,
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
      setGroupColor,
      addTask,
      reorderTasks,
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
      reopenCompletedTask,
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
      displayGroups,
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
      setGroupColor,
      addTask,
      reorderTasks,
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
      reopenCompletedTask,
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
