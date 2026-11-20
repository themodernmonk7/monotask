import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { formatMinSec } from '../src/lib/time';

describe('formatMinSec', () => {
  test('pads seconds but not minutes', () => {
    assert.equal(formatMinSec(0), '0:00');
    assert.equal(formatMinSec(5), '0:05');
    assert.equal(formatMinSec(65), '1:05');
    assert.equal(formatMinSec(632), '10:32');
  });

  test('grows the minute count past an hour rather than rolling over', () => {
    assert.equal(formatMinSec(3600), '60:00');
    assert.equal(formatMinSec(3661), '61:01');
  });

  test('floors fractional seconds and clamps negatives to zero', () => {
    assert.equal(formatMinSec(95.9), '1:35');
    assert.equal(formatMinSec(-10), '0:00');
  });
});
