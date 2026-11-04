import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfectDayPlayers, pointsForError, relativeError, scoreQuestion, scoreYesNo } from './scoring.js';

test('yes/no: right answer is 50, wrong is 0', () => {
  const res = scoreYesNo([{ playerId: 'a', value: 1 }, { playerId: 'b', value: 0 }], 1);
  const by = Object.fromEntries(res.map((r) => [r.playerId, r]));
  assert.equal(by.a.points, 50);
  assert.equal(by.b.points, 0);
  assert.equal(by.a.bonus, 0); // 1 right vs 1 wrong is not "most were wrong"
});

test('yes/no: being right when most were wrong earns +30', () => {
  const res = scoreYesNo(
    [{ playerId: 'a', value: 1 }, { playerId: 'b', value: 0 }, { playerId: 'c', value: 0 }],
    1,
  );
  const a = res.find((r) => r.playerId === 'a');
  assert.equal(a.points + a.bonus, 80);
  assert.equal(a.beatCrowd, true);
  assert.ok(res.filter((r) => r.playerId !== 'a').every((r) => r.points === 0 && r.bonus === 0));
});

test('yes/no answers count toward a perfect day only when right', () => {
  const yesno = scoreYesNo([{ playerId: 'a', value: 1 }, { playerId: 'b', value: 0 }], 1);
  const number = [{ playerId: 'a', error: 0.05 }, { playerId: 'b', error: 0.05 }];
  assert.deepEqual(perfectDayPlayers([number, yesno]), ['a']);
});

test('exact and near-exact guesses get full points', () => {
  assert.equal(pointsForError(relativeError(1000, 1000)), 100);
  assert.equal(pointsForError(relativeError(1015, 1000)), 100);
});

test('points follow the curve', () => {
  assert.equal(pointsForError(0.1), 80);
  assert.equal(pointsForError(0.25), 50);
  assert.equal(pointsForError(0.5), 20);
  assert.equal(pointsForError(1), 0);
  assert.equal(pointsForError(5), 0);
  // halfway between 10% (80) and 25% (50)
  assert.equal(pointsForError(0.175), 65);
});

test('scale independent: 10% off is the same on small and huge numbers', () => {
  assert.equal(pointsForError(relativeError(55, 50)), pointsForError(relativeError(220000, 200000)));
});

test('real answer of zero falls back to absolute distance', () => {
  assert.equal(pointsForError(relativeError(0, 0)), 100);
  assert.equal(pointsForError(relativeError(3, 0)), 0);
});

test('closest player and players who beat the crowd get bonuses', () => {
  const res = scoreQuestion(
    [{ playerId: 'a', value: 100 }, { playerId: 'b', value: 150 }, { playerId: 'c', value: 400 }],
    110,
  );
  const by = Object.fromEntries(res.map((r) => [r.playerId, r]));
  assert.equal(by.a.bonus, 30); // closest + beat crowd (crowd avg 216)
  assert.equal(by.b.bonus, 10);
  assert.equal(by.c.bonus, 0);
  assert.deepEqual([by.a.closest, by.a.beatCrowd], [true, true]);
  assert.deepEqual([by.b.closest, by.b.beatCrowd], [false, true]);
});

test('ties for closest both get the bonus; a single player gets no crowd bonus', () => {
  const tie = scoreQuestion([{ playerId: 'a', value: 90 }, { playerId: 'b', value: 110 }], 100);
  assert.ok(tie.every((r) => r.bonus >= 20));
  const solo = scoreQuestion([{ playerId: 'a', value: 100 }], 100);
  assert.equal(solo[0].bonus, 20);
});

test('perfect day requires every question within 10%', () => {
  const q1 = [{ playerId: 'a', error: 0.05 }, { playerId: 'b', error: 0.05 }];
  const q2 = [{ playerId: 'a', error: 0.1 }, { playerId: 'b', error: 0.3 }];
  assert.deepEqual(perfectDayPlayers([q1, q2]), ['a']);
});
