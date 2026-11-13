import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  getDay,
} from 'date-fns';
import type {
  WorkSession,
  AppSettings,
  TargetStatus,
  DailyTargetProgress,
} from '../types';

/**
 * Extract ticket ID from task names like:
 * "[PROJ-123] Fix login", "PROJ-123: Fix login", "#123 Fix login"
 */
export function extractTicketId(text: string): string | null {
  if (!text) return null;
  const bracketMatch = text.match(/\[([A-Za-z0-9_-]+-\d+|#\d+)\]/);
  if (bracketMatch) return bracketMatch[1];

  const codeMatch = text.match(/\b([A-Za-z]{2,}-\d+)\b/);
  if (codeMatch) return codeMatch[1];

  const hashMatch = text.match(/\B(#\d+)\b/);
  if (hashMatch) return hashMatch[1];

  return null;
}

/**
 * Clean task title if it started with [TICKET-ID]
 */
export function cleanTaskTitle(text: string): string {
  if (!text) return '';
  return text.replace(/^\[[A-Za-z0-9_-]+\]\s*/, '').trim();
}

/**
 * Format duration as "1h 25m", "45m", "30s"
 */
export function formatDurationHuman(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return remSec > 0 ? `${m}m ${remSec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (remMin === 0) return `${h}h`;
  return `${h}h ${remMin}m`;
}

/**
 * Format duration as decimal hours e.g. "7.50"
 */
export function formatHoursDecimal(seconds: number): string {
  const h = Math.max(0, seconds) / 3600;
  return h.toFixed(2);
}

/**
 * Format duration in minutes e.g. "450"
 */
export function formatMinutesNumber(seconds: number): string {
  const m = Math.max(0, seconds) / 60;
  return m % 1 === 0 ? m.toString() : m.toFixed(1);
}

export interface SessionDaySlice {
  dateKey: string; // YYYY-MM-DD
  date: Date;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  session: WorkSession;
}

/**
 * Slices a WorkSession across midnight into distinct calendar days.
 * Ensures the sum of slice durations equals session.durationSeconds.
 */
export function sliceSessionByDay(session: WorkSession): SessionDaySlice[] {
  if (session.durationSeconds <= 0 || session.endTime <= session.startTime) {
    const d = new Date(session.startTime);
    const dateKey = format(d, 'yyyy-MM-dd');
    return [
      {
        dateKey,
        date: startOfDay(d),
        startTime: session.startTime,
        endTime: session.endTime,
        durationSeconds: Math.max(0, session.durationSeconds),
        session,
      },
    ];
  }

  const slices: SessionDaySlice[] = [];
  const startD = new Date(session.startTime);
  const endD = new Date(session.endTime);

  const startDay = startOfDay(startD);
  const endDay = startOfDay(endD);

  if (startDay.getTime() === endDay.getTime()) {
    slices.push({
      dateKey: format(startDay, 'yyyy-MM-dd'),
      date: startDay,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds,
      session,
    });
    return slices;
  }

  // Session crosses midnight!
  const totalMs = Math.max(1, session.endTime - session.startTime);
  let currDay = startDay;
  const daysList: Date[] = [];
  while (currDay.getTime() <= endDay.getTime()) {
    daysList.push(new Date(currDay));
    currDay = addDays(currDay, 1);
  }

  let allocatedSeconds = 0;
  daysList.forEach((day, index) => {
    const dayStartMs = startOfDay(day).getTime();
    const dayEndMs = endOfDay(day).getTime();

    const overlapStart = Math.max(session.startTime, dayStartMs);
    const overlapEnd = Math.min(session.endTime, dayEndMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);

    let sliceSec = 0;
    if (index === daysList.length - 1) {
      sliceSec = Math.max(0, session.durationSeconds - allocatedSeconds);
    } else {
      sliceSec = Math.round(session.durationSeconds * (overlapMs / totalMs));
      allocatedSeconds += sliceSec;
    }

    if (sliceSec > 0 || overlapMs > 0) {
      slices.push({
        dateKey: format(day, 'yyyy-MM-dd'),
        date: day,
        startTime: overlapStart,
        endTime: overlapEnd,
        durationSeconds: sliceSec,
        session,
      });
    }
  });

  return slices;
}

/**
 * Merges overlapping intervals to prevent double-counting
 */
export function mergeIntervals(
  intervals: { start: number; end: number }[]
): { start: number; end: number }[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Slices all sessions and returns slices for a specific date range.
 * Also deduplicates so no session is counted twice.
 */
export function getAllSlicesInRange(
  sessions: WorkSession[],
  rangeStart: Date,
  rangeEnd: Date
): SessionDaySlice[] {
  const startMs = startOfDay(rangeStart).getTime();
  const endMs = endOfDay(rangeEnd).getTime();

  const allSlices: SessionDaySlice[] = [];
  const seenIds = new Set<string>();

  for (const session of sessions) {
    // Avoid processing the same session ID multiple times
    if (seenIds.has(session.id)) continue;
    seenIds.add(session.id);

    const slices = sliceSessionByDay(session);
    for (const slice of slices) {
      const sliceMid = slice.date.getTime();
      if (sliceMid >= startMs && sliceMid <= endMs) {
        allSlices.push(slice);
      }
    }
  }

  return allSlices;
}

/**
 * Calculate Daily Target Progress
 */
export function calculateDailyTargetProgress(
  loggedSecondsToday: number,
  targetMinutes: number
): DailyTargetProgress {
  const targetSeconds = Math.max(0, targetMinutes * 60);
  const loggedSeconds = Math.max(0, loggedSecondsToday);

  let remainingSeconds = 0;
  let overtimeSeconds = 0;
  let status: TargetStatus = 'below';

  if (targetSeconds === 0) {
    status = loggedSeconds > 0 ? 'overtime' : 'completed';
    overtimeSeconds = loggedSeconds;
  } else if (loggedSeconds < targetSeconds) {
    remainingSeconds = targetSeconds - loggedSeconds;
    status = 'below';
  } else if (loggedSeconds === targetSeconds) {
    remainingSeconds = 0;
    status = 'completed';
  } else {
    overtimeSeconds = loggedSeconds - targetSeconds;
    status = 'overtime';
  }

  const percentage =
    targetSeconds > 0 ? Math.round((loggedSeconds / targetSeconds) * 100) : 100;

  return {
    targetMinutes,
    targetSeconds,
    loggedSeconds,
    remainingSeconds,
    overtimeSeconds,
    percentage,
    status,
  };
}

export interface ProjectBreakdown {
  projectName: string;
  totalSeconds: number;
  percentage: number;
  taskCount: number;
  ticketCount: number;
}

export interface TicketBreakdown {
  ticketId: string;
  taskName: string;
  projectName: string;
  totalSeconds: number;
  percentage: number;
  sessionCount: number;
  notes?: string;
}

export interface DailyReportData {
  date: Date;
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
  rawSlices: SessionDaySlice[];
}

export function getDailyReportData(
  sessions: WorkSession[],
  targetDate: Date,
  settings: AppSettings
): DailyReportData {
  const dateKey = format(targetDate, 'yyyy-MM-dd');
  const slices = getAllSlicesInRange(sessions, targetDate, targetDate);

  const totalWorkingSeconds = slices.reduce((sum, s) => sum + s.durationSeconds, 0);

  const dayOfWeek = getDay(targetDate);
  const isWorkingDay = settings.workingDays.includes(dayOfWeek);
  const targetSeconds = isWorkingDay ? settings.dailyTargetMinutes * 60 : 0;

  const progress = calculateDailyTargetProgress(
    totalWorkingSeconds,
    isWorkingDay ? settings.dailyTargetMinutes : 0
  );

  // Group by project
  const projectMap = new Map<string, { totalSeconds: number; tasks: Set<string>; tickets: Set<string> }>();
  // Group by ticket / task
  const ticketMap = new Map<
    string,
    {
      ticketId: string;
      taskName: string;
      projectName: string;
      totalSeconds: number;
      sessionCount: number;
      notes: Set<string>;
    }
  >();

  const taskSet = new Set<string>();
  const ticketSet = new Set<string>();

  for (const slice of slices) {
    const s = slice.session;
    taskSet.add(s.taskName);
    const tid = s.ticketId || extractTicketId(s.taskName) || '-';
    if (tid !== '-') ticketSet.add(tid);

    // Project breakdown
    const projEntry = projectMap.get(s.groupName) ?? {
      totalSeconds: 0,
      tasks: new Set(),
      tickets: new Set(),
    };
    projEntry.totalSeconds += slice.durationSeconds;
    projEntry.tasks.add(s.taskName);
    if (tid !== '-') projEntry.tickets.add(tid);
    projectMap.set(s.groupName, projEntry);

    // Ticket breakdown key: group + taskName
    const ticketKey = `${s.groupName}::${s.taskName}`;
    const tEntry = ticketMap.get(ticketKey) ?? {
      ticketId: tid,
      taskName: s.taskName,
      projectName: s.groupName,
      totalSeconds: 0,
      sessionCount: 0,
      notes: new Set(),
    };
    tEntry.totalSeconds += slice.durationSeconds;
    tEntry.sessionCount += 1;
    if (s.notes) tEntry.notes.add(s.notes);
    ticketMap.set(ticketKey, tEntry);
  }

  const projects: ProjectBreakdown[] = Array.from(projectMap.entries())
    .map(([projectName, val]) => ({
      projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      taskCount: val.tasks.size,
      ticketCount: val.tickets.size,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  const tickets: TicketBreakdown[] = Array.from(ticketMap.values())
    .map((val) => ({
      ticketId: val.ticketId,
      taskName: val.taskName,
      projectName: val.projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      sessionCount: val.sessionCount,
      notes: Array.from(val.notes).join('; '),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return {
    date: targetDate,
    dateKey,
    totalWorkingSeconds,
    targetSeconds,
    remainingSeconds: progress.remainingSeconds,
    overtimeSeconds: progress.overtimeSeconds,
    percentage: progress.percentage,
    status: progress.status,
    taskCount: taskSet.size,
    ticketCount: ticketSet.size,
    projects,
    tickets,
    rawSlices: slices,
  };
}

export interface DayInWeekData {
  date: Date;
  dateKey: string;
  dayName: string; // Mon, Tue, etc.
  dayNumber: number; // 0=Sun, 1=Mon, ..., 6=Sat
  isWorkingDay: boolean;
  loggedSeconds: number;
  targetSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  status: TargetStatus;
  completedTarget: boolean;
}

export interface WeeklyReportData {
  startDate: Date;
  endDate: Date;
  totalWorkingSeconds: number;
  totalExpectedWorkingSeconds: number;
  averageWorkingSecondsPerDay: number;
  daysTargetCompleted: number;
  daysBelowTarget: number;
  totalOvertimeSeconds: number;
  days: DayInWeekData[];
  projects: ProjectBreakdown[];
  tickets: TicketBreakdown[];
  taskCount: number;
  ticketCount: number;
}

export function getWeeklyReportData(
  sessions: WorkSession[],
  refDate: Date,
  settings: AppSettings
): WeeklyReportData {
  // ISO week starts on Monday (weekStartsOn: 1)
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(refDate, { weekStartsOn: 1 });

  const allSlices = getAllSlicesInRange(sessions, weekStart, weekEnd);
  const totalWorkingSeconds = allSlices.reduce((sum, s) => sum + s.durationSeconds, 0);

  const days: DayInWeekData[] = [];
  let daysTargetCompleted = 0;
  let daysBelowTarget = 0;
  let totalOvertimeSeconds = 0;
  let workingDaysCount = 0;

  for (let i = 0; i < 7; i++) {
    const currentDay = addDays(weekStart, i);
    const dateKey = format(currentDay, 'yyyy-MM-dd');
    const dayOfWeek = getDay(currentDay);
    const isWorkingDay = settings.workingDays.includes(dayOfWeek);

    if (isWorkingDay) {
      workingDaysCount++;
    }

    const daySlices = allSlices.filter((s) => s.dateKey === dateKey);
    const dayLoggedSeconds = daySlices.reduce((sum, s) => sum + s.durationSeconds, 0);
    const dayTargetSeconds = isWorkingDay ? settings.dailyTargetMinutes * 60 : 0;

    const progress = calculateDailyTargetProgress(
      dayLoggedSeconds,
      isWorkingDay ? settings.dailyTargetMinutes : 0
    );

    const completed = isWorkingDay && dayTargetSeconds > 0 && dayLoggedSeconds >= dayTargetSeconds;
    if (completed) {
      daysTargetCompleted++;
    } else if (isWorkingDay && dayLoggedSeconds < dayTargetSeconds) {
      daysBelowTarget++;
    }

    totalOvertimeSeconds += progress.overtimeSeconds;

    days.push({
      date: currentDay,
      dateKey,
      dayName: format(currentDay, 'EEE'),
      dayNumber: dayOfWeek,
      isWorkingDay,
      loggedSeconds: dayLoggedSeconds,
      targetSeconds: dayTargetSeconds,
      remainingSeconds: progress.remainingSeconds,
      overtimeSeconds: progress.overtimeSeconds,
      status: progress.status,
      completedTarget: completed,
    });
  }

  const totalExpectedWorkingSeconds = workingDaysCount * settings.dailyTargetMinutes * 60;
  const averageWorkingSecondsPerDay =
    workingDaysCount > 0 ? Math.round(totalWorkingSeconds / workingDaysCount) : 0;

  // Group by project
  const projectMap = new Map<string, { totalSeconds: number; tasks: Set<string>; tickets: Set<string> }>();
  const ticketMap = new Map<
    string,
    {
      ticketId: string;
      taskName: string;
      projectName: string;
      totalSeconds: number;
      sessionCount: number;
      notes: Set<string>;
    }
  >();
  const taskSet = new Set<string>();
  const ticketSet = new Set<string>();

  for (const slice of allSlices) {
    const s = slice.session;
    taskSet.add(s.taskName);
    const tid = s.ticketId || extractTicketId(s.taskName) || '-';
    if (tid !== '-') ticketSet.add(tid);

    const projEntry = projectMap.get(s.groupName) ?? {
      totalSeconds: 0,
      tasks: new Set(),
      tickets: new Set(),
    };
    projEntry.totalSeconds += slice.durationSeconds;
    projEntry.tasks.add(s.taskName);
    if (tid !== '-') projEntry.tickets.add(tid);
    projectMap.set(s.groupName, projEntry);

    const ticketKey = `${s.groupName}::${s.taskName}`;
    const tEntry = ticketMap.get(ticketKey) ?? {
      ticketId: tid,
      taskName: s.taskName,
      projectName: s.groupName,
      totalSeconds: 0,
      sessionCount: 0,
      notes: new Set(),
    };
    tEntry.totalSeconds += slice.durationSeconds;
    tEntry.sessionCount += 1;
    if (s.notes) tEntry.notes.add(s.notes);
    ticketMap.set(ticketKey, tEntry);
  }

  const projects: ProjectBreakdown[] = Array.from(projectMap.entries())
    .map(([projectName, val]) => ({
      projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      taskCount: val.tasks.size,
      ticketCount: val.tickets.size,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  const tickets: TicketBreakdown[] = Array.from(ticketMap.values())
    .map((val) => ({
      ticketId: val.ticketId,
      taskName: val.taskName,
      projectName: val.projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      sessionCount: val.sessionCount,
      notes: Array.from(val.notes).join('; '),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return {
    startDate: weekStart,
    endDate: weekEnd,
    totalWorkingSeconds,
    totalExpectedWorkingSeconds,
    averageWorkingSecondsPerDay,
    daysTargetCompleted,
    daysBelowTarget,
    totalOvertimeSeconds,
    days,
    projects,
    tickets,
    taskCount: taskSet.size,
    ticketCount: ticketSet.size,
  };
}

export interface DayInMonthData {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  isWorkingDay: boolean;
  loggedSeconds: number;
  targetSeconds: number;
  status: TargetStatus;
  completedTarget: boolean;
}

export interface MonthlyReportData {
  monthDate: Date;
  monthName: string;
  totalWorkingSeconds: number;
  totalExpectedWorkingSeconds: number;
  averageDailyWorkingSeconds: number;
  daysTargetCompleted: number;
  daysBelowTarget: number;
  totalOvertimeSeconds: number;
  workingDaysCount: number;
  days: DayInMonthData[];
  projects: ProjectBreakdown[];
  tickets: TicketBreakdown[];
  taskCount: number;
  ticketCount: number;
}

export function getMonthlyReportData(
  sessions: WorkSession[],
  refDate: Date,
  settings: AppSettings
): MonthlyReportData {
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  const allSlices = getAllSlicesInRange(sessions, monthStart, monthEnd);
  const totalWorkingSeconds = allSlices.reduce((sum, s) => sum + s.durationSeconds, 0);

  const days: DayInMonthData[] = [];
  let daysTargetCompleted = 0;
  let daysBelowTarget = 0;
  let totalOvertimeSeconds = 0;
  let workingDaysCount = 0;

  let cur = new Date(monthStart);
  while (cur.getTime() <= monthEnd.getTime()) {
    const dateKey = format(cur, 'yyyy-MM-dd');
    const dayOfWeek = getDay(cur);
    const isWorkingDay = settings.workingDays.includes(dayOfWeek);

    if (isWorkingDay) {
      workingDaysCount++;
    }

    const daySlices = allSlices.filter((s) => s.dateKey === dateKey);
    const dayLoggedSeconds = daySlices.reduce((sum, s) => sum + s.durationSeconds, 0);
    const dayTargetSeconds = isWorkingDay ? settings.dailyTargetMinutes * 60 : 0;

    const progress = calculateDailyTargetProgress(
      dayLoggedSeconds,
      isWorkingDay ? settings.dailyTargetMinutes : 0
    );

    const completed = isWorkingDay && dayTargetSeconds > 0 && dayLoggedSeconds >= dayTargetSeconds;
    if (completed) {
      daysTargetCompleted++;
    } else if (isWorkingDay && dayLoggedSeconds < dayTargetSeconds) {
      daysBelowTarget++;
    }

    totalOvertimeSeconds += progress.overtimeSeconds;

    days.push({
      date: new Date(cur),
      dateKey,
      dayOfMonth: cur.getDate(),
      isWorkingDay,
      loggedSeconds: dayLoggedSeconds,
      targetSeconds: dayTargetSeconds,
      status: progress.status,
      completedTarget: completed,
    });

    cur = addDays(cur, 1);
  }

  const totalExpectedWorkingSeconds = workingDaysCount * settings.dailyTargetMinutes * 60;
  const averageDailyWorkingSeconds =
    workingDaysCount > 0 ? Math.round(totalWorkingSeconds / workingDaysCount) : 0;

  // Group by project
  const projectMap = new Map<string, { totalSeconds: number; tasks: Set<string>; tickets: Set<string> }>();
  const ticketMap = new Map<
    string,
    {
      ticketId: string;
      taskName: string;
      projectName: string;
      totalSeconds: number;
      sessionCount: number;
      notes: Set<string>;
    }
  >();
  const taskSet = new Set<string>();
  const ticketSet = new Set<string>();

  for (const slice of allSlices) {
    const s = slice.session;
    taskSet.add(s.taskName);
    const tid = s.ticketId || extractTicketId(s.taskName) || '-';
    if (tid !== '-') ticketSet.add(tid);

    const projEntry = projectMap.get(s.groupName) ?? {
      totalSeconds: 0,
      tasks: new Set(),
      tickets: new Set(),
    };
    projEntry.totalSeconds += slice.durationSeconds;
    projEntry.tasks.add(s.taskName);
    if (tid !== '-') projEntry.tickets.add(tid);
    projectMap.set(s.groupName, projEntry);

    const ticketKey = `${s.groupName}::${s.taskName}`;
    const tEntry = ticketMap.get(ticketKey) ?? {
      ticketId: tid,
      taskName: s.taskName,
      projectName: s.groupName,
      totalSeconds: 0,
      sessionCount: 0,
      notes: new Set(),
    };
    tEntry.totalSeconds += slice.durationSeconds;
    tEntry.sessionCount += 1;
    if (s.notes) tEntry.notes.add(s.notes);
    ticketMap.set(ticketKey, tEntry);
  }

  const projects: ProjectBreakdown[] = Array.from(projectMap.entries())
    .map(([projectName, val]) => ({
      projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      taskCount: val.tasks.size,
      ticketCount: val.tickets.size,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  const tickets: TicketBreakdown[] = Array.from(ticketMap.values())
    .map((val) => ({
      ticketId: val.ticketId,
      taskName: val.taskName,
      projectName: val.projectName,
      totalSeconds: val.totalSeconds,
      percentage: totalWorkingSeconds > 0 ? Math.round((val.totalSeconds / totalWorkingSeconds) * 100) : 0,
      sessionCount: val.sessionCount,
      notes: Array.from(val.notes).join('; '),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return {
    monthDate: refDate,
    monthName: format(refDate, 'MMMM yyyy'),
    totalWorkingSeconds,
    totalExpectedWorkingSeconds,
    averageDailyWorkingSeconds,
    daysTargetCompleted,
    daysBelowTarget,
    totalOvertimeSeconds,
    workingDaysCount,
    days,
    projects,
    tickets,
    taskCount: taskSet.size,
    ticketCount: ticketSet.size,
  };
}

/**
 * Proper CSV field escaping for commas, quotes, and newlines.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate Detailed Time Log CSV
 * Columns: Date, Project Name, Ticket ID, Task Name / Description, Start Time, End Time, Duration (Minutes), Duration (Hours), Notes
 */
export function generateDetailedTimeLogCsv(slices: SessionDaySlice[]): string {
  const headers = [
    'Date',
    'Project Name',
    'Ticket ID',
    'Task Name / Description',
    'Start Time',
    'End Time',
    'Duration (Minutes)',
    'Duration (Hours)',
    'Notes',
  ];

  const rows = slices.map((s) => {
    const tid = s.session.ticketId || extractTicketId(s.session.taskName) || '-';
    const cleanName = cleanTaskTitle(s.session.taskName) || s.session.taskName;
    const startTimeStr = format(new Date(s.startTime), 'HH:mm:ss');
    const endTimeStr = format(new Date(s.endTime), 'HH:mm:ss');
    const durationMins = (s.durationSeconds / 60).toFixed(2);
    const durationHours = (s.durationSeconds / 3600).toFixed(2);
    const notesStr = s.session.notes || '';

    return [
      escapeCsvField(s.dateKey),
      escapeCsvField(s.session.groupName),
      escapeCsvField(tid),
      escapeCsvField(cleanName),
      escapeCsvField(startTimeStr),
      escapeCsvField(endTimeStr),
      escapeCsvField(durationMins),
      escapeCsvField(durationHours),
      escapeCsvField(notesStr),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Generate Summary CSV
 * Columns: Date / Reporting Period, Project Name, Total Working Hours, Number of Tickets, Target Hours, Actual Hours, Remaining Hours, Overtime Hours
 */
export function generateSummaryCsv(
  periodLabel: string,
  slices: SessionDaySlice[],
  targetSeconds: number
): string {
  const headers = [
    'Date / Reporting Period',
    'Project Name',
    'Total Working Hours',
    'Number of Tickets',
    'Target Hours',
    'Actual Hours',
    'Remaining Hours',
    'Overtime Hours',
  ];

  const totalWorkingSec = slices.reduce((sum, s) => sum + s.durationSeconds, 0);
  const remainingSec = Math.max(0, targetSeconds - totalWorkingSec);
  const overtimeSec = Math.max(0, totalWorkingSec - targetSeconds);

  // Group by project
  const projectMap = new Map<string, { totalSeconds: number; tickets: Set<string> }>();
  const allTickets = new Set<string>();

  for (const s of slices) {
    const tid = s.session.ticketId || extractTicketId(s.session.taskName) || '-';
    if (tid !== '-') allTickets.add(tid);

    const proj = projectMap.get(s.session.groupName) ?? { totalSeconds: 0, tickets: new Set() };
    proj.totalSeconds += s.durationSeconds;
    if (tid !== '-') proj.tickets.add(tid);
    projectMap.set(s.session.groupName, proj);
  }

  const rows: string[] = [];

  // 1. Overall Summary Row
  rows.push(
    [
      escapeCsvField(periodLabel),
      escapeCsvField('All Projects (Total)'),
      escapeCsvField((totalWorkingSec / 3600).toFixed(2)),
      escapeCsvField(allTickets.size.toString()),
      escapeCsvField((targetSeconds / 3600).toFixed(2)),
      escapeCsvField((totalWorkingSec / 3600).toFixed(2)),
      escapeCsvField((remainingSec / 3600).toFixed(2)),
      escapeCsvField((overtimeSec / 3600).toFixed(2)),
    ].join(',')
  );

  // 2. Project Rows
  for (const [projectName, pData] of Array.from(projectMap.entries()).sort(
    (a, b) => b[1].totalSeconds - a[1].totalSeconds
  )) {
    rows.push(
      [
        escapeCsvField(periodLabel),
        escapeCsvField(projectName),
        escapeCsvField((pData.totalSeconds / 3600).toFixed(2)),
        escapeCsvField(pData.tickets.size.toString()),
        escapeCsvField('-'),
        escapeCsvField((pData.totalSeconds / 3600).toFixed(2)),
        escapeCsvField('-'),
        escapeCsvField('-'),
      ].join(',')
    );
  }

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Downloads a CSV string as a UTF-8 file with BOM
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  // Prepend \uFEFF so Excel, LibreOffice, and Numbers correctly detect UTF-8
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
