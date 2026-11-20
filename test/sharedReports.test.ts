import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildDailySnapshot,
  buildWeeklySnapshot,
  buildMonthlySnapshot,
} from '../src/lib/sharedReports';
import type {
  DailyReportData,
  WeeklyReportData,
  MonthlyReportData,
} from '../src/lib/analytics';
import type { WorkSession } from '../src/types';

const session: WorkSession = {
  id: 's1',
  taskId: 't1',
  taskName: 'Secret notes about the client call',
  groupName: 'Core',
  startTime: 1_000,
  endTime: 2_000,
  durationSeconds: 1,
  notes: 'Do not leak this',
};

describe('buildDailySnapshot', () => {
  const daily: DailyReportData = {
    date: new Date(2026, 10, 13),
    dateKey: '2026-11-13',
    totalWorkingSeconds: 3600,
    targetSeconds: 25200,
    remainingSeconds: 21600,
    overtimeSeconds: 0,
    percentage: 14,
    status: 'below',
    taskCount: 1,
    ticketCount: 0,
    projects: [{ projectName: 'Core', totalSeconds: 3600, percentage: 100, taskCount: 1, ticketCount: 0 }],
    tickets: [],
    rawSlices: [{ dateKey: '2026-11-13', date: new Date(), startTime: 1000, endTime: 2000, durationSeconds: 1, session }],
  };

  test('carries the aggregate numbers through unchanged', () => {
    const snap = buildDailySnapshot(daily);
    assert.equal(snap.kind, 'daily');
    assert.equal(snap.totalWorkingSeconds, 3600);
    assert.equal(snap.percentage, 14);
    assert.deepEqual(snap.projects, daily.projects);
  });

  test('drops rawSlices entirely — no per-session detail leaks into a share', () => {
    const snap = buildDailySnapshot(daily);
    assert.ok(!('rawSlices' in snap));
    assert.ok(!JSON.stringify(snap).includes('Secret notes'));
    assert.ok(!JSON.stringify(snap).includes('Do not leak this'));
  });

  test('round-trips through JSON (as it will via JSONB) with no data loss', () => {
    const snap = buildDailySnapshot(daily);
    const parsed = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(parsed, snap);
  });
});

describe('buildWeeklySnapshot', () => {
  const weekly: WeeklyReportData = {
    startDate: new Date(2026, 10, 9),
    endDate: new Date(2026, 10, 15),
    totalWorkingSeconds: 10000,
    totalExpectedWorkingSeconds: 25200 * 5,
    averageWorkingSecondsPerDay: 2000,
    daysTargetCompleted: 1,
    daysBelowTarget: 4,
    totalOvertimeSeconds: 0,
    days: [
      {
        date: new Date(2026, 10, 9),
        dateKey: '2026-11-09',
        dayName: 'Mon',
        dayNumber: 1,
        isWorkingDay: true,
        loggedSeconds: 2000,
        targetSeconds: 25200,
        remainingSeconds: 23200,
        overtimeSeconds: 0,
        status: 'below',
        completedTarget: false,
      },
    ],
    projects: [],
    tickets: [],
    taskCount: 3,
    ticketCount: 1,
  };

  test('converts start/end Dates to plain date keys', () => {
    const snap = buildWeeklySnapshot(weekly);
    assert.equal(snap.startDateKey, '2026-11-09');
    assert.equal(snap.endDateKey, '2026-11-15');
  });

  test('strips each day down to only the display fields', () => {
    const snap = buildWeeklySnapshot(weekly);
    assert.equal(snap.days.length, 1);
    assert.deepEqual(snap.days[0], {
      dateKey: '2026-11-09',
      dayName: 'Mon',
      isWorkingDay: true,
      loggedSeconds: 2000,
      targetSeconds: 25200,
      status: 'below',
    });
  });

  test('round-trips through JSON', () => {
    const snap = buildWeeklySnapshot(weekly);
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  });
});

describe('buildMonthlySnapshot', () => {
  const monthly: MonthlyReportData = {
    monthDate: new Date(2026, 10, 1),
    monthName: 'November 2026',
    totalWorkingSeconds: 40000,
    totalExpectedWorkingSeconds: 25200 * 20,
    averageDailyWorkingSeconds: 2000,
    daysTargetCompleted: 2,
    daysBelowTarget: 18,
    totalOvertimeSeconds: 0,
    workingDaysCount: 20,
    days: [
      {
        date: new Date(2026, 10, 1),
        dateKey: '2026-11-01',
        dayOfMonth: 1,
        isWorkingDay: true,
        loggedSeconds: 2000,
        targetSeconds: 25200,
        status: 'below',
        completedTarget: false,
      },
    ],
    projects: [],
    tickets: [],
    taskCount: 5,
    ticketCount: 2,
  };

  test('keeps the month label and strips each day to display fields', () => {
    const snap = buildMonthlySnapshot(monthly);
    assert.equal(snap.monthName, 'November 2026');
    assert.deepEqual(snap.days[0], {
      dateKey: '2026-11-01',
      dayOfMonth: 1,
      isWorkingDay: true,
      loggedSeconds: 2000,
      targetSeconds: 25200,
      status: 'below',
    });
  });

  test('round-trips through JSON', () => {
    const snap = buildMonthlySnapshot(monthly);
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  });
});
