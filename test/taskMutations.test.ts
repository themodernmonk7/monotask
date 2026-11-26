import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  adjustTaskElapsed,
  applySessionPatch,
  migrateLegacyTags,
  moveTaskBetweenGroups,
  pinnedFirst,
  removeTagFromTasks,
  retimeCompletedTaskSessions,
  setGroupColor,
  toggleGroupPinned,
} from '../src/lib/taskMutations';
import type { Group, Tag, WorkSession } from '../src/types';

const g = (id: string, over: Partial<Group> = {}): Group => ({
  id,
  name: id.toUpperCase(),
  tasks: [{ id: `${id}-t1`, name: 'Task', elapsedSeconds: 600 }],
  expanded: true,
  ...over,
});

describe('pinnedFirst', () => {
  test('moves pinned groups to the front, preserving order within bands', () => {
    const out = pinnedFirst([g('a'), g('b', { pinned: true }), g('c'), g('d', { pinned: true })]);
    assert.deepEqual(out.map((x) => x.id), ['b', 'd', 'a', 'c']);
  });

  test('returns the same reference when nothing is pinned', () => {
    const input = [g('a'), g('b')];
    assert.equal(pinnedFirst(input), input, 'no-op must not allocate a new array');
  });
});

describe('toggleGroupPinned', () => {
  test('pins and unpins', () => {
    const pinned = toggleGroupPinned([g('a'), g('b')], 'b');
    assert.equal(pinned.find((x) => x.id === 'b')?.pinned, true);
    assert.equal(pinned[0].id, 'b', 'newly pinned sorts to the top');

    const unpinned = toggleGroupPinned(pinned, 'b');
    assert.equal(unpinned.find((x) => x.id === 'b')?.pinned, false);
  });

  test('refuses to exceed the cap of 2', () => {
    const atCap = [g('a', { pinned: true }), g('b', { pinned: true }), g('c')];
    const out = toggleGroupPinned(atCap, 'c');
    assert.equal(out, atCap, 'must return the original array untouched');
    assert.equal(out.filter((x) => x.pinned).length, 2);
  });

  test('unpinning still works while at the cap', () => {
    const atCap = [g('a', { pinned: true }), g('b', { pinned: true })];
    const out = toggleGroupPinned(atCap, 'a');
    assert.equal(out.filter((x) => x.pinned).length, 1);
  });

  test('ignores an unknown group', () => {
    const input = [g('a')];
    assert.equal(toggleGroupPinned(input, 'nope'), input);
  });
});

describe('moveTaskBetweenGroups', () => {
  test('moves the task and keeps its data intact', () => {
    const from = g('a');
    from.tasks = [{ id: 't1', name: 'Work', elapsedSeconds: 900, description: 'why', tagIds: ['tag1'] }];
    const out = moveTaskBetweenGroups([from, g('b')], 'a', 'b', 't1');

    assert.equal(out.find((x) => x.id === 'a')?.tasks.length, 0);
    const moved = out.find((x) => x.id === 'b')?.tasks.find((t) => t.id === 't1');
    assert.ok(moved);
    assert.equal(moved.elapsedSeconds, 900, 'elapsed time must survive the move');
    assert.equal(moved.description, 'why');
    assert.deepEqual(moved.tagIds, ['tag1']);
  });

  test('is a no-op for same group, unknown task or unknown target', () => {
    const input = [g('a'), g('b')];
    assert.equal(moveTaskBetweenGroups(input, 'a', 'a', 'a-t1'), input);
    assert.equal(moveTaskBetweenGroups(input, 'a', 'b', 'ghost'), input);
    assert.equal(moveTaskBetweenGroups(input, 'a', 'ghost', 'a-t1'), input);
  });
});

