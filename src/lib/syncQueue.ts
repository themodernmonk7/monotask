import type { PersistResult } from './supabaseDb';

/**
 * Holds writes that failed for transient reasons (offline, flaky connection)
 * and replays them when the network comes back.
 *
 * Because every slice persists its *whole* collection, the queue only ever
 * needs the latest value per slice — not a log of operations. Re-enqueueing a
 * slice simply replaces its pending write, so a burst of edits while offline
 * collapses into one request on reconnect.
 */
export type QueuedWrite = () => Promise<PersistResult>;

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Transient failures are worth retrying; a rejected write (RLS, bad data) is not. */
export function isTransientError(message: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network error') ||
    m.includes('fetch failed') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('504')
  );
}

export class SyncQueue {
  private pending = new Map<string, QueuedWrite>();
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private attempt = 0;
  private flushing = false;

  /** Queue (or replace) the pending write for one slice. */
  enqueue(key: string, write: QueuedWrite): void {
    this.pending.set(key, write);
    this.notify();
    this.scheduleRetry();
  }

  get size(): number {
    return this.pending.size;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private scheduleRetry(): void {
    if (this.timer !== null || this.pending.size === 0) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Try every pending write once. Successful ones are dropped. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) return;
    this.flushing = true;

    try {
      for (const [key, write] of Array.from(this.pending.entries())) {
        try {
          const { error } = await write();
          if (!error) {
            this.pending.delete(key);
          } else if (!isTransientError(error)) {
            // Permanently rejected — stop retrying it forever.
            this.pending.delete(key);
          }
        } catch {
          // Still unreachable; leave it queued.
        }
      }
    } finally {
      this.flushing = false;
      this.attempt = this.pending.size > 0 ? this.attempt + 1 : 0;
      this.notify();
      this.scheduleRetry();
    }
  }

  /**
   * Flush right away, cancelling any pending backoff.
   *
   * Deliberately NOT wired to a `window.online` listener here: the provider
   * decides what reconnecting means (push local edits, or refetch when there
   * are none), and a second listener draining the queue underneath it made
   * that decision race.
   */
  async flushNow(): Promise<void> {
    this.attempt = 0;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  clear(): void {
    this.pending.clear();
    this.attempt = 0;
    this.notify();
  }
}
