import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkDay, previousWorkDay, streakBefore, weekKey, weekday } from './calendar.js';

const SUN_THU = [0, 1, 2, 3, 4];

test('weekday of known dates', () => {
  assert.equal(weekday('2026-11-01'), 0); // Sunday
  assert.equal(weekday('2026-11-06'), 5); // Friday
});

test('previous work day skips the weekend', () => {
  assert.equal(previousWorkDay('2026-11-08', SUN_THU), '2026-11-05'); // Sunday -> Thursday
  assert.equal(previousWorkDay('2026-11-04', SUN_THU), '2026-11-03');
  assert.equal(isWorkDay('2026-11-07', SUN_THU), false); // Saturday
});

test('mining streak counts consecutive work days across a weekend', () => {
  const done = new Set(['2026-11-04', '2026-11-05', '2026-11-08']);
  assert.equal(streakBefore('2026-11-09', done, SUN_THU), 3); // Sun 8, Thu 5, Wed 4
  assert.equal(streakBefore('2026-11-10', done, SUN_THU), 0); // Mon 9 was missed
});

test('week key is the Sunday of that week', () => {
  assert.equal(weekKey('2026-11-05'), '2026-11-01');
  assert.equal(weekKey('2026-11-01'), '2026-11-01');
});