describe('adjustTaskElapsed', () => {
  test('adds and subtracts', () => {
    const input = [g('a')];
    assert.equal(adjustTaskElapsed(input, 'a-t1', 300)[0].tasks[0].elapsedSeconds, 900);
    assert.equal(adjustTaskElapsed(input, 'a-t1', -300)[0].tasks[0].elapsedSeconds, 300);
  });

  test('clamps at zero rather than going negative', () => {
    const out = adjustTaskElapsed([g('a')], 'a-t1', -9999);
    assert.equal(out[0].tasks[0].elapsedSeconds, 0);
  });

  test('no-ops for zero delta or an unknown task', () => {
    const input = [g('a')];
    assert.equal(adjustTaskElapsed(input, 'a-t1', 0), input);
    assert.equal(adjustTaskElapsed(input, 'ghost', 100), input);
  });
});

describe('removeTagFromTasks', () => {
  test('strips the id everywhere it appears', () => {
    const a = g('a');
    a.tasks = [{ id: 't1', name: 'A', elapsedSeconds: 0, tagIds: ['x', 'y'] }];
    const b = g('b');
    b.tasks = [{ id: 't2', name: 'B', elapsedSeconds: 0, tagIds: ['y'] }];

    const out = removeTagFromTasks([a, b], 'y');
    assert.deepEqual(out[0].tasks[0].tagIds, ['x']);
    assert.deepEqual(out[1].tasks[0].tagIds, []);
  });

  test('no-ops when the tag is unused', () => {
    const input = [g('a')];
    assert.equal(removeTagFromTasks(input, 'unused'), input);
  });
});

describe('migrateLegacyTags', () => {
  test('hoists embedded tags into the library and leaves ids behind', () => {
    const a = g('a');
    a.tasks = [
      { id: 't1', name: 'A', elapsedSeconds: 0, tags: [{ id: 'old1', label: 'Bug', color: 'red' }] },
    ];

    const { groups, tags, migrated } = migrateLegacyTags([a], []);
    assert.equal(migrated, true);
    assert.equal(tags.length, 1);
    assert.equal(tags[0].label, 'Bug');
    assert.deepEqual(groups[0].tasks[0].tagIds, ['old1']);
    assert.equal(groups[0].tasks[0].tags, undefined, 'legacy field must be dropped');
  });

  test('matches existing library tags by label, case-insensitively', () => {
    const existing: Tag[] = [{ id: 'lib1', label: 'bug', color: 'sky' }];
    const a = g('a');
    a.tasks = [
      { id: 't1', name: 'A', elapsedSeconds: 0, tags: [{ id: 'old1', label: 'BUG', color: 'red' }] },
    ];

    const { groups, tags } = migrateLegacyTags([a], existing);
    assert.equal(tags.length, 1, 'must not create a duplicate tag');
    assert.deepEqual(groups[0].tasks[0].tagIds, ['lib1'], 'should point at the existing tag');
  });

  test('de-duplicates the same legacy label across tasks', () => {
    const a = g('a');
    a.tasks = [
      { id: 't1', name: 'A', elapsedSeconds: 0, tags: [{ id: 'o1', label: 'Deep', color: 'violet' }] },
      { id: 't2', name: 'B', elapsedSeconds: 0, tags: [{ id: 'o2', label: 'Deep', color: 'violet' }] },
    ];
    const { tags, groups } = migrateLegacyTags([a], []);
    assert.equal(tags.length, 1);
    assert.deepEqual(groups[0].tasks[0].tagIds, groups[0].tasks[1].tagIds);
  });

  test('is a no-op with nothing to migrate', () => {
    const input = [g('a')];
    const existing: Tag[] = [];
    const out = migrateLegacyTags(input, existing);
    assert.equal(out.migrated, false);
    assert.equal(out.groups, input);
    assert.equal(out.tags, existing);
  });
});

