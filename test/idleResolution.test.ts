import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { resolveIdleAdjustment } from '../src/lib/idleResolution';

const GAP = 3600; // one hour away

describe('resolveIdleAdjustment', () => {
  describe('after a reload (gap was never credited)', () => {
    const prompt = { taskId: 't1', idleSeconds: GAP, alreadyCounted: false };

    test('keep ADDS the gap', () => {
      const { elapsedDelta } = resolveIdleAdjustment(prompt, 'keep');
      assert.equal(elapsedDelta, GAP);
    });

    test('discard adds nothing — subtracting would steal real work', () => {
      const { elapsedDelta } = resolveIdleAdjustment(prompt, 'discard');
      assert.equal(elapsedDelta, 0);
    });
  });

  describe('after returning to a tab (browser already counted it)', () => {
    const prompt = { taskId: 't1', idleSeconds: GAP, alreadyCounted: true };

    test('keep is a no-op — the time is already there', () => {
      const { elapsedDelta } = resolveIdleAdjustment(prompt, 'keep');
      assert.equal(elapsedDelta, 0);
    });

    test('discard SUBTRACTS the gap', () => {
      const { elapsedDelta } = resolveIdleAdjustment(prompt, 'discard');
      assert.equal(elapsedDelta, -GAP);
    });
  });

  test('discarding always restarts the live segment, keeping never does', () => {
    for (const alreadyCounted of [true, false]) {
      const prompt = { taskId: 't1', idleSeconds: GAP, alreadyCounted };
      assert.equal(
        resolveIdleAdjustment(prompt, 'discard').restartLiveSegment,
        true,
        'discard must reset activeSessionStart or the live slice still spans the gap',
      );
      assert.equal(
        resolveIdleAdjustment(prompt, 'keep').restartLiveSegment,
        false,
      );
    }
  });

  test('keep then discard are inverse in the counted case', () => {
    const prompt = { taskId: 't1', idleSeconds: GAP, alreadyCounted: true };
    const net =
      resolveIdleAdjustment(prompt, 'keep').elapsedDelta +
      resolveIdleAdjustment(prompt, 'discard').elapsedDelta;
    assert.equal(net, -GAP);
  });

  test('a zero gap never moves the total either way', () => {
    for (const alreadyCounted of [true, false]) {
      const prompt = { taskId: 't1', idleSeconds: 0, alreadyCounted };
      assert.equal(resolveIdleAdjustment(prompt, 'keep').elapsedDelta, 0);
      assert.equal(resolveIdleAdjustment(prompt, 'discard').elapsedDelta, 0);
    }
  });
});
