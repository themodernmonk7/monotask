import { supabase } from './supabase';
import type {
  DailyReportData,
  WeeklyReportData,
  MonthlyReportData,
  ProjectBreakdown,
  TicketBreakdown,
} from './analytics';
import type { TargetStatus } from '../types';

export type ReportKind = 'daily' | 'weekly' | 'monthly';

/**
 * What actually gets stored and shown publicly — never the full report
 * object. Two things are deliberately left out of every snapshot kind:
 *
 *  - `rawSlices` (daily report only): per-session start/end times and notes.
 *    A shared report is a summary for a manager or client, not a dump of
 *    exactly when you worked and what you wrote to yourself about it.
 *  - Live `Date` objects: JSONB round-trips everything to strings anyway: a
 *    snapshot type that still claimed `Date` would be lying about what you
 *    get back from storage.
 */
export interface SharedDailySnapshot {
  kind: 'daily';
  dateKey: string;
  totalWorkingSeconds: number;
  targetSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  percentage: number;
  status: TargetStatus;
  taskCount: number;
  ticketCount: number;
  projects: ProjectBreakdown[];
  tickets: TicketBreakdown[];
}

export interface SharedWeekDay {
  dateKey: string;
  dayName: string;
  isWorkingDay: boolean;
  loggedSeconds: number;
  targetSeconds: number;
  status: TargetStatus;
}

export interface SharedWeeklySnapshot {
  kind: 'weekly';
  startDateKey: string;
  endDateKey: string;
  totalWorkingSeconds: number;
  totalExpectedWorkingSeconds: number;
  averageWorkingSecondsPerDay: number;
  daysTargetCompleted: number;
  daysBelowTarget: number;
  totalOvertimeSeconds: number;
  days: SharedWeekDay[];
  projects: ProjectBreakdown[];
  tickets: TicketBreakdown[];
  taskCount: number;
  ticketCount: number;
}

export interface SharedMonthDay {
  dateKey: string;
  dayOfMonth: number;
  isWorkingDay: boolean;
  loggedSeconds: number;
  targetSeconds: number;
  status: TargetStatus;
}

export interface SharedMonthlySnapshot {
  kind: 'monthly';
  monthName: string;
  totalWorkingSeconds: number;
  totalExpectedWorkingSeconds: number;
  averageDailyWorkingSeconds: number;
  daysTargetCompleted: number;
  daysBelowTarget: number;
  totalOvertimeSeconds: number;
  workingDaysCount: number;
  days: SharedMonthDay[];
  projects: ProjectBreakdown[];
  tickets: TicketBreakdown[];
  taskCount: number;
  ticketCount: number;
}

export type ReportSnapshot =
  | SharedDailySnapshot
  | SharedWeeklySnapshot
  | SharedMonthlySnapshot;

const dateKeyOf = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function buildDailySnapshot(data: DailyReportData): SharedDailySnapshot {
  return {
    kind: 'daily',
    dateKey: data.dateKey,
    totalWorkingSeconds: data.totalWorkingSeconds,
    targetSeconds: data.targetSeconds,
    remainingSeconds: data.remainingSeconds,
    overtimeSeconds: data.overtimeSeconds,
    percentage: data.percentage,
    status: data.status,
    taskCount: data.taskCount,
    ticketCount: data.ticketCount,
    projects: data.projects,
    tickets: data.tickets,
  };
}

export function buildWeeklySnapshot(data: WeeklyReportData): SharedWeeklySnapshot {
  return {
    kind: 'weekly',
    startDateKey: dateKeyOf(data.startDate),
    endDateKey: dateKeyOf(data.endDate),
    totalWorkingSeconds: data.totalWorkingSeconds,
    totalExpectedWorkingSeconds: data.totalExpectedWorkingSeconds,
    averageWorkingSecondsPerDay: data.averageWorkingSecondsPerDay,
    daysTargetCompleted: data.daysTargetCompleted,
    daysBelowTarget: data.daysBelowTarget,
    totalOvertimeSeconds: data.totalOvertimeSeconds,
    days: data.days.map((d) => ({
      dateKey: d.dateKey,
      dayName: d.dayName,
      isWorkingDay: d.isWorkingDay,
      loggedSeconds: d.loggedSeconds,
      targetSeconds: d.targetSeconds,
      status: d.status,
    })),
    projects: data.projects,
    tickets: data.tickets,
    taskCount: data.taskCount,
    ticketCount: data.ticketCount,
  };
}

