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
}): AppSettings {
  return {
    dailyTargetMinutes:
      typeof raw.daily_target_minutes === 'number' && raw.daily_target_minutes > 0
        ? raw.daily_target_minutes
        : DEFAULT_SETTINGS.dailyTargetMinutes,
    workingDays: Array.isArray(raw.working_days)
      ? (raw.working_days as number[])
      : DEFAULT_SETTINGS.workingDays,
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

/**
 * Replace a whole collection for one user: upsert the current rows,
 * then delete anything the client no longer has. Keeps local deletes
 * from silently resurrecting on the next load.
 */
async function replaceCollection(
  table: string,
  userId: string,
  rows: Record<string, unknown>[],
  ids: string[],
): Promise<PersistResult> {
  try {
    if (rows.length > 0) {
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id,user_id' });
      if (error) return { error: error.message };
    }

    const base = supabase.from(table).delete().eq('user_id', userId);
    const { error } = ids.length
      ? await base.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`)
      : await base;

    return { error: error ? error.message : null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

export function persistGroups(userId: string, groups: Group[]): Promise<PersistResult> {
  return replaceCollection(
    'groups',
    userId,
    groups.map((g, index) => ({
      id: g.id,
      user_id: userId,
      name: g.name,
      tasks: g.tasks,
      expanded: g.expanded ?? true,
      pinned: g.pinned ?? false,
      order_index: index,
      updated_at: new Date().toISOString(),
    })),
    groups.map((g) => g.id),
  );
}

export function persistCompletedTasks(
  userId: string,
  tasks: CompletedTask[],
): Promise<PersistResult> {
  return replaceCollection(
    'completed_tasks',
    userId,
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
    tasks.map((t) => t.id),
  );
}

export function persistSessions(
  userId: string,
  sessions: WorkSession[],
): Promise<PersistResult> {
  return replaceCollection(
    'work_sessions',
    userId,
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
    sessions.map((s) => s.id),
  );
}

export function persistNoteGroups(
  userId: string,
  noteGroups: NoteGroup[],
): Promise<PersistResult> {
  return replaceCollection(
    'note_groups',
    userId,
    noteGroups.map((g, index) => ({
      id: g.id,
      user_id: userId,
      title: g.title,
      notes: g.notes,
      order_index: index,
    })),
    noteGroups.map((g) => g.id),
  );
}

export function persistTags(userId: string, tags: Tag[]): Promise<PersistResult> {
  return replaceCollection(
    'tags',
    userId,
    tags.map((t) => ({
      id: t.id,
      user_id: userId,
      label: t.label,
      color: t.color,
    })),
    tags.map((t) => t.id),
  );
}

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
