import type { UserDbData } from './supabaseDb';

/**
 * A read-through cache of the last known-good server snapshot.
 *
 * This is deliberately NOT the dual-write localStorage layer this app used to
 * have. The rules that keep it from becoming one again:
 *
 *   1. It is only ever written FROM state the server has accepted (or from
 *      optimistic state that is queued to be sent).
 *   2. It is only ever read when the server could not be reached.
 *   3. It never merges with server data — a successful fetch replaces it
 *      wholesale. Supabase remains the single source of truth.
 *
 * It exists so a cold start without a network shows your work instead of an
 * infinite spinner.
 */

const PREFIX = 'monotask-cache:';
const VERSION = 2;

interface CacheEnvelope {
  version: number;
  savedAt: number;
  data: UserDbData;
}

export interface CachedSnapshot {
  data: UserDbData;
  savedAt: number;
}

function keyFor(userId: string): string {
  // Scoped per user so signing into another account never shows stale data.
  return `${PREFIX}${userId}`;
}

export function readCache(userId: string): CachedSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (parsed.version !== VERSION || !parsed.data) return null;

    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeCache(userId: string, data: UserDbData): void {
  const envelope: CacheEnvelope = { version: VERSION, savedAt: Date.now(), data };

  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(envelope));
  } catch {
    // Over quota: sessions are by far the largest and the least necessary for
    // the app to be usable offline, so retry without them before giving up.
    try {
      const trimmed: CacheEnvelope = {
        ...envelope,
        data: { ...data, sessions: [] },
      };
      localStorage.setItem(keyFor(userId), JSON.stringify(trimmed));
    } catch {
      // Storage unavailable (private mode, disabled). Offline start just
      // won't work; everything else carries on.
    }
  }
}

export function clearCache(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // Nothing to do.
  }
}
