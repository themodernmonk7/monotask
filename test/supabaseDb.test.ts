// @vitest-environment jsdom
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/supabaseDb';

describe('normalizeSettings — timer reminder fields', () => {
  test('reads a fully-populated row', () => {
    const s = normalizeSettings({
      daily_target_minutes: 480,
      working_days: [1, 2, 3],
      timer_reminder_enabled: true,
      timer_reminder_minutes: 15,
    });
    assert.equal(s.timerReminderEnabled, true);
    assert.equal(s.timerReminderMinutes, 15);
  });

  test('defaults to off/5min for an account created before this migration', () => {
    // Pre-migration rows simply don't have these columns at all.
    const s = normalizeSettings({
      daily_target_minutes: 420,
      working_days: [1, 2, 3, 4, 5],
    });
    assert.equal(s.timerReminderEnabled, DEFAULT_SETTINGS.timerReminderEnabled);
    assert.equal(s.timerReminderMinutes, DEFAULT_SETTINGS.timerReminderMinutes);
  });

  test('a literal false is NOT confused with "missing"', () => {
    const s = normalizeSettings({
      daily_target_minutes: 420,
      working_days: [1],
      timer_reminder_enabled: false,
      timer_reminder_minutes: 10,
    });
    assert.equal(s.timerReminderEnabled, false);
    assert.equal(s.timerReminderMinutes, 10);
  });

  test('rejects a non-positive or malformed interval back to the default', () => {
    for (const bad of [0, -5, 'ten', null]) {
      const s = normalizeSettings({
        daily_target_minutes: 420,
        working_days: [1],
        timer_reminder_minutes: bad as unknown as number,
      });
      assert.equal(s.timerReminderMinutes, DEFAULT_SETTINGS.timerReminderMinutes);
    }
  });
});
