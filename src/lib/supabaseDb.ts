import { supabase } from './supabase';
import type {
  Group,
  CompletedTask,
  WorkSession,
  NoteGroup,
  AppSettings,
  Tag,
  TagColor,
} from '@/types';
import { TAG_COLORS } from '@/types';

export const DEFAULT_SETTINGS: AppSettings = {
  dailyTargetMinutes: 420, // 7 hours
  workingDays: [1, 2, 3, 4, 5], // Monday - Friday
  timerReminderEnabled: false,
  timerReminderMinutes: 5,
  theme: 'dark',
};

/** Every write returns its failure instead of swallowing it, so callers can roll back. */
export type PersistResult = { error: string | null };

export interface ActiveState {
  runningTaskId: string | null;
  lastActiveTimestamp: number | null;
  activeSessionStart: number | null;
}

export interface UserDbData {
  groups: Group[];
  completedTasks: CompletedTask[];
  sessions: WorkSession[];
  noteGroups: NoteGroup[];
  tags: Tag[];
  settings: AppSettings;
  activeState: ActiveState | null;
}

type SupabaseErrorLike = { message?: string; code?: string } | null;

function isMissingTable(error: SupabaseErrorLike): boolean {
  if (!error) return false;
  const msg = error.message || '';
  return (
    error.code === '42P01' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

/**
 * A dropped connection usually rejects fast, but a captive portal or a stalled
 * socket can leave the request pending forever — which is what leaves the app
 * stuck on a loading spinner. Cap it so the caller can fall back to the cache.
 */
const FETCH_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), FETCH_TIMEOUT_MS),
    ),
  ]);
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function normalizeSettings(raw: {
  daily_target_minutes?: unknown;
  working_days?: unknown;
  timer_reminder_enabled?: unknown;
  timer_reminder_minutes?: unknown;
  theme?: unknown;
}): AppSettings {
  return {
    dailyTargetMinutes:
      typeof raw.daily_target_minutes === 'number' && raw.daily_target_minutes > 0
        ? raw.daily_target_minutes
        : DEFAULT_SETTINGS.dailyTargetMinutes,
    workingDays: Array.isArray(raw.working_days)
      ? (raw.working_days as number[])
      : DEFAULT_SETTINGS.workingDays,
    // Both columns are new; an account created before this migration has
    // neither, so a row that's missing them (not just `false`/`0`) must still
    // land on the real defaults rather than `undefined`.
    timerReminderEnabled:
      typeof raw.timer_reminder_enabled === 'boolean'
        ? raw.timer_reminder_enabled
        : DEFAULT_SETTINGS.timerReminderEnabled,
    timerReminderMinutes:
      typeof raw.timer_reminder_minutes === 'number' && raw.timer_reminder_minutes > 0
        ? raw.timer_reminder_minutes
        : DEFAULT_SETTINGS.timerReminderMinutes,
    theme: raw.theme === 'light' ? 'light' : DEFAULT_SETTINGS.theme,
  };
}

/**
 * Read the user's entire dataset in one round trip.
 * This is the only read path — Supabase is the source of truth.
 */
export async function fetchUserData(userId: string): Promise<{
  data: UserDbData | null;
  error: string | null;
  tablesMissing: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { data: null, error: 'Network error: offline', tablesMissing: false };
  }

  return withTimeout(fetchUserDataInner(userId), {
    data: null,
    error: 'Network error: the request timed out',
    tablesMissing: false,
  });
}

