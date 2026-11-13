import { supabase } from './supabase';
import type {
  Group,
  CompletedTask,
  WorkSession,
  NoteGroup,
  AppSettings,
} from '@/types';

export interface UserDbData {
  groups: Group[];
  completedTasks: CompletedTask[];
  sessions: WorkSession[];
  noteGroups: NoteGroup[];
  settings: AppSettings | null;
  activeState: {
    runningTaskId: string | null;
    lastActiveTimestamp: number | null;
    activeSessionStart: number | null;
  } | null;
}

/**
 * Fetch all user data from Supabase
 */
export async function fetchUserData(userId: string): Promise<{
  data: UserDbData | null;
  error: string | null;
  tablesMissing?: boolean;
}> {
  try {
    const [
      groupsRes,
      completedRes,
      sessionsRes,
      notesRes,
      settingsRes,
      activeRes,
    ] = await Promise.all([
      supabase.from('groups').select('*').eq('user_id', userId).order('order_index'),
      supabase.from('completed_tasks').select('*').eq('user_id', userId).order('completed_at', { ascending: false }),
      supabase.from('work_sessions').select('*').eq('user_id', userId).order('start_time', { ascending: false }),
      supabase.from('note_groups').select('*').eq('user_id', userId).order('order_index'),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_active_state').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // Check if any error indicates missing tables
    const anyError =
      groupsRes.error ||
      completedRes.error ||
      sessionsRes.error ||
      notesRes.error ||
      settingsRes.error;

    if (anyError) {
      const msg = anyError.message || '';
      const isMissingTable =
        msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        anyError.code === '42P01' ||
        anyError.code === 'PGRST204';

      return {
        data: null,
        error: anyError.message,
        tablesMissing: isMissingTable,
      };
    }

    const groups: Group[] = (groupsRes.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      tasks: Array.isArray(row.tasks) ? row.tasks : [],
      expanded: row.expanded ?? true,
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

    let settings: AppSettings | null = null;
    if (settingsRes.data) {
      settings = {
        dailyTargetMinutes: settingsRes.data.daily_target_minutes,
        workingDays: Array.isArray(settingsRes.data.working_days)
          ? settingsRes.data.working_days
          : [1, 2, 3, 4, 5],
      };
    }

    let activeState = null;
    if (activeRes.data) {
      activeState = {
        runningTaskId: activeRes.data.running_task_id || null,
        lastActiveTimestamp: activeRes.data.last_active_timestamp
          ? Number(activeRes.data.last_active_timestamp)
          : null,
        activeSessionStart: activeRes.data.active_session_start
          ? Number(activeRes.data.active_session_start)
          : null,
      };
    }

    return {
      data: {
        groups,
        completedTasks,
        sessions,
        noteGroups,
        settings,
        activeState,
      },
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { data: null, error: errorMsg };
  }
}

/**
 * Upsert user groups
 */
export async function syncGroupsToSupabase(
  userId: string,
  groups: Group[]
): Promise<void> {
  try {
    // Upsert all groups
    if (groups.length > 0) {
      const rows = groups.map((g, index) => ({
        id: g.id,
        user_id: userId,
        name: g.name,
        tasks: g.tasks,
        expanded: g.expanded ?? true,
        order_index: index,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('groups').upsert(rows, { onConflict: 'id,user_id' });
    }

    // Delete groups no longer in the array
    const groupIds = groups.map((g) => g.id);
    if (groupIds.length > 0) {
      await supabase
        .from('groups')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${groupIds.map((id) => `"${id}"`).join(',')})`);
    } else {
      await supabase.from('groups').delete().eq('user_id', userId);
    }
  } catch (err) {
    console.error('Failed to sync groups to Supabase:', err);
  }
}

/**
 * Upsert completed tasks
 */
export async function syncCompletedTasksToSupabase(
  userId: string,
  tasks: CompletedTask[]
): Promise<void> {
  try {
    if (tasks.length > 0) {
      const rows = tasks.map((t) => ({
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
      }));
      await supabase.from('completed_tasks').upsert(rows, { onConflict: 'id,user_id' });
    }
  } catch (err) {
    console.error('Failed to sync completed tasks to Supabase:', err);
  }
}

/**
 * Upsert work sessions
 */
export async function syncSessionsToSupabase(
  userId: string,
  sessions: WorkSession[]
): Promise<void> {
  try {
    if (sessions.length > 0) {
      const rows = sessions.map((s) => ({
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
      }));
      await supabase.from('work_sessions').upsert(rows, { onConflict: 'id,user_id' });
    }
  } catch (err) {
    console.error('Failed to sync work sessions to Supabase:', err);
  }
}

/**
 * Upsert note groups
 */
export async function syncNoteGroupsToSupabase(
  userId: string,
  noteGroups: NoteGroup[]
): Promise<void> {
  try {
    if (noteGroups.length > 0) {
      const rows = noteGroups.map((g, index) => ({
        id: g.id,
        user_id: userId,
        title: g.title,
        notes: g.notes,
        order_index: index,
      }));
      await supabase.from('note_groups').upsert(rows, { onConflict: 'id,user_id' });
    }

    const ids = noteGroups.map((g) => g.id);
    if (ids.length > 0) {
      await supabase
        .from('note_groups')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
    } else {
      await supabase.from('note_groups').delete().eq('user_id', userId);
    }
  } catch (err) {
    console.error('Failed to sync note groups to Supabase:', err);
  }
}

/**
 * Upsert user settings
 */
export async function syncSettingsToSupabase(
  userId: string,
  settings: AppSettings
): Promise<void> {
  try {
    await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        daily_target_minutes: settings.dailyTargetMinutes,
        working_days: settings.workingDays,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.error('Failed to sync settings to Supabase:', err);
  }
}

/**
 * Upsert active timer state
 */
export async function syncActiveStateToSupabase(
  userId: string,
  runningTaskId: string | null,
  lastActiveTimestamp: number | null,
  activeSessionStart: number | null
): Promise<void> {
  try {
    await supabase.from('user_active_state').upsert(
      {
        user_id: userId,
        running_task_id: runningTaskId,
        last_active_timestamp: lastActiveTimestamp,
        active_session_start: activeSessionStart,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.error('Failed to sync active state to Supabase:', err);
  }
}