export function buildMonthlySnapshot(data: MonthlyReportData): SharedMonthlySnapshot {
  return {
    kind: 'monthly',
    monthName: data.monthName,
    totalWorkingSeconds: data.totalWorkingSeconds,
    totalExpectedWorkingSeconds: data.totalExpectedWorkingSeconds,
    averageDailyWorkingSeconds: data.averageDailyWorkingSeconds,
    daysTargetCompleted: data.daysTargetCompleted,
    daysBelowTarget: data.daysBelowTarget,
    totalOvertimeSeconds: data.totalOvertimeSeconds,
    workingDaysCount: data.workingDaysCount,
    days: data.days.map((d) => ({
      dateKey: d.dateKey,
      dayOfMonth: d.dayOfMonth,
      isWorkingDay: d.isWorkingDay,
      loggedSeconds: d.loggedSeconds,
      targetSeconds: d.targetSeconds,
      status: d.status,
    })),
    projects: data.projects,
    tickets: data.tickets,
    taskCount: data.taskCount,
    ticketCount: data.ticketCount,
  };
}

// ---------------------------------------------------------------------------
// Supabase calls
// ---------------------------------------------------------------------------

export interface SharedReportRow {
  id: string;
  periodLabel: string;
  reportType: ReportKind;
  ownerName: string | null;
  snapshot: ReportSnapshot;
  revoked: boolean;
  createdAt: string;
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function createSharedReport(
  userId: string,
  periodLabel: string,
  ownerName: string | null,
  snapshot: ReportSnapshot,
): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('shared_reports')
      .insert({
        user_id: userId,
        period_label: periodLabel,
        report_type: snapshot.kind,
        owner_name: ownerName,
        snapshot,
      })
      .select('id')
      .single();

    if (error) return { id: null, error: error.message };
    return { id: data.id as string, error: null };
  } catch (err) {
    return { id: null, error: toMessage(err) };
  }
}

/**
 * Anon-safe: works whether or not anyone is signed in. There is no raw
 * SELECT grant on the table for anon/authenticated — this RPC is the only
 * public read path, and it can only ever return the one row matching this
 * exact id (see get_shared_report in schema.sql for why that matters).
 */
export async function fetchSharedReport(
  id: string,
): Promise<{ data: SharedReportRow | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('get_shared_report', { share_id: id })
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: null }; // revoked, or never existed

    // The client has no generated DB types, so .rpc() can't infer this
    // function's return row — it's exactly what get_shared_report selects.
    const row = data as {
      id: string;
      period_label: string;
      report_type: ReportKind;
      owner_name: string | null;
      snapshot: ReportSnapshot;
      created_at: string;
    };

    return {
      data: {
        id: row.id,
        periodLabel: row.period_label,
        reportType: row.report_type,
        ownerName: row.owner_name,
        snapshot: row.snapshot,
        revoked: false, // the function only ever returns non-revoked rows
        createdAt: row.created_at,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

export interface SharedReportSummary {
  id: string;
  periodLabel: string;
  reportType: ReportKind;
  createdAt: string;
}

export async function listMySharedReports(
  userId: string,
): Promise<{ data: SharedReportSummary[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('shared_reports')
      .select('id, period_label, report_type, created_at')
      .eq('user_id', userId)
      .eq('revoked', false)
      .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return {
      data: (data || []).map((r) => ({
        id: r.id,
        periodLabel: r.period_label,
        reportType: r.report_type,
        createdAt: r.created_at,
      })),
      error: null,
    };
  } catch (err) {
    return { data: [], error: toMessage(err) };
  }
}

export async function revokeSharedReport(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('shared_reports')
      .update({ revoked: true })
      .eq('id', id)
      .eq('user_id', userId);
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: toMessage(err) };
  }
}

export function sharedReportUrl(id: string): string {
  return `${window.location.origin}/share/${id}`;
}