async function fetchUserDataInner(userId: string): Promise<{
  data: UserDbData | null;
  error: string | null;
  tablesMissing: boolean;
}> {
  try {
    const [
      groupsRes,
      completedRes,
      sessionsRes,
      notesRes,
      tagsRes,
      settingsRes,
      activeRes,
    ] = await Promise.all([
        supabase.from('groups').select('*').eq('user_id', userId).order('order_index'),
        supabase
          .from('completed_tasks')
          .select('*')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false }),
        supabase
          .from('work_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('start_time', { ascending: false }),
        supabase.from('note_groups').select('*').eq('user_id', userId).order('order_index'),
        supabase.from('tags').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_active_state').select('*').eq('user_id', userId).maybeSingle(),
      ]);

    const firstError =
      groupsRes.error ||
      completedRes.error ||
      sessionsRes.error ||
      notesRes.error ||
      tagsRes.error ||
      settingsRes.error ||
      activeRes.error;

    if (firstError) {
      return {
        data: null,
        error: firstError.message,
        tablesMissing: isMissingTable(firstError),
      };
    }

    const groups: Group[] = (groupsRes.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      tasks: Array.isArray(row.tasks) ? row.tasks : [],
      expanded: row.expanded ?? true,
      pinned: row.pinned ?? false,
      color: (TAG_COLORS as readonly string[]).includes(row.color)
        ? (row.color as TagColor)
        : undefined,
    }));

    const completedTasks: CompletedTask[] = (completedRes.data || []).map((row) => ({
      id: row.id,
      taskName: row.task_name,
      groupName: row.group_name,
      totalSeconds: row.total_seconds,
      completedAt: Number(row.completed_at),
      ticketId: row.ticket_id || undefined,
      startTime: row.start_time ? Number(row.start_time) : undefined,
      endTime: row.end_time ? Number(row.end_time) : undefined,
      notes: row.notes || undefined,
    }));

    const sessions: WorkSession[] = (sessionsRes.data || []).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      taskName: row.task_name,
      groupName: row.group_name,
      ticketId: row.ticket_id || undefined,
      startTime: Number(row.start_time),
      endTime: Number(row.end_time),
      durationSeconds: row.duration_seconds,
      notes: row.notes || undefined,
      completedTaskId: row.completed_task_id || undefined,
    }));

    const noteGroups: NoteGroup[] = (notesRes.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      notes: Array.isArray(row.notes) ? row.notes : [],
    }));

    const tags: Tag[] = (tagsRes.data || []).map((row) => ({
      id: row.id,
      label: row.label,
      color: (TAG_COLORS as readonly string[]).includes(row.color)
        ? (row.color as TagColor)
        : 'slate',
    }));

    const activeState: ActiveState | null = activeRes.data
      ? {
          runningTaskId: activeRes.data.running_task_id || null,
          lastActiveTimestamp: activeRes.data.last_active_timestamp
            ? Number(activeRes.data.last_active_timestamp)
            : null,
          activeSessionStart: activeRes.data.active_session_start
            ? Number(activeRes.data.active_session_start)
            : null,
        }
      : null;

    return {
      data: {
        groups,
        completedTasks,
        sessions,
        noteGroups,
        tags,
        settings: settingsRes.data
          ? normalizeSettings(settingsRes.data)
          : DEFAULT_SETTINGS,
        activeState,
      },
      error: null,
      tablesMissing: false,
    };
  } catch (err) {
    return { data: null, error: toMessage(err), tablesMissing: false };
  }
}

type Row = Record<string, unknown> & { id: string };

/** JSON with object keys sorted at every depth, so key order never reads as a change. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** Comparison key for a row, ignoring bookkeeping columns. */
function rowSignature(row: Row): string {
  const { updated_at: _ignored, ...rest } = row;
  void _ignored;
  return stableStringify(rest);
}

export interface RowDiff {
  upserts: Row[];
  deletes: string[];
}

/**
 * What has to be sent to move the server from `prev` to `next`.
 *
 * This replaced "upsert everything I have, delete everything I don't", which
 * is only correct when one device ever writes. With two or three devices open,
 * a device holding a stale copy would delete rows another device had just
 * created (a session, a completion) and resurrect rows it had removed (a task
 * that was completed elsewhere). Now:
 *
 *  - only rows that actually changed are upserted, and
 *  - only rows this device itself saw and then removed are deleted.
 *
 * `prev === null` means "no trustworthy baseline" (e.g. started from the
 * offline cache): upsert everything, delete nothing. Losing a delete is
 * recoverable; deleting another device's work is not.
 */
export function diffRows(prev: Row[] | null, next: Row[]): RowDiff {
  if (prev === null) return { upserts: next, deletes: [] };

  const before = new Map(prev.map((r) => [r.id, rowSignature(r)]));
  const nextIds = new Set(next.map((r) => r.id));

  return {
    upserts: next.filter((r) => before.get(r.id) !== rowSignature(r)),
    deletes: prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id),
  };
}

