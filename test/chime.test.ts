import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { chimeCountSince } from '../src/lib/chime';

const MIN = 60_000;

describe('chimeCountSince', () => {
  test('no chimes before the first interval has elapsed', () => {
    assert.equal(chimeCountSince(0, 5), 0);
    assert.equal(chimeCountSince(4 * MIN, 5), 0);
    assert.equal(chimeCountSince(4.9 * MIN, 5), 0);
  });

  test('ticks up by one at each interval boundary', () => {
    assert.equal(chimeCountSince(5 * MIN, 5), 1);
    assert.equal(chimeCountSince(9.9 * MIN, 5), 1);
    assert.equal(chimeCountSince(10 * MIN, 5), 2);
    assert.equal(chimeCountSince(24 * MIN, 5), 4);
    assert.equal(chimeCountSince(25 * MIN, 5), 5);
  });

  test('catches up correctly after a late check (throttled background tab)', () => {
    // A check that was supposed to run at 10 min but only actually ran at 23
    // min must report 4 — not 1, and not silently cap at some earlier value.
    assert.equal(chimeCountSince(23 * MIN, 5), 4);
  });

  test('respects a different interval', () => {
    assert.equal(chimeCountSince(9 * MIN, 10), 0);
    assert.equal(chimeCountSince(10 * MIN, 10), 1);
    assert.equal(chimeCountSince(95 * MIN, 30), 3);
  });

  test('never goes negative and treats a non-positive interval as "never"', () => {
    assert.equal(chimeCountSince(-1000, 5), 0);
    assert.equal(chimeCountSince(10 * MIN, 0), 0);
    assert.equal(chimeCountSince(10 * MIN, -5), 0);
  });
});
