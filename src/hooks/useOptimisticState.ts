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

export type Writer<T> = (userId: string, value: T) => Promise<PersistResult>;

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
}

export interface OptimisticState<T> {
  value: T;
  /** Always current, unlike `value` inside a stale closure. */
  ref: RefObject<T>;
  /** Apply locally without persisting — for server hydration and timer ticks. */
  set: (next: T | ((prev: T) => T)) => void;
  /** Apply locally, persist, and roll back if the write is rejected. */
  commit: (updater: (prev: T) => T) => void;
  /** Persist whatever is in state right now (no rollback target). */
  flush: () => void;
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
 */
export function useOptimisticState<T>(
  key: string,
  initial: T,
  write: Writer<T>,
  { gateRef, onErrorRef, queueRef, onWriteAttemptRef }: OptimisticOptions,
): OptimisticState<T> {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const revRef = useRef(0);

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

  /** Retries always send the newest value, never the one that failed. */
  const queueLatest = useCallback(() => {
    const queue = queueRef.current;
    if (!queue) return;
    queue.enqueue(key, () => {
      const gate = gateRef.current;
      if (!gate?.userId || !gate.ready) {
        return Promise.resolve({ error: null });
      }
      return write(gate.userId, ref.current);
    });
  }, [gateRef, key, queueRef, write]);

  const commit = useCallback(
    (updater: (prev: T) => T) => {
      const prev = ref.current;
      const next = updater(prev);
      if (next === prev) return;

      const rev = apply(next);

      const gate = gateRef.current;
      if (!gate?.userId || !gate.ready) return;

      onWriteAttemptRef?.current?.();

      write(gate.userId, next).then(({ error }) => {
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
    [apply, gateRef, onErrorRef, onWriteAttemptRef, queueLatest, write],
  );

  const flush = useCallback(() => {
    const gate = gateRef.current;
    if (!gate?.userId || !gate.ready) return;

    onWriteAttemptRef?.current?.();

    write(gate.userId, ref.current).then(({ error }) => {
      if (!error) return;
      if (isTransientError(error)) {
        queueLatest();
        return;
      }
      onErrorRef.current?.(error);
    });
  }, [gateRef, onErrorRef, onWriteAttemptRef, queueLatest, write]);

  return { value, ref, set, commit, flush };
}
