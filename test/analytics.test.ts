import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTicketId,
  cleanTaskTitle,
  formatDurationHuman,
  formatHoursDecimal,
  sliceSessionByDay,
  mergeIntervals,
  calculateDailyTargetProgress,
  getDailyReportData,
  getWeeklyReportData,
  getMonthlyReportData,
  generateDetailedTimeLogCsv,
  generateSummaryCsv,
  escapeCsvField,
} from '../src/lib/analytics.ts';
import type { WorkSession, AppSettings } from '../src/types/index.ts';

const mockSettings: AppSettings = {
  dailyTargetMinutes: 420, // 7 hours
  workingDays: [1, 2, 3, 4, 5], // Monday - Friday
};

describe('Analytics & Time Calculations', () => {
  describe('Ticket ID Extraction', () => {
    test('extracts bracketed ticket IDs', () => {
      assert.equal(extractTicketId('[PROJ-123] Fix login bug'), 'PROJ-123');
      assert.equal(extractTicketId('[CORE-456] Database migration'), 'CORE-456');
      assert.equal(extractTicketId('[#99] Quick fix'), '#99');
    });

    test('extracts plain ticket IDs', () => {
      assert.equal(extractTicketId('MONO-42: Implement time tracking'), 'MONO-42');
      assert.equal(extractTicketId('Fix bug for JIRA-1001 right now'), 'JIRA-1001');
      assert.equal(extractTicketId('Resolve #123 issue'), '#123');
    });

    test('returns null when no ticket ID is present', () => {
      assert.equal(extractTicketId('General deep work session'), null);
      assert.equal(extractTicketId('Code review and coffee break'), null);
      assert.equal(extractTicketId(''), null);
    });

    test('cleans task title', () => {
      assert.equal(cleanTaskTitle('[PROJ-123] Fix bug'), 'Fix bug');
      assert.equal(cleanTaskTitle('Normal task name'), 'Normal task name');
    });
  });

  describe('Duration Formatting', () => {
    test('formats seconds, minutes, and hours', () => {
      assert.equal(formatDurationHuman(45), '45s');
      assert.equal(formatDurationHuman(180), '3m');
      assert.equal(formatDurationHuman(195), '3m 15s');
      assert.equal(formatDurationHuman(3600), '1h');
      assert.equal(formatDurationHuman(5400), '1h 30m');
      assert.equal(formatDurationHuman(25200), '7h');
      assert.equal(formatDurationHuman(27000), '7h 30m');
    });

    test('formats decimal hours', () => {
      assert.equal(formatHoursDecimal(3600), '1.00');
      assert.equal(formatHoursDecimal(5400), '1.50');
      assert.equal(formatHoursDecimal(25200), '7.00');
      assert.equal(formatHoursDecimal(27000), '7.50');
    });
  });

  describe('Daily Target Progress Calculation', () => {
    test('below target status and remaining hours', () => {
      // 5h logged against 7h target (420 mins = 25200s)
      const logged = 18000; // 5 hours
      const progress = calculateDailyTargetProgress(logged, 420);

      assert.equal(progress.targetMinutes, 420);
      assert.equal(progress.targetSeconds, 25200);
      assert.equal(progress.loggedSeconds, 18000);
      assert.equal(progress.remainingSeconds, 7200); // 2 hours
      assert.equal(progress.overtimeSeconds, 0);
      assert.equal(progress.percentage, 71); // Math.round(18000 / 25200 * 100) = 71
      assert.equal(progress.status, 'below');
    });

    test('target completed status exactly', () => {
      const logged = 25200; // 7 hours
      const progress = calculateDailyTargetProgress(logged, 420);

      assert.equal(progress.loggedSeconds, 25200);
      assert.equal(progress.remainingSeconds, 0);
      assert.equal(progress.overtimeSeconds, 0);
      assert.equal(progress.percentage, 100);
      assert.equal(progress.status, 'completed');
    });

    test('overtime status when exceeding target', () => {
      const logged = 28800; // 8 hours
      const progress = calculateDailyTargetProgress(logged, 420);

      assert.equal(progress.loggedSeconds, 28800);
      assert.equal(progress.remainingSeconds, 0);
      assert.equal(progress.overtimeSeconds, 3600); // 1 hour overtime
      assert.equal(progress.percentage, 114);
      assert.equal(progress.status, 'overtime');
    });
  });

  describe('Midnight Crossing Handling', () => {
    test('session within same day returns single slice', () => {
      // 2026-11-13 10:00:00 to 12:00:00 (2 hours = 7200s)
      const start = new Date(2026, 10, 13, 10, 0, 0).getTime();
      const end = new Date(2026, 10, 13, 12, 0, 0).getTime();

      const session: WorkSession = {
        id: 's1',
        taskId: 't1',
        taskName: 'Morning work',
        groupName: 'Frontend',
        startTime: start,
        endTime: end,
        durationSeconds: 7200,
      };

      const slices = sliceSessionByDay(session);
      assert.equal(slices.length, 1);
      assert.equal(slices[0].dateKey, '2026-11-13');
      assert.equal(slices[0].durationSeconds, 7200);
    });

    test('session crossing midnight splits correctly between days', () => {
      // Starts 2026-11-13 23:00 (11:00 PM), ends 2026-11-14 02:00 (2:00 AM)
      // Total duration = 3 hours = 10800s
      // Day 1: 1 hour (3600s), Day 2: 2 hours (7200s)
      const start = new Date(2026, 10, 13, 23, 0, 0).getTime();
      const end = new Date(2026, 10, 14, 2, 0, 0).getTime();

      const session: WorkSession = {
        id: 's2',
        taskId: 't2',
        taskName: 'Night sprint',
        groupName: 'Backend',
        startTime: start,
        endTime: end,
        durationSeconds: 10800,
      };

      const slices = sliceSessionByDay(session);
      assert.equal(slices.length, 2);

      assert.equal(slices[0].dateKey, '2026-11-13');
      assert.equal(slices[0].durationSeconds, 3600); // 1 hour

      assert.equal(slices[1].dateKey, '2026-11-14');
      assert.equal(slices[1].durationSeconds, 7200); // 2 hours

      // Total must equal exactly 10800s (no seconds lost or created)
      assert.equal(slices[0].durationSeconds + slices[1].durationSeconds, 10800);
    });
  });

  describe('Interval Merging (No Double Counting)', () => {
    test('merges overlapping intervals', () => {
      const intervals = [
        { start: 1000, end: 3000 },
        { start: 2000, end: 4000 },
        { start: 5000, end: 6000 },
      ];
      const merged = mergeIntervals(intervals);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].start, 1000);
      assert.equal(merged[0].end, 4000);
      assert.equal(merged[1].start, 5000);
      assert.equal(merged[1].end, 6000);
    });
  });

  describe('Reports Aggregation', () => {
    const testDate = new Date(2026, 10, 13); // Friday Nov 13, 2026
    const s1Start = new Date(2026, 10, 13, 9, 0, 0).getTime();
    const s1End = new Date(2026, 10, 13, 12, 0, 0).getTime();
    const s2Start = new Date(2026, 10, 13, 13, 0, 0).getTime();
    const s2End = new Date(2026, 10, 13, 16, 0, 0).getTime();

    const sampleSessions: WorkSession[] = [
      {
        id: 'sess-1',
        taskId: 't1',
        taskName: '[PROJ-101] Frontend setup',
        groupName: 'Frontend App',
        ticketId: 'PROJ-101',
        startTime: s1Start,
        endTime: s1End,
        durationSeconds: 10800, // 3h
      },
      {
        id: 'sess-2',
        taskId: 't2',
        taskName: '[API-202] GraphQL resolver',
        groupName: 'Backend Core',
        ticketId: 'API-202',
        startTime: s2Start,
        endTime: s2End,
        durationSeconds: 10800, // 3h
      },
    ];

    test('Daily Report calculates accurate metrics and breakdowns', () => {
      const report = getDailyReportData(sampleSessions, testDate, mockSettings);

      assert.equal(report.totalWorkingSeconds, 21600); // 6 hours
      assert.equal(report.targetSeconds, 25200); // 7 hours
      assert.equal(report.remainingSeconds, 3600); // 1 hour remaining
      assert.equal(report.overtimeSeconds, 0);
      assert.equal(report.status, 'below');
      assert.equal(report.taskCount, 2);
      assert.equal(report.ticketCount, 2);
      assert.equal(report.projects.length, 2);
      assert.equal(report.projects[0].totalSeconds, 10800);
      assert.equal(report.projects[0].percentage, 50);
      assert.equal(report.tickets.length, 2);
    });

    test('Weekly Report calculates expected hours and averages', () => {
      const report = getWeeklyReportData(sampleSessions, testDate, mockSettings);

      assert.equal(report.totalWorkingSeconds, 21600); // 6 hours
      // 5 working days (Mon-Fri) * 7 hours = 35 hours = 126000s
      assert.equal(report.totalExpectedWorkingSeconds, 126000);
      assert.equal(report.days.length, 7);
      assert.equal(report.daysTargetCompleted, 0); // 6h < 7h
      assert.equal(report.daysBelowTarget, 5); // 5 working days
    });

    test('Monthly Report calculates working days and totals', () => {
      const report = getMonthlyReportData(sampleSessions, testDate, mockSettings);

      assert.equal(report.totalWorkingSeconds, 21600);
      assert(report.workingDaysCount > 15); // November has ~21 working days
      assert(report.totalExpectedWorkingSeconds > 0);
    });
  });

  describe('CSV Export Generation & Escaping', () => {
    test('escapeCsvField properly escapes quotes, commas, and newlines', () => {
      assert.equal(escapeCsvField('normal text'), 'normal text');
      assert.equal(escapeCsvField('text with, comma'), '"text with, comma"');
      assert.equal(escapeCsvField('text with "quotes"'), '"text with ""quotes"""');
      assert.equal(escapeCsvField('line 1\nline 2'), '"line 1\nline 2"');
    });

    test('generateDetailedTimeLogCsv outputs required columns', () => {
      const start = new Date(2026, 10, 13, 9, 30, 0).getTime();
      const end = new Date(2026, 10, 13, 11, 0, 0).getTime();
      const session: WorkSession = {
        id: 's1',
        taskId: 't1',
        taskName: '[PROJ-50] Task, with comma & "quotes"',
        groupName: 'Platform, Team',
        ticketId: 'PROJ-50',
        startTime: start,
        endTime: end,
        durationSeconds: 5400, // 90 min = 1.5h
        notes: 'Refactored auth module',
      };

      const slices = sliceSessionByDay(session);
      const csv = generateDetailedTimeLogCsv(slices);

      // Verify header row
      const lines = csv.split('\r\n');
      assert.equal(
        lines[0],
        'Date,Project Name,Ticket ID,Task Name / Description,Start Time,End Time,Duration (Minutes),Duration (Hours),Notes'
      );

      // Verify data row
      assert(lines[1].includes('"Platform, Team"'));
      assert(lines[1].includes('PROJ-50'));
      assert(lines[1].includes('90.00'));
      assert(lines[1].includes('1.50'));
      assert(lines[1].includes('Refactored auth module'));
    });

    test('generateSummaryCsv outputs required columns and aggregates', () => {
      const start = new Date(2026, 10, 13, 9, 0, 0).getTime();
      const end = new Date(2026, 10, 13, 16, 0, 0).getTime();
      const session: WorkSession = {
        id: 's1',
        taskId: 't1',
        taskName: '[PROJ-1] Work',
        groupName: 'Core',
        startTime: start,
        endTime: end,
        durationSeconds: 25200, // 7h
      };

      const slices = sliceSessionByDay(session);
      const csv = generateSummaryCsv('2026-11-13', slices, 25200);

      const lines = csv.split('\r\n');
      assert.equal(
        lines[0],
        'Date / Reporting Period,Project Name,Total Working Hours,Number of Tickets,Target Hours,Actual Hours,Remaining Hours,Overtime Hours'
      );

      // Summary row
      assert(lines[1].includes('2026-11-13'));
      assert(lines[1].includes('All Projects (Total)'));
      assert(lines[1].includes('7.00'));
    });

    test('generateSummaryCsv handles multiple projects and overtime correctly', () => {
      const start = new Date(2026, 10, 13, 8, 0, 0).getTime();
      const end = new Date(2026, 10, 13, 17, 0, 0).getTime();

      const session1: WorkSession = {
        id: 's1',
        taskId: 't1',
        taskName: '[PROJ-1] Work on Core',
        groupName: 'Core Platform',
        startTime: start,
        endTime: start + 18000 * 1000, // 5 hours
        durationSeconds: 18000,
      };
      const session2: WorkSession = {
        id: 's2',
        taskId: 't2',
        taskName: '[UI-2] Work on UI',
        groupName: 'Design System',
        startTime: start + 18000 * 1000,
        endTime: end, // 4 hours
        durationSeconds: 14400,
      };

      const slices = [
        ...sliceSessionByDay(session1),
        ...sliceSessionByDay(session2),
      ];

      // Total 9h against 7h target (25200s): overtime 2h (7200s)
      const csv = generateSummaryCsv('2026-11-13', slices, 25200);
      const lines = csv.split('\r\n');

      // Check summary row
      assert(lines[1].includes('9.00')); // Total working hours
      assert(lines[1].includes('7.00')); // Target hours
      assert(lines[1].includes('2.00')); // Overtime hours

      // Check project rows
      assert(lines.some((l) => l.includes('Core Platform') && l.includes('5.00')));
      assert(lines.some((l) => l.includes('Design System') && l.includes('4.00')));
    });

    test('handles empty sessions gracefully', () => {
      const detailedCsv = generateDetailedTimeLogCsv([]);
      assert.equal(
        detailedCsv,
        'Date,Project Name,Ticket ID,Task Name / Description,Start Time,End Time,Duration (Minutes),Duration (Hours),Notes'
      );

      const summaryCsv = generateSummaryCsv('2026-11-13', [], 25200);
      const lines = summaryCsv.split('\r\n');
      assert.equal(lines.length, 2);
      assert(lines[1].includes('0.00')); // 0 hours
      assert(lines[1].includes('7.00')); // 7h remaining
    });

    test('custom working days and custom target calculation', () => {
      const customSettings: AppSettings = {
        dailyTargetMinutes: 480, // 8 hours
        workingDays: [1, 2, 3, 4, 5, 6], // Mon - Sat (6 days)
      };

      const testDate = new Date(2026, 10, 13);
      const weekly = getWeeklyReportData([], testDate, customSettings);
      // 6 days * 8h = 48 hours = 172800s
      assert.equal(weekly.totalExpectedWorkingSeconds, 172800);
    });
  });
});
