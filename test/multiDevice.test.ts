// @vitest-environment jsdom
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { diffRows, mergeChildren, stableStringify, toRows } from '../src/lib/supabaseDb';
import {
  completedTaskIds,
  completionIdFor,
  migrateTaskBase,
  sessionIdFor,
  stripCompletedTasks,
  withDerivedElapsed,
} from '../src/lib/timeModel';
import type { CompletedTask, Group, WorkSession } from '../src/types';

/**
 * The scenarios behind "a task I completed on my laptop is still running on
 * my other machine and keeps coming back". Each test is one device doing
 * something with a copy of the data that another device has since changed.
 */

const NOW = new Date(2026, 10, 26, 18, 0, 0).getTime();

const sess = (over: Partial<WorkSession> = {}): WorkSession => ({
  id: 's1',
  taskId: 't1',
  taskName: 'Role need to be city based.',
  groupName: 'DigiMove',
  startTime: NOW - 3600_000,
  endTime: NOW,
  durationSeconds: 3600,
  ...over,
});

const grp = (tasks: Group['tasks']): Group => ({ id: 'g1', name: 'DigiMove', tasks, expanded: true });

describe('diffRows — a stale device can no longer destroy other devices\' work', () => {
  test('sessions created on another device are never deleted', () => {
    // Device B last synced [s1]. Device A has since added s2 on the server.
    // B edits s1. The old whole-collection write deleted s2.
    const known = toRows.sessions('u', [sess()]);
    const mine = toRows.sessions('u', [sess({ notes: 'edited' })]);
    const { upserts, deletes } = diffRows(known, mine);
    assert.deepEqual(upserts.map((r) => r.id), ['s1']);
    assert.deepEqual(deletes, []); // s2 is untouched
  });

  test('only rows that changed are sent', () => {
    const a = [sess({ id: 'a' }), sess({ id: 'b' })];
    const { upserts } = diffRows(toRows.sessions('u', a), toRows.sessions('u', a));
    assert.equal(upserts.length, 0);
  });

  test('a row this device deleted is deleted', () => {
    const { deletes } = diffRows(
      toRows.sessions('u', [sess({ id: 'a' }), sess({ id: 'b' })]),
      toRows.sessions('u', [sess({ id: 'a' })]),
    );
    assert.deepEqual(deletes, ['b']);
  });

  test('without a trusted baseline (offline cache), nothing is deleted', () => {
    const { upserts, deletes } = diffRows(null, toRows.sessions('u', [sess()]));
    assert.equal(upserts.length, 1);
    assert.deepEqual(deletes, []);
  });

  test('the per-write timestamp alone does not count as a change', () => {
    const g = [grp([{ id: 't1', name: 'x', elapsedSeconds: 0, baseSeconds: 0 }])];
    const before = toRows.groups('u', g).map((r) => ({ ...r, updated_at: 'yesterday' }));
    assert.equal(diffRows(before, toRows.groups('u', g)).upserts.length, 0);
  });
});

describe('deterministic ids — the same action on two devices is one row', () => {
  test('completing the same task on two devices yields one completion id', () => {
    assert.equal(completionIdFor('t1'), completionIdFor('t1'));
  });

  test('closing the same timer segment on two devices yields one session id', () => {
    assert.equal(sessionIdFor('t1', 1000), sessionIdFor('t1', 1000));
    assert.notEqual(sessionIdFor('t1', 1000), sessionIdFor('t1', 2000));
  });
});

describe('completed tasks stay completed', () => {
  const completion = (id: string): CompletedTask => ({
    id,
    taskName: 'Role need to be city based.',
    groupName: 'DigiMove',
    totalSeconds: 60,
    completedAt: NOW,
  });

  test('recognised by deterministic id', () => {
    assert.ok(completedTaskIds([completion(completionIdFor('t1'))], []).has('t1'));
  });

  test('recognised for older completions through their attributed sessions', () => {
    const done = completedTaskIds([completion('legacy-xyz')], [sess({ completedTaskId: 'legacy-xyz' })]);
    assert.ok(done.has('t1'));
  });

  test('a session tag pointing at a completion that no longer exists (undone) does not count', () => {
    assert.equal(completedTaskIds([], [sess({ completedTaskId: 'gone' })]).size, 0);
  });

  test('a stale device writing the task back cannot resurrect it', () => {
    // Exactly the reported bug: completed on device A, device B's group
    // still lists it. On load the task is dropped instead of shown again.
    const groups = [grp([
      { id: 't1', name: 'Role need to be city based.', elapsedSeconds: 1328 },
      { id: 't2', name: 'Still open', elapsedSeconds: 0 },
    ])];
    const done = completedTaskIds([completion(completionIdFor('t1'))], []);
    const visible = stripCompletedTasks(groups, done);
    assert.deepEqual(visible[0].tasks.map((t) => t.id), ['t2']);
  });

  test('nothing completed leaves groups untouched (same reference)', () => {
    const groups = [grp([{ id: 't2', name: 'x', elapsedSeconds: 0 }])];
    assert.equal(stripCompletedTasks(groups, new Set()), groups);
  });
});

