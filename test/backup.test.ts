import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { buildBackup } from '../src/lib/backup';
import type { AppSettings } from '../src/types';

const emptyData = {
  groups: [],
  completedTasks: [],
  sessions: [],
  noteGroups: [],
  tags: [],
  settings: {
    dailyTargetMinutes: 420,
    workingDays: [1, 2, 3, 4, 5],
    timerReminderEnabled: false,
    timerReminderMinutes: 5,
    theme: 'dark' as const,
  } satisfies AppSettings,
};

describe('buildBackup', () => {
  test('stamps a recognisable format and version', () => {
    const backup = buildBackup(emptyData);
    assert.equal(backup.format, 'monotask-backup');
    assert.equal(backup.version, 1);
  });

  test('exportedAt is a real, parseable timestamp', () => {
    const backup = buildBackup(emptyData);
    assert.ok(!Number.isNaN(new Date(backup.exportedAt).getTime()));
  });

  test('carries the data through untouched', () => {
    const data = {
      ...emptyData,
      groups: [{ id: 'g1', name: 'Core', tasks: [] }],
    };
    const backup = buildBackup(data);
    assert.deepEqual(backup.data.groups, data.groups);
  });

  test('round-trips through JSON without losing anything', () => {
    const data = {
      ...emptyData,
      completedTasks: [
        { id: 'c1', taskName: 'Shipped', groupName: 'Core', totalSeconds: 60, completedAt: 1 },
      ],
    };
    const backup = buildBackup(data);
    const parsed = JSON.parse(JSON.stringify(backup));
    assert.deepEqual(parsed, backup);
  });
});