describe('applySessionPatch', () => {
  const base: WorkSession = {
    id: 's1', taskId: 't1', taskName: 'Work', groupName: 'Core',
    startTime: 1_000_000, endTime: 1_000_000 + 3600_000, durationSeconds: 3600,
  };

  test('recomputes duration and reports the delta', () => {
    const out = applySessionPatch(base, { endTime: base.startTime + 1800_000 });
    assert.ok(out);
    assert.equal(out.session.durationSeconds, 1800);
    assert.equal(out.deltaSeconds, -1800);
  });

  test('rejects an end at or before the start', () => {
    assert.equal(applySessionPatch(base, { endTime: base.startTime }), null);
    assert.equal(applySessionPatch(base, { endTime: base.startTime - 1 }), null);
  });

  test('blank notes clear rather than storing an empty string', () => {
    const out = applySessionPatch(base, { notes: '   ' });
    assert.equal(out?.session.notes, undefined);
  });

  test('omitted notes are preserved', () => {
    const withNotes = { ...base, notes: 'keep me' };
    const out = applySessionPatch(withNotes, { endTime: base.endTime + 1000 });
    assert.equal(out?.session.notes, 'keep me');
  });
});

describe('setGroupColor', () => {
  test('sets a color on a group', () => {
    const out = setGroupColor([g('a')], 'a', 'violet');
    assert.equal(out[0].color, 'violet');
  });

  test('clicking the same color again clears it back to neutral', () => {
    const colored = setGroupColor([g('a')], 'a', 'violet');
    const cleared = setGroupColor(colored, 'a', 'violet');
    assert.equal(cleared[0].color, undefined);
  });

  test('switching colors replaces, not toggles off', () => {
    const violet = setGroupColor([g('a')], 'a', 'violet');
    const sky = setGroupColor(violet, 'a', 'sky');
    assert.equal(sky[0].color, 'sky');
  });

  test('no-ops for an unknown group', () => {
    const input = [g('a')];
    assert.equal(setGroupColor(input, 'ghost', 'red'), input);
  });
});

describe('retimeCompletedTaskSessions', () => {
  const H = 3600_000;
  const T0 = new Date(2026, 10, 26, 10, 0, 0).getTime();
  const s = (id: string, startH: number, mins: number, completedTaskId = 'c1'): WorkSession => ({
    id,
    taskId: 't1',
    taskName: 'Customer screen',
    groupName: 'Core',
    startTime: T0 + startH * H,
    endTime: T0 + startH * H + mins * 60_000,
    durationSeconds: mins * 60,
    completedTaskId,
  });
  const sum = (list: WorkSession[], id = 'c1') =>
    list.filter((x) => x.completedTaskId === id).reduce((a, x) => a + x.durationSeconds, 0);

  test('regression: editing the total never multiplies it by the session count', () => {
    const before = [s('a', 0, 40), s('b', 1, 30), s('c', 3, 60)];
    const after = retimeCompletedTaskSessions(before, 'c1', 5571);
    assert.equal(sum(after), 5571); // was 3 × 5571 before the fix
    for (const x of after) assert.equal(x.endTime - x.startTime, x.durationSeconds * 1000);
  });

  test('raising the total extends only the latest session', () => {
    const after = retimeCompletedTaskSessions([s('a', 0, 40), s('c', 3, 60)], 'c1', 120 * 60);
    assert.equal(after.find((x) => x.id === 'a')!.durationSeconds, 40 * 60);
    assert.equal(after.find((x) => x.id === 'c')!.durationSeconds, 80 * 60);
  });

  test('cutting the total trims from the latest backwards and drops emptied sessions', () => {
    const after = retimeCompletedTaskSessions([s('a', 0, 40), s('b', 1, 30), s('c', 3, 60)], 'c1', 50 * 60);
    assert.deepEqual(after.map((x) => [x.id, x.durationSeconds / 60]), [['a', 40], ['b', 10]]);
  });

  test('other tasks are untouched and a no-op returns the same array', () => {
    const other = s('z', 2, 15, 'c2');
    const before = [s('a', 0, 40), other];
    assert.equal(retimeCompletedTaskSessions(before, 'c1', 40 * 60), before);
    const after = retimeCompletedTaskSessions(before, 'c1', 10 * 60);
    assert.equal(after.find((x) => x.id === 'z'), other);
    assert.equal(retimeCompletedTaskSessions(before, 'missing', 99), before);
  });
});
