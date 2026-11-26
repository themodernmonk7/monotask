import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PersistResult } from '@/lib/supabaseDb';
import type { SyncQueue } from '@/lib/syncQueue';
import { isTransientError } from '@/lib/syncQueue';

/** Writes are skipped until the initial load finishes and the schema is known good. */
export interface PersistGate {
  userId: string | null;
  ready: boolean;
}

/**
 * Persist `next`. `prev` is the last value the server is known to hold for
 * this slice (or null when that is unknown, e.g. after starting from the
 * offline cache), so a writer can send only what changed.
 */
export type Writer<T> = (
  userId: string,
  next: T,
  prev: T | null,
) => Promise<PersistResult>;

export interface OptimisticOptions {
  gateRef: RefObject<PersistGate>;
  onErrorRef: RefObject<(message: string) => void>;
  queueRef: RefObject<SyncQueue>;
  /**
   * Called synchronously whenever a write is *attempted*, before it is sent.
   *
   * The provider uses this to know local state has diverged from the server.
   * Tracking only failed writes is not enough: a write still in flight when
   * the network returns would leave the provider thinking nothing is pending,
   * and the refetch it then performs overwrites the edit.
   */
  onWriteAttemptRef?: RefObject<(() => void) | null>;
  /**
   * Shared count of writes currently in flight across every slice. A refetch
   * must wait for it to reach zero, or the server's not-yet-updated rows would
   * overwrite an edit that is still on its way.
   */
  inflightRef?: RefObject<number>;
}

export interface OptimisticState<T> {
  value: T;
  /** Always current, unlike `value` inside a stale closure. */
  ref: RefObject<T>;
  /** Apply locally without persisting (derived or purely local state). */
  set: (next: T | ((prev: T) => T)) => void;
  /**
   * Replace local state with what the server (trusted) or the offline cache
   * (untrusted) holds, and make it the baseline later writes diff against.
   */
  hydrate: (value: T, trusted: boolean) => void;
  /** Apply locally, persist, and roll back if the write is rejected. */
  commit: (updater: (prev: T) => T) => Promise<void>;
  /** Persist whatever is in state right now (no rollback target). */
  flush: () => Promise<void>;
}

/**
 * One slice of app state whose source of truth is Supabase.
 *
 * `commit` repaints immediately and reconciles in the background:
 *  - rejected write (RLS, bad data) -> roll back and surface the error, unless
 *    a newer edit has landed (tracked by `revRef`), so a rollback can never
 *    clobber work done after the failed edit.
 *  - transient failure (offline, flaky link) -> keep the optimistic value and
 *    hand the write to the retry queue.
 *
 * Writes for one slice run strictly one after another and each sends only the
 * difference from the last value the server confirmed. Run concurrently, an
 * older request could land after a newer one and undo it on the server.
 */
export function useOptimisticState<T>(
  key: string,
  initial: T,
  write: Writer<T>,
  { gateRef, onErrorRef, queueRef, onWriteAttemptRef, inflightRef }: OptimisticOptions,
): OptimisticState<T> {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const revRef = useRef(0);
  /** What the server is known to hold; null = unknown, so never delete. */
  const syncedRef = useRef<T | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const apply = useCallback((next: T) => {
    ref.current = next;
    revRef.current += 1;
    setValue(next);
    return revRef.current;
  }, []);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(ref.current) : next;
      apply(resolved);
    },
    [apply],
  );

  const hydrate = useCallback(
    (next: T, trusted: boolean) => {
      apply(next);
      syncedRef.current = trusted ? next : null;
    },
    [apply],
  );

  /** Send the newest value, after any write already in flight for this slice. */
  const runWrite = useCallback((): Promise<PersistResult> => {
    if (inflightRef) inflightRef.current += 1;
    const run = chainRef.current.then(async (): Promise<PersistResult> => {
      const gate = gateRef.current;
      if (!gate?.userId || !gate.ready) return { error: null };
      const snapshot = ref.current;
      if (snapshot === syncedRef.current) return { error: null };
      const result = await write(gate.userId, snapshot, syncedRef.current);
      if (!result.error) syncedRef.current = snapshot;
      return result;
    });
    const settled = run.catch((err: unknown) => ({
      error: err instanceof Error ? err.message : String(err),
    }));
    chainRef.current = settled;
    return settled.finally(() => {
      if (inflightRef) inflightRef.current -= 1;
    });
  }, [gateRef, inflightRef, write]);

  /** Retries always send the newest value, never the one that failed. */
  const queueLatest = useCallback(() => {
    queueRef.current?.enqueue(key, runWrite);
  }, [key, queueRef, runWrite]);

  const commit = useCallback(
    (updater: (prev: T) => T): Promise<void> => {
      const prev = ref.current;
      const next = updater(prev);
      if (next === prev) return Promise.resolve();

      const rev = apply(next);

      const gate = gateRef.current;
      if (!gate?.userId || !gate.ready) return Promise.resolve();

      onWriteAttemptRef?.current?.();

      return runWrite().then(({ error }) => {
        if (!error) return;

        if (isTransientError(error)) {
          queueLatest();
          return; // keep the optimistic value; it will sync on reconnect
        }

        onErrorRef.current?.(error);
        if (revRef.current !== rev) return; // superseded — leave newer edits alone
        ref.current = prev;
        setValue(prev);
      });
    },
    [apply, gateRef, onErrorRef, onWriteAttemptRef, queueLatest, runWrite],
  );

  const flush = useCallback((): Promise<void> => {
    const gate = gateRef.current;
    if (!gate?.userId || !gate.ready) return Promise.resolve();

    onWriteAttemptRef?.current?.();

    return runWrite().then(({ error }) => {
      if (!error) return;
      if (isTransientError(error)) {
        queueLatest();
        return;
      }
      onErrorRef.current?.(error);
    });
  }, [gateRef, onErrorRef, onWriteAttemptRef, queueLatest, runWrite]);

  return { value, ref, set, hydrate, commit, flush };
}
