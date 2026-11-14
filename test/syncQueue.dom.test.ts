// @vitest-environment jsdom
import { test, describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncQueue, isTransientError } from '../src/lib/syncQueue';

describe('isTransientError', () => {
  test('classifies network-ish failures as retryable', () => {
    for (const msg of [
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'fetch failed',
      'Load failed',
      'the request timed out',
      'upstream returned 503',
    ]) {
      expect(isTransientError(msg), msg).toBe(true);
    }
  });

  test('treats a server rejection as permanent', () => {
    for (const msg of [
      'new row violates row-level security policy',
      'duplicate key value violates unique constraint',
      'invalid input syntax for type integer',
    ]) {
      expect(isTransientError(msg), msg).toBe(false);
    }
  });

  test('anything counts as transient while the browser reports offline', () => {
    const original = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      'onLine',
    );
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });

    expect(isTransientError('violates row-level security policy')).toBe(true);

    delete (navigator as unknown as Record<string, unknown>).onLine;
    if (original) Object.defineProperty(Navigator.prototype, 'onLine', original);
  });
});

describe('SyncQueue', () => {
  let queue: SyncQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new SyncQueue();
  });

  afterEach(() => {
    queue.stop();
    vi.useRealTimers();
  });

  test('replaces rather than appends per key, so bursts collapse', () => {
    queue.enqueue('groups', async () => ({ error: null }));
    queue.enqueue('groups', async () => ({ error: null }));
    queue.enqueue('tags', async () => ({ error: null }));
    expect(queue.size).toBe(2);
  });

  test('a successful flush empties the queue', async () => {
    const write = vi.fn(async () => ({ error: null }));
    queue.enqueue('groups', write);

    await queue.flush();

    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  test('keeps retrying a transient failure', async () => {
    const write = vi.fn(async () => ({ error: 'Failed to fetch' }));
    queue.enqueue('groups', write);

    await queue.flush();

    expect(queue.size).toBe(1);
  });

  test('drops a permanently rejected write instead of retrying forever', async () => {
    const write = vi.fn(async () => ({
      error: 'new row violates row-level security policy',
    }));
    queue.enqueue('groups', write);

    await queue.flush();

    expect(queue.size).toBe(0);
  });

  test('a throwing write stays queued', async () => {
    const write = vi.fn(async () => {
      throw new Error('socket closed');
    });
    queue.enqueue('groups', write);

    await queue.flush();

    expect(queue.size).toBe(1);
  });

  test('flushNow drains immediately, cancelling any backoff', async () => {
    const write = vi.fn(async () => ({ error: null }));
    queue.enqueue('groups', write);

    await queue.flushNow();

    expect(queue.size).toBe(0);
    expect(write).toHaveBeenCalled();
  });

  test('does NOT listen for `online` itself', async () => {
    // The provider owns reconnect policy. A second listener here drained the
    // queue underneath it, making it refetch and clobber offline edits.
    const write = vi.fn(async () => ({ error: null }));
    queue.enqueue('groups', write);

    window.dispatchEvent(new Event('online'));
    await Promise.resolve();

    expect(write).not.toHaveBeenCalled();
    expect(queue.size).toBe(1);
  });

  test('notifies subscribers as the queue changes', async () => {
    const listener = vi.fn();
    queue.subscribe(listener);

    queue.enqueue('groups', async () => ({ error: null }));
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    await queue.flush();
    expect(listener).toHaveBeenCalled();
  });

  test('unsubscribing stops further notifications', () => {
    const listener = vi.fn();
    const off = queue.subscribe(listener);
    off();
    queue.enqueue('groups', async () => ({ error: null }));
    expect(listener).not.toHaveBeenCalled();
  });

  test('retries the LATEST value, not the one that failed', async () => {
    // The real writer closes over a ref, so a replacement write must win.
    const sent: string[] = [];
    queue.enqueue('groups', async () => {
      sent.push('stale');
      return { error: 'Failed to fetch' };
    });
    await queue.flush();

    queue.enqueue('groups', async () => {
      sent.push('fresh');
      return { error: null };
    });
    await queue.flush();

    expect(sent).toEqual(['stale', 'fresh']);
    expect(queue.size).toBe(0);
  });
});