async function syncRows(
  table: string,
  userId: string,
  prev: Row[] | null,
  next: Row[],
): Promise<PersistResult> {
  const { upserts, deletes } = diffRows(prev, next);
  try {
    if (upserts.length > 0) {
      const stamped = upserts.map((r) =>
        'updated_at' in r ? { ...r, updated_at: new Date().toISOString() } : r,
      );
      const { error } = await supabase
        .from(table)
        .upsert(stamped, { onConflict: 'id,user_id' });
      if (error) return { error: error.message };
    }
    if (deletes.length > 0) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', userId)
        .in('id', deletes);
      if (error) return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

/** Maps a slice to its table rows; exported so diffs can be tested directly. */
export const toRows = {
  groups: (userId: string, groups: Group[]): Row[] =>
    groups.map((g, index) => ({
      id: g.id,
      user_id: userId,
      name: g.name,
      tasks: g.tasks,
      expanded: g.expanded ?? true,
      pinned: g.pinned ?? false,
      color: g.color ?? null,
      order_index: index,
      updated_at: '',
    })),
  completedTasks: (userId: string, tasks: CompletedTask[]): Row[] =>
    tasks.map((t) => ({
      id: t.id,
      user_id: userId,
      task_name: t.taskName,
      group_name: t.groupName,
      total_seconds: t.totalSeconds,
      completed_at: t.completedAt,
      ticket_id: t.ticketId || null,
      start_time: t.startTime || null,
      end_time: t.endTime || null,
      notes: t.notes || null,
    })),
  sessions: (userId: string, sessions: WorkSession[]): Row[] =>
    sessions.map((s) => ({
      id: s.id,
      user_id: userId,
      task_id: s.taskId,
      task_name: s.taskName,
      group_name: s.groupName,
      ticket_id: s.ticketId || null,
      start_time: s.startTime,
      end_time: s.endTime,
      duration_seconds: s.durationSeconds,
      notes: s.notes || null,
      completed_task_id: s.completedTaskId || null,
    })),
  noteGroups: (userId: string, noteGroups: NoteGroup[]): Row[] =>
    noteGroups.map((g, index) => ({
      id: g.id,
      user_id: userId,
      title: g.title,
      notes: g.notes,
      order_index: index,
    })),
  tags: (userId: string, tags: Tag[]): Row[] =>
    tags.map((t) => ({ id: t.id, user_id: userId, label: t.label, color: t.color })),
};

function collectionWriter<T>(table: string, map: (userId: string, value: T) => Row[]) {
  return (userId: string, next: T, prev: T | null): Promise<PersistResult> =>
    syncRows(table, userId, prev === null ? null : map(userId, prev), map(userId, next));
}

export const persistCompletedTasks = collectionWriter('completed_tasks', toRows.completedTasks);
export const persistSessions = collectionWriter('work_sessions', toRows.sessions);
export const persistTags = collectionWriter('tags', toRows.tags);

export async function persistSettings(
  userId: string,
  settings: AppSettings,
): Promise<PersistResult> {
  try {
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        daily_target_minutes: settings.dailyTargetMinutes,
        working_days: settings.workingDays,
        timer_reminder_enabled: settings.timerReminderEnabled,
        timer_reminder_minutes: settings.timerReminderMinutes,
        theme: settings.theme,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

export async function persistActiveState(
  userId: string,
  state: ActiveState,
): Promise<PersistResult> {
  try {
    const { error } = await supabase.from('user_active_state').upsert(
      {
        user_id: userId,
        running_task_id: state.runningTaskId,
        last_active_timestamp: state.lastActiveTimestamp,
        active_session_start: state.activeSessionStart,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

/**
 * Mark the running timer as still alive — but only if the server still says
 * THIS timer (same task, same start) is the one running. A device that missed
 * a pause, a switch or a completion made elsewhere must not write its stale
 * timer back over it; this conditional update simply matches nothing.
 */
export async function touchActiveState(
  userId: string,
  runningTaskId: string,
  activeSessionStart: number,
  now: number,
): Promise<PersistResult> {
  try {
    const { error } = await supabase
      .from('user_active_state')
      .update({ last_active_timestamp: now, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('running_task_id', runningTaskId)
      .eq('active_session_start', activeSessionStart);
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

type Child = { id: string } & Record<string, unknown>;

/**
 * Three-way merge of a nested list (a group's tasks, a note group's notes).
 *
 * Applies only what THIS device changed since `prev` onto what the server
 * holds now, so concurrent edits from other devices survive:
 *  - added here           -> added
 *  - removed here         -> removed
 *  - edited here          -> this version wins
 *  - removed elsewhere    -> stays removed (never resurrected by a stale copy)
 *  - added elsewhere      -> kept, at the top (where new items go)
 */
export function mergeChildren(server: Child[], prev: Child[], next: Child[]): Child[] {
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const nextIds = new Set(next.map((c) => c.id));
  const serverById = new Map(server.map((c) => [c.id, c]));

  const addedElsewhere = server.filter((c) => !prevById.has(c.id) && !nextIds.has(c.id));

  const mine: Child[] = [];
  for (const c of next) {
    const before = prevById.get(c.id);
    if (!before) {
      mine.push(c); // added here
      continue;
    }
    const onServer = serverById.get(c.id);
    if (!onServer) continue; // removed elsewhere: do not bring it back
    mine.push(stableStringify(before) === stableStringify(c) ? onServer : c);
  }

  return [...addedElsewhere, ...mine];
}

/**
 * Writer for tables whose rows embed a child list. Column-level, not
 * row-level: a change that doesn't touch the children (pin, reorder,
 * collapse, rename, colour) updates only those columns, and a change to the
 * children is merged into the server's current list rather than replacing
 * it. Otherwise one stale device toggling a group would overwrite every task
 * in it with its own outdated copy.
 */
function nestedWriter<T>(
  table: string,
  childKey: string,
  map: (userId: string, value: T) => Row[],
) {
  return async (userId: string, nextValue: T, prevValue: T | null): Promise<PersistResult> => {
    const next = map(userId, nextValue);
    const prev = prevValue === null ? null : map(userId, prevValue);
    const { upserts, deletes } = diffRows(prev, next);
    const prevById = new Map((prev ?? []).map((r) => [r.id, r]));

    try {
      const ids = upserts.map((r) => r.id);
      let serverById = new Map<string, Row>();
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from(table)
          .select(`id,${childKey}`)
          .eq('user_id', userId)
          .in('id', ids);
        if (error) return { error: error.message };
        serverById = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, r]));
      }

      const inserts: Row[] = [];
      for (const row of upserts) {
        const server = serverById.get(row.id);
        if (!server) {
          // New here (or deleted elsewhere and edited here): write it whole.
          inserts.push(row);
          continue;
        }

        const before = prevById.get(row.id) ?? server;
        const patch: Record<string, unknown> = {};
        for (const [col, value] of Object.entries(row)) {
          if (col === 'id' || col === 'user_id' || col === 'updated_at') continue;
          if (stableStringify(before[col]) !== stableStringify(value)) patch[col] = value;
        }
        if (childKey in patch) {
          patch[childKey] = mergeChildren(
            (server[childKey] as Child[] | undefined) ?? [],
            (before[childKey] as Child[] | undefined) ?? [],
            (row[childKey] as Child[] | undefined) ?? [],
          );
        }
        if (Object.keys(patch).length === 0) continue;
        if ('updated_at' in row) patch.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from(table)
          .update(patch)
          .eq('user_id', userId)
          .eq('id', row.id);
        if (error) return { error: error.message };
      }

      if (inserts.length > 0) {
        const stamped = inserts.map((r) =>
          'updated_at' in r ? { ...r, updated_at: new Date().toISOString() } : r,
        );
        const { error } = await supabase
          .from(table)
          .upsert(stamped, { onConflict: 'id,user_id' });
        if (error) return { error: error.message };
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('user_id', userId)
          .in('id', deletes);
        if (error) return { error: error.message };
      }
      return { error: null };
    } catch (err) {
      return { error: toMessage(err) };
    }
  };
}

export const persistGroups = nestedWriter('groups', 'tasks', toRows.groups);
export const persistNoteGroups = nestedWriter('note_groups', 'notes', toRows.noteGroups);
