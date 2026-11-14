import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { deriveAllSessions } from '../src/lib/sessionDerivation';
import type { CompletedTask, Group, WorkSession } from '../src/types';

const NOW = new Date(2026, 10, 13, 17, 0, 0).getTime();

const group = (id: string, name: string, tasks: Group['tasks']): Group => ({
  id,
  name,
  tasks,
  expanded: true,
});

const session = (over: Partial<WorkSession> = {}): WorkSession => ({
  id: 's1',
  taskId: 't1',
  taskName: 'Work',
  groupName: 'Core',
  startTime: NOW - 3600_000,
  endTime: NOW,
  durationSeconds: 3600,
  ...over,
});

const total = (list: WorkSession[]) =>
  list.reduce((n, s) => n + s.durationSeconds, 0);

describe('deriveAllSessions', () => {
  test('passes recorded sessions through untouched', () => {
    const list = deriveAllSessions({
      sessions: [session()],
      completedTasks: [],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });
    assert.equal(list.length, 1);
    assert.equal(total(list), 3600);
  });

  test('synthesises a slice for a completed task with no session', () => {
    const completed: CompletedTask = {
      id: 'c1',
      taskName: 'Shipped it',
      groupName: 'Core',
      totalSeconds: 1800,
      completedAt: NOW,
    };

    const list = deriveAllSessions({
      sessions: [],
      completedTasks: [completed],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'legacy-c1');
    assert.equal(list[0].durationSeconds, 1800);
  });

  test('does NOT synthesise when a session already covers the completed task', () => {
    const completed: CompletedTask = {
      id: 'c1',
      taskName: 'Shipped it',
      groupName: 'Core',
      totalSeconds: 1800,
      completedAt: NOW,
    };
    const covering = session({ id: 's9', completedTaskId: 'c1', durationSeconds: 1800 });

    const list = deriveAllSessions({
      sessions: [covering],
      completedTasks: [completed],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    // The regression this guards: counting both would double the total.
    assert.equal(list.length, 1);
    assert.equal(total(list), 1800);
  });

  test('accounts for elapsed time beyond what sessions record', () => {
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 5400 }])];

    const list = deriveAllSessions({
      sessions: [session({ durationSeconds: 3600 })],
      completedTasks: [],
      groups,
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    const accum = list.find((s) => s.id === 'task-accum-t1');
    assert.ok(accum, 'expected an accumulation slice');
    assert.equal(accum.durationSeconds, 1800);
    assert.equal(total(list), 5400, 'total must equal the task elapsed');
  });

  test('emits no accumulation slice when sessions already cover elapsed', () => {
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 3600 }])];

    const list = deriveAllSessions({
      sessions: [session({ durationSeconds: 3600 })],
      completedTasks: [],
      groups,
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.equal(list.filter((s) => s.id.startsWith('task-accum')).length, 0);
    assert.equal(total(list), 3600);
  });

  test('a running timer is counted once, not twice', () => {
    // 600s already elapsed, all of it from the live segment still in progress.
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 600 }])];

    const list = deriveAllSessions({
      sessions: [],
      completedTasks: [],
      groups,
      runningTaskId: 't1',
      activeSession: { taskId: 't1', startTime: NOW - 600_000 },
      now: NOW,
    });

    const live = list.find((s) => s.id === 'active-live-t1');
    assert.ok(live, 'expected a live slice');
    assert.equal(live.durationSeconds, 600);
    assert.equal(
      list.filter((s) => s.id.startsWith('task-accum')).length,
      0,
      'live time must not also appear as unrecorded',
    );
    assert.equal(total(list), 600);
  });

  test('prior time plus a live segment totals correctly', () => {
    // 1800s recorded earlier, now running again for 600s => elapsed 2400.
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 2400 }])];

    const list = deriveAllSessions({
      sessions: [session({ durationSeconds: 1800 })],
      completedTasks: [],
      groups,
      runningTaskId: 't1',
      activeSession: { taskId: 't1', startTime: NOW - 600_000 },
      now: NOW,
    });

    assert.equal(total(list), 2400);
  });

  test('restoring a long-running timer does not inflate the total', () => {
    // Reload after 2h away with the timer running: elapsed was credited the
    // gap, and activeSessionStart is still the original start.
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 7200 }])];

    const list = deriveAllSessions({
      sessions: [],
      completedTasks: [],
      groups,
      runningTaskId: 't1',
      activeSession: { taskId: 't1', startTime: NOW - 7200_000 },
      now: NOW,
    });

    assert.equal(total(list), 7200, 'gap must be counted exactly once');
  });

  test('ignores a negative remainder rather than emitting a negative slice', () => {
    // Sessions claim more than the task's elapsed (possible after an edit).
    const groups = [group('g1', 'Core', [{ id: 't1', name: 'Work', elapsedSeconds: 600 }])];

    const list = deriveAllSessions({
      sessions: [session({ durationSeconds: 3600 })],
      completedTasks: [],
      groups,
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.ok(
      list.every((s) => s.durationSeconds >= 0),
      'no slice may have negative duration',
    );
    assert.equal(list.length, 1);
  });

  test('carries the ticket id through every synthesised kind', () => {
    const groups = [
      group('g1', 'Core', [{ id: 't1', name: '[PROJ-7] Work', elapsedSeconds: 600 }]),
    ];
    const list = deriveAllSessions({
      sessions: [],
      completedTasks: [
        { id: 'c1', taskName: '[API-9] Done', groupName: 'Core', totalSeconds: 60, completedAt: NOW },
      ],
      groups,
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.equal(list.find((s) => s.id === 'legacy-c1')?.ticketId, 'API-9');
    assert.equal(list.find((s) => s.id === 'task-accum-t1')?.ticketId, 'PROJ-7');
  });
});

describe('deriveAllSessions — completed task attribution', () => {
  // Reproduces the CSV bug: a task worked across several sessions and then
  // completed while NOT running. No session carries completedTaskId, so the
  // legacy slice duplicated every one of them.
  const completed: CompletedTask = {
    id: 'c-hey',
    taskName: 'Hey there',
    groupName: 'Tejas',
    totalSeconds: 382,
    completedAt: NOW,
  };

  const untaggedSessions: WorkSession[] = [
    session({ id: 's1', taskId: 't-hey', taskName: 'Hey there', groupName: 'Tejas', durationSeconds: 194 }),
    session({ id: 's2', taskId: 't-hey', taskName: 'Hey there', groupName: 'Tejas', durationSeconds: 11 }),
    session({ id: 's3', taskId: 't-hey', taskName: 'Hey there', groupName: 'Tejas', durationSeconds: 107 }),
    session({ id: 's4', taskId: 't-hey', taskName: 'Hey there', groupName: 'Tejas', durationSeconds: 53 }),
  ];

  test('tagged sessions plus the unrecorded remainder equal the total', () => {
    const tagged = untaggedSessions.map((s) => ({ ...s, completedTaskId: 'c-hey' }));

    const list = deriveAllSessions({
      sessions: tagged,
      completedTasks: [completed],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    // 194+11+107+53 = 365 recorded, 382 total => 17s remainder.
    assert.equal(total(list), 382, 'must equal the completed total exactly');
    const legacy = list.find((s) => s.id === 'legacy-c-hey');
    assert.equal(legacy?.durationSeconds, 17, 'legacy slice covers only the remainder');
  });

  test('a fully recorded completed task gets no legacy slice', () => {
    const tagged = untaggedSessions.map((s) => ({ ...s, completedTaskId: 'c-hey' }));
    const exact: CompletedTask = { ...completed, totalSeconds: 365 };

    const list = deriveAllSessions({
      sessions: tagged,
      completedTasks: [exact],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.equal(total(list), 365);
    assert.equal(list.find((s) => s.id === 'legacy-c-hey'), undefined);
  });

  test('over-recorded sessions never produce a negative legacy slice', () => {
    const tagged = untaggedSessions.map((s) => ({ ...s, completedTaskId: 'c-hey' }));
    const under: CompletedTask = { ...completed, totalSeconds: 100 };

    const list = deriveAllSessions({
      sessions: tagged,
      completedTasks: [under],
      groups: [],
      runningTaskId: null,
      activeSession: null,
      now: NOW,
    });

    assert.ok(list.every((s) => s.durationSeconds >= 0));
    assert.equal(list.find((s) => s.id === 'legacy-c-hey'), undefined);
  });
});
