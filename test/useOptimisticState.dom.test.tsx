// @vitest-environment jsdom
import { test, describe, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useOptimisticState } from '../src/hooks/useOptimisticState';
import type { PersistGate } from '../src/hooks/useOptimisticState';
import { SyncQueue } from '../src/lib/syncQueue';
import type { PersistResult } from '../src/lib/supabaseDb';

type Item = { id: string };

/** Mount the hook with controllable gate / writer / queue. */
function setup(
  write: (userId: string, value: Item[]) => Promise<PersistResult>,
  gate: PersistGate = { userId: 'u1', ready: true },
) {
  const onError = vi.fn();
  const onWriteAttempt = vi.fn();
  const queue = new SyncQueue();

  const view = renderHook(() => {
    const gateRef = useRef<PersistGate>(gate);
    const errRef = useRef(onError);
    const queueRef = useRef(queue);
    const onWriteRef = useRef<(() => void) | null>(onWriteAttempt);
    return useOptimisticState<Item[]>('items', [], write, {
      gateRef,
      onErrorRef: errRef,
      queueRef,
      onWriteAttemptRef: onWriteRef,
    });
  });

  return { view, onError, queue, onWriteAttempt };
}

const ok = async (): Promise<PersistResult> => ({ error: null });

describe('useOptimisticState', () => {
  beforeEach(() => vi.clearAllMocks());

  test('commit repaints immediately, before the write resolves', async () => {
    let release: (v: PersistResult) => void = () => {};
    const write = vi.fn(
      () => new Promise<PersistResult>((r) => { release = r; }),
    );
    const { view } = setup(write);

    act(() => view.result.current.commit(() => [{ id: 'a' }]));

    // Painted without waiting for the network.
    expect(view.result.current.value).toEqual([{ id: 'a' }]);
    expect(write).toHaveBeenCalledTimes(1);

    await act(async () => { release({ error: null }); });
    expect(view.result.current.value).toEqual([{ id: 'a' }]);
  });

  test('a rejected write rolls back and reports the error', async () => {
    const write = vi.fn(async () => ({ error: 'violates row-level security policy' }));
    const { view, onError } = setup(write);

    await act(async () => { view.result.current.commit(() => [{ id: 'a' }]); });

    await waitFor(() => expect(view.result.current.value).toEqual([]));
    expect(onError).toHaveBeenCalledWith('violates row-level security policy');
  });

  test('a newer edit is NOT clobbered by an older rollback', async () => {
    // The regression this guards: a slow failing write undoing later work.
    let failFirst: (v: PersistResult) => void = () => {};
    let call = 0;
    const write = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return new Promise<PersistResult>((r) => { failFirst = r; });
      }
      return Promise.resolve({ error: null });
    });

    const { view, onError } = setup(write);

    act(() => view.result.current.commit(() => [{ id: 'first' }]));
    act(() => view.result.current.commit(() => [{ id: 'second' }]));

    // The first write now fails, after the second edit already landed.
    await act(async () => { failFirst({ error: 'rejected by server' }); });

    expect(view.result.current.value).toEqual([{ id: 'second' }]);
    expect(onError).toHaveBeenCalled(); // still surfaced, just not rolled back
  });

  test('a transient failure keeps the value and queues the write', async () => {
    const write = vi.fn(async () => ({ error: 'Failed to fetch' }));
    const { view, onError, queue } = setup(write);

    await act(async () => { view.result.current.commit(() => [{ id: 'a' }]); });

    await waitFor(() => expect(queue.size).toBe(1));
    expect(view.result.current.value).toEqual([{ id: 'a' }], );
    expect(onError).not.toHaveBeenCalled();
    queue.stop();
  });

  test('the queued retry sends the latest value, not the failed one', async () => {
    const seen: Item[][] = [];
    const write = vi.fn(async (_u: string, v: Item[]) => {
      seen.push(v);
      return seen.length === 1 ? { error: 'Failed to fetch' } : { error: null };
    });
    const { view, queue } = setup(write);

    await act(async () => { view.result.current.commit(() => [{ id: 'a' }]); });
    await waitFor(() => expect(queue.size).toBe(1));

    // Another edit while still offline.
    await act(async () => { view.result.current.commit(() => [{ id: 'a' }, { id: 'b' }]); });

    await act(async () => { await queue.flush(); });

    expect(seen.at(-1)).toEqual([{ id: 'a' }, { id: 'b' }]);
    queue.stop();
  });

  test('writes are blocked until the gate is ready', async () => {
    const write = vi.fn(ok);
    const { view } = setup(write, { userId: 'u1', ready: false });

    act(() => view.result.current.commit(() => [{ id: 'a' }]));

    expect(view.result.current.value).toEqual([{ id: 'a' }], );
    expect(write).not.toHaveBeenCalled(); // local only, nothing sent
  });

  test('set() never persists — it is for hydration and timer ticks', () => {
    const write = vi.fn(ok);
    const { view } = setup(write);

    act(() => view.result.current.set([{ id: 'server' }]));

    expect(view.result.current.value).toEqual([{ id: 'server' }]);
    expect(write).not.toHaveBeenCalled();
  });

  test('an identical commit is skipped entirely', () => {
    const write = vi.fn(ok);
    const { view } = setup(write);

    act(() => view.result.current.commit((prev) => prev));

    expect(write).not.toHaveBeenCalled();
  });

  test('flush persists current state without a rollback target', async () => {
    const write = vi.fn(ok);
    const { view } = setup(write);

    act(() => view.result.current.set([{ id: 'ticked' }]));
    await act(async () => { view.result.current.flush(); });

    expect(write).toHaveBeenCalledWith('u1', [{ id: 'ticked' }]);
  });

  test('reports a write attempt before it is sent, not after it fails', async () => {
    // The regression this guards: a write still in flight when the network
    // returned looked like "nothing pending", so the provider refetched and
    // overwrote the edit.
    let release: (v: PersistResult) => void = () => {};
    const write = vi.fn(() => new Promise<PersistResult>((r) => { release = r; }));
    const { view, onWriteAttempt } = setup(write);

    act(() => view.result.current.commit(() => [{ id: 'a' }]));

    expect(onWriteAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { release({ error: null }); });
  });

  test('a skipped write reports no attempt', () => {
    const write = vi.fn(ok);
    const { view, onWriteAttempt } = setup(write, { userId: 'u1', ready: false });

    act(() => view.result.current.commit(() => [{ id: 'a' }]));

    expect(onWriteAttempt).not.toHaveBeenCalled();
  });

  test('ref always holds the current value for stale-closure-free reads', () => {
    const write = vi.fn(ok);
    const { view } = setup(write);

    act(() => view.result.current.commit(() => [{ id: 'x' }]));
    expect(view.result.current.ref.current).toEqual([{ id: 'x' }]);
  });
});
