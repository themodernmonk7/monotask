import { test, describe, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

// Minimal localStorage stand-in, with an optional byte cap to force the
// over-quota path.
class FakeStorage {
  private map = new Map<string, string>();
  limit = Infinity;
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) {
    if (v.length > this.limit) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

const storage = new FakeStorage();
(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage;

const { readCache, writeCache, clearCache } = await import('../src/lib/localCache');

const snapshot = (sessionCount: number) => ({
  groups: [{ id: 'g1', name: 'Platform', tasks: [{ id: 't1', name: 'Work', elapsedSeconds: 60 }], expanded: true, pinned: true }],
  completedTasks: [],
  sessions: Array.from({ length: sessionCount }, (_, i) => ({
    id: `s${i}`, taskId: 't1', taskName: 'Work', groupName: 'Platform',
    startTime: i * 1000, endTime: i * 1000 + 600, durationSeconds: 600,
  })),
  noteGroups: [],
  tags: [{ id: 'tag1', label: 'Deep Work', color: 'violet' as const }],
  settings: { dailyTargetMinutes: 420, workingDays: [1, 2, 3, 4, 5] },
  activeState: null,
});

describe('Offline cache', () => {
  beforeEach(() => { storage.clear(); storage.limit = Infinity; });

  test('round-trips a snapshot', () => {
    writeCache('user-a', snapshot(2));
    const got = readCache('user-a');
    assert.ok(got);
    assert.equal(got.data.groups[0].name, 'Platform');
    assert.equal(got.data.groups[0].pinned, true);
    assert.equal(got.data.sessions.length, 2);
    assert.equal(got.data.tags[0].label, 'Deep Work');
    assert.ok(got.savedAt > 0);
  });

  test('is scoped per user so accounts never bleed', () => {
    writeCache('user-a', snapshot(1));
    assert.equal(readCache('user-b'), null);
    assert.ok(readCache('user-a'));
  });

  test('returns null for a missing or corrupt entry', () => {
    assert.equal(readCache('nobody'), null);
    storage.setItem('monotask-cache:user-a', 'not json');
    assert.equal(readCache('user-a'), null);
  });

  test('ignores a snapshot written by an older version', () => {
    storage.setItem(
      'monotask-cache:user-a',
      JSON.stringify({ version: 0, savedAt: Date.now(), data: snapshot(1) }),
    );
    assert.equal(readCache('user-a'), null);
  });

  test('drops sessions rather than losing the cache when over quota', () => {
    const big = snapshot(500);
    const full = JSON.stringify({ version: 2, savedAt: Date.now(), data: big });
    const trimmed = JSON.stringify({ version: 2, savedAt: Date.now(), data: { ...big, sessions: [] } });
    // Room for the trimmed payload but not the full one.
    storage.limit = Math.floor((full.length + trimmed.length) / 2);

    writeCache('user-a', big);
    const got = readCache('user-a');
    assert.ok(got, 'cache should still exist after trimming');
    assert.equal(got.data.sessions.length, 0);
    assert.equal(got.data.groups[0].name, 'Platform', 'groups must survive');
  });

  test('clearCache removes only that user', () => {
    writeCache('user-a', snapshot(1));
    writeCache('user-b', snapshot(1));
    clearCache('user-a');
    assert.equal(readCache('user-a'), null);
    assert.ok(readCache('user-b'));
  });
});
