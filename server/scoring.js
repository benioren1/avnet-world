// Pure scoring logic. No I/O here, so it is easy to test (see scoring.test.js).

export const CLOSEST_BONUS = 20;
export const BEAT_CROWD_BONUS = 10;
export const PERFECT_DAY_BONUS = 50;
export const PERFECT_DAY_ERROR = 0.1;

// Relative error. When the real answer is 0 we divide by 1,
// so the error becomes the absolute distance.
export function relativeError(guess, actual) {
  return Math.abs(guess - actual) / Math.max(Math.abs(actual), 1);
}

// Points by error, linear between these anchor points.
const CURVE = [
  [0, 100],
  [0.02, 100],
  [0.1, 80],
  [0.25, 50],
  [0.5, 20],
  [1, 0],
];

export function pointsForError(err) {
  if (err >= 1) return 0;
  for (let i = 1; i < CURVE.length; i++) {
    const [e1, p1] = CURVE[i];
    if (err <= e1) {
      const [e0, p0] = CURVE[i - 1];
      return Math.round(p0 + ((err - e0) / (e1 - e0)) * (p1 - p0));
    }
  }
  return 0;
}

// guesses: [{ playerId, value }] for one question.
// Returns [{ playerId, error, points, bonus }].
export function scoreQuestion(guesses, actual) {
  if (!guesses.length) return [];
  const errors = guesses.map((g) => relativeError(g.value, actual));
  const best = Math.min(...errors);
  const crowd = guesses.reduce((s, g) => s + g.value, 0) / guesses.length;
  const crowdError = relativeError(crowd, actual);

  return guesses.map((g, i) => {
    const error = errors[i];
    let bonus = 0;
    if (error === best) bonus += CLOSEST_BONUS;
    if (guesses.length > 1 && error < crowdError) bonus += BEAT_CROWD_BONUS;
    return { playerId: g.playerId, error, points: pointsForError(error), bonus };
  });
}

// scoredByQuestion: array (one per question of the day) of scoreQuestion results.
// A perfect day = the player guessed every question within PERFECT_DAY_ERROR.
export function perfectDayPlayers(scoredByQuestion) {
  if (!scoredByQuestion.length) return [];
  const [first, ...rest] = scoredByQuestion;
  return first
    .filter((s) => s.error <= PERFECT_DAY_ERROR)
    .map((s) => s.playerId)
    .filter((pid) => rest.every((q) => q.some((s) => s.playerId === pid && s.error <= PERFECT_DAY_ERROR)));
}