describe('derived totals — every device computes the same number', () => {
  test('total = base + recorded sessions + live segment', () => {
    const groups = [grp([{ id: 't1', name: 'x', elapsedSeconds: 0, baseSeconds: 100 }])];
    const view = withDerivedElapsed(
      groups,
      [sess({ durationSeconds: 600 })],
      { taskId: 't1', startTime: NOW - 60_000 },
      NOW,
    );
    assert.equal(view[0].tasks[0].elapsedSeconds, 100 + 600 + 60);
  });

  test('a session recorded on another device shows up in the total here', () => {
    const groups = [grp([{ id: 't1', name: 'x', elapsedSeconds: 0, baseSeconds: 0 }])];
    const view = withDerivedElapsed(
      groups,
      [sess({ id: 'mine', durationSeconds: 300 }), sess({ id: 'other-device', durationSeconds: 200 })],
      null,
      NOW,
    );
    assert.equal(view[0].tasks[0].elapsedSeconds, 500);
  });
});

describe('migrateTaskBase — old counter model to base time', () => {
  test('base = old counter minus recorded sessions', () => {
    const [g] = migrateTaskBase(
      [grp([{ id: 't1', name: 'x', elapsedSeconds: 5400 }])],
      [sess({ durationSeconds: 3600 })],
      null,
      NOW,
    );
    assert.equal(g.tasks[0].baseSeconds, 1800);
    assert.equal(g.tasks[0].baseAt, NOW);
  });

  test('the checkpointed part of a running segment is not counted again', () => {
    const start = NOW - 1200_000;
    const [g] = migrateTaskBase(
      [grp([{ id: 't1', name: 'x', elapsedSeconds: 600 }])], // 10 min, all live
      [],
      { runningTaskId: 't1', activeSessionStart: start, lastActiveTimestamp: start + 600_000 },
      NOW,
    );
    assert.equal(g.tasks[0].baseSeconds, 0);
  });

  test('already-migrated tasks are left alone (same reference)', () => {
    const groups = [grp([{ id: 't1', name: 'x', elapsedSeconds: 5, baseSeconds: 0 }])];
    assert.equal(migrateTaskBase(groups, [], null, NOW), groups);
  });
});

describe('mergeChildren — two devices editing tasks in the same group', () => {
  const t = (id: string, name = id) => ({ id, name });

  test('a task removed (completed) elsewhere is not resurrected by a stale edit', () => {
    // Server: t1 was completed on the laptop. Desktop still has it and edits t2.
    const merged = mergeChildren([t('t2')], [t('t1'), t('t2')], [t('t1'), t('t2', 'renamed')]);
    assert.deepEqual(merged, [t('t2', 'renamed')]);
  });

  test('a task added elsewhere survives this device adding its own', () => {
    const merged = mergeChildren([t('other'), t('a')], [t('a')], [t('mine'), t('a')]);
    assert.deepEqual(merged.map((c) => c.id).sort(), ['a', 'mine', 'other']);
  });

  test("a task this device didn't touch keeps the server's newer version", () => {
    const merged = mergeChildren([t('a', 'renamed elsewhere')], [t('a')], [t('a')]);
    assert.deepEqual(merged, [t('a', 'renamed elsewhere')]);
  });

  test('a task removed here is removed', () => {
    assert.deepEqual(mergeChildren([t('a'), t('b')], [t('a'), t('b')], [t('a')]), [t('a')]);
  });
});

describe('stableStringify', () => {
  test('sees changes nested inside arrays of objects', () => {
    // Regression: a JSON.stringify key whitelist hid every nested change,
    // so edits inside a group's tasks were never detected as changes.
    assert.notEqual(
      stableStringify({ tasks: [{ id: 'a', baseSeconds: 1 }] }),
      stableStringify({ tasks: [{ id: 'a', baseSeconds: 2 }] }),
    );
  });

  test('ignores key order', () => {
    assert.equal(stableStringify({ a: 1, b: { c: 2, d: 3 } }), stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
  });
});
