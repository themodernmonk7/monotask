import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  IDLE_THRESHOLD_MS,
  localTime,
  parseClock,
  planIdle,
  planPending,
  settingsFromRow,
} from '../supabase/functions/_shared/reminders';
import type { ReminderSettings } from '../supabase/functions/_shared/reminders';

const IST = 'Asia/Kolkata';
/** Thu 26 Nov 2026 at hh:mm in IST, as epoch ms. */
const istAt = (hh: number, mm = 0, day = 26) =>
  Date.UTC(2026, 10, day, hh, mm) - (5 * 60 + 30) * 60_000;

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  timezone: IST,
  workingDays: [1, 2, 3, 4, 5],
  idlePushEnabled: true,
  pendingReminderEnabled: true,
  pendingReminderStart: '18:00',
  pendingReminderIntervalMinutes: 30,
  pendingReminderCount: 3,
  ...over,
});

const tasks = [
  { id: 'a', name: 'Customer screen' },
  { id: 'b', name: 'AI Integration' },
];

describe('localTime', () => {
  test('reads the clock in the user\'s zone, not the server\'s', () => {
    const t = localTime(istAt(18, 5), IST);
    assert.equal(t.dateKey, '2026-11-26');
    assert.equal(t.weekday, 4); // Thursday
    assert.equal(t.minutes, 18 * 60 + 5);
  });

  test('an unknown zone falls back to UTC instead of throwing', () => {
    assert.doesNotThrow(() => localTime(Date.now(), 'Not/AZone'));
  });

  test('parseClock', () => {
    assert.equal(parseClock('09:30'), 570);
    assert.equal(parseClock('24:00'), null);
    assert.equal(parseClock('nope'), null);
  });
});

describe('planPending — one summary at the chosen times', () => {
  test('nothing before the start time', () => {
    assert.equal(planPending(settings(), tasks, istAt(17, 59)), null);
  });

  test('first reminder at the start time, then one per interval', () => {
    const first = planPending(settings(), tasks, istAt(18, 0));
    const stillFirst = planPending(settings(), tasks, istAt(18, 29));
    const second = planPending(settings(), tasks, istAt(18, 30));
    assert.equal(first?.ref, '2026-11-26#0');
    assert.equal(stillFirst?.ref, first?.ref, 'same slot = same ref, so it is sent once');
    assert.equal(second?.ref, '2026-11-26#1');
  });

  test('stops after the chosen count', () => {
    assert.ok(planPending(settings(), tasks, istAt(19, 29))); // slot 2 = 3rd
    assert.equal(planPending(settings(), tasks, istAt(19, 30)), null); // would be 4th
  });

  test('no reminder when nothing is open', () => {
    assert.equal(planPending(settings(), [], istAt(18, 0)), null);
  });

  test('no reminder on non-working days', () => {
    // Sat 28 Nov 2026
    assert.equal(planPending(settings(), tasks, istAt(18, 0, 28)), null);
  });

  test('one summary listing up to three tasks', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ id: n, name: n }));
    const n = planPending(settings(), many, istAt(18, 0));
    assert.equal(n?.title, '5 open tasks');
    assert.match(n?.body ?? '', /“A”, “B”, “C” and 2 more/);
  });

  test('off means off', () => {
    assert.equal(planPending(settings({ pendingReminderEnabled: false }), tasks, istAt(18, 0)), null);
  });
});

describe('planIdle — "were you working while away?"', () => {
  const active = (lastActiveAgoMs: number, now: number) => ({
    runningTaskId: 't1',
    activeSessionStart: now - 3 * 3600_000,
    lastActiveTimestamp: now - lastActiveAgoMs,
  });
  const now = istAt(15, 0);

  test('nothing while a device is still checking in', () => {
    assert.equal(planIdle(settings(), active(IDLE_THRESHOLD_MS - 60_000, now), 'Task', now), null);
  });

  test('asks once the timer has gone unattended past the threshold', () => {
    const n = planIdle(settings(), active(45 * 60_000, now), 'Customer screen', now);
    assert.equal(n?.kind, 'idle');
    assert.match(n?.body ?? '', /“Customer screen” is still running/);
    assert.match(n?.body ?? '', /2:15\s?PM/); // last check-in, in IST
  });

  test('the same away-period keeps the same ref, so it is sent once', () => {
    const a = active(45 * 60_000, now);
    const later = now + 20 * 60_000;
    assert.equal(
      planIdle(settings(), a, 'T', now)?.ref,
      planIdle(settings(), a, 'T', later)?.ref,
    );
  });

  test('no timer, or turned off, means nothing', () => {
    assert.equal(planIdle(settings(), null, null, now), null);
    assert.equal(
      planIdle(settings({ idlePushEnabled: false }), active(45 * 60_000, now), 'T', now),
      null,
    );
  });
});

describe('settingsFromRow', () => {
  test('a row from before these columns existed gets safe defaults', () => {
    const s = settingsFromRow({ working_days: [1, 2] });
    assert.equal(s.timezone, 'UTC');
    assert.equal(s.idlePushEnabled, true);
    assert.equal(s.pendingReminderEnabled, false);
    assert.equal(s.pendingReminderStart, '18:00');
  });
});
