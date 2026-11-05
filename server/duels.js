// Personal bets ("duels") between two players, on a question they write themselves.
// The challenger writes the question, picks an opponent and a stake, and guesses in secret.
// The opponent accepts (guessing in secret too) or declines. At the end of the day the
// admin enters the real answer and the closer guess takes the pot.
//
// Money: each stake is a "spend" record (kind 'duel'), so it is locked the moment it's
// placed. Refunds delete those records; the winner gets a bonus of the whole pot.
// Because balances are derived from these records, re-resolving never double-pays.

export const DUEL_MIN = 20;
export const DUEL_MAX = 200;
export const DUEL_QUESTION_MAX = 120;
const KINDS = ['number', 'yesno'];
// A player takes part in one duel a day. A challenge you sent counts from the moment you
// send it; one you received counts only once you accept it, so an unanswered invite
// can't block you (several people may invite you; accepting one declines the rest).
const SENT_COUNTS = ['pending', 'active', 'resolved'];
const RECEIVED_COUNTS = ['active', 'resolved'];

export function createDuels(ctx) {
  const { db, newId, nowLocal, today, getSettings, addEvent, wallet, wrap, fail, withLock, toNumber, photoOf } = ctx;
  const nowIso = () => new Date().toISOString();
  // Every change to a bet's status runs one at a time (create, accept, decline, withdraw,
  // expire, resolve, cancel). Otherwise an accept could pass its "still pending?" check while
  // a withdraw or the lock-time expiry refunds the bet, and a pot nobody paid would go active.
  const serial = (fn) => withLock('duels', fn);

  // Bets close together with today's questions: at the earliest of the settings lock time and
  // the lock time each question got when it was created (that one doesn't move if the
  // setting changes later), so bets never stay open after the questions locked.
  async function lockPassed() {
    const { lockTime } = await getSettings();
    const date = today();
    const frozen = (await db.find('questions', { date })).map((q) => q.lockAt).filter(Boolean);
    const cutoff = [`${date} ${lockTime}`, ...frozen].sort()[0];
    return nowLocal() >= cutoff;
  }

  // Locked per player too, so a bet stake and a purchase can't both pass the same balance check.
  function stake(player, duel) {
    return withLock(player.id, async () => {
      const w = await wallet(player.id);
      if (w.balance < duel.stake) throw fail(400, `חסרים לך ${duel.stake - w.balance} דינרים`);
      try {
        await db.insertOne('spend', {
          id: `${duel.id}:${player.id}`, playerId: player.id, kind: 'duel', ref: duel.id, price: duel.stake, date: today(), at: nowIso(),
        });
      } catch (e) {
        if (e.code === 'DUPLICATE') throw fail(400, 'כבר שמת את הסכום על ההתערבות הזו');
        throw e;
      }
    });
  }

  const refundStakes = (duel) => db.deleteMany('spend', { kind: 'duel', ref: duel.id });
  const clearResult = async (duel) => {
    await db.deleteMany('bonuses', { duelId: duel.id });
    await db.deleteMany('events', { duelId: duel.id, type: 'duel-result' });
  };

  // Invitations nobody answered by the lock time expire, and the challenger gets the stake back.
  // expireStaleNow is for code already inside serial(); everyone else calls expireStale.
  const expireStale = () => serial(expireStaleNow);
  async function expireStaleNow() {
    const pending = await db.find('duels', { status: 'pending' });
    const passed = await lockPassed();
    for (const d of pending) {
      if (d.date < today() || (d.date === today() && passed)) {
        await refundStakes(d);
        await db.updateOne('duels', { id: d.id }, { status: 'expired', closedAt: nowIso() });
      }
    }
  }

  async function busyToday(playerId) {
    const date = today();
    const sent = await db.find('duels', { date, by: playerId });
    const received = await db.find('duels', { date, target: playerId });
    return sent.some((d) => SENT_COUNTS.includes(d.status)) || received.some((d) => RECEIVED_COUNTS.includes(d.status));
  }

  function parseGuess(kind, raw) {
    const v = toNumber(raw);
    if (kind === 'yesno') {
      if (v !== 0 && v !== 1) throw fail(400, 'בחר כן או לא');
    } else if (!Number.isFinite(v) || v < 0) {
      throw fail(400, 'הניחוש חייב להיות מספר חיובי');
    }
    return v;
  }

  // What a player may see: the opponent's number guess stays secret until the admin decides.
  function view(d, playerId, names) {
    const mineIsBy = d.by === playerId;
    const revealed = d.status === 'resolved' || d.kind === 'yesno';
    return {
      id: d.id, date: d.date, question: d.question, kind: d.kind, stake: d.stake, status: d.status,
      answer: d.status === 'resolved' ? d.answer : null, winner: d.winner ?? null,
      by: { id: d.by, name: names[d.by]?.name, photo: photoOf(names[d.by]) },
      target: { id: d.target, name: names[d.target]?.name, photo: photoOf(names[d.target]) },
      iAmChallenger: mineIsBy,
      myGuess: mineIsBy ? d.byGuess : d.targetGuess,
      theirGuess: revealed ? (mineIsBy ? d.targetGuess : d.byGuess) : null,
    };
  }

  async function playersById() {
    return Object.fromEntries((await db.find('players')).map((p) => [p.id, p]));
  }

  async function involving(playerId) {
    return [...(await db.find('duels', { by: playerId })), ...(await db.find('duels', { target: playerId }))];
  }

  function recordFrom(done, playerId) {
    const mine = done.filter((d) => d.by === playerId || d.target === playerId);
    return {
      wins: mine.filter((d) => d.winner === playerId).length,
      losses: mine.filter((d) => d.winner && d.winner !== playerId).length,
      ties: mine.filter((d) => d.winner === null).length,
    };
  }

  async function record(playerId) {
    return recordFrom((await involving(playerId)).filter((d) => d.status === 'resolved'), playerId);
  }

  // Win/loss records for everyone from one query (the leaderboard shows them for all players).
  async function records() {
    const done = await db.find('duels', { status: 'resolved' });
    return (playerId) => recordFrom(done, playerId);
  }

  // Wins per player in the current month, for the "duel king" title.
  async function winsThisMonth() {
    const month = today().slice(0, 7);
    const counts = {};
    (await db.find('duels', { status: 'resolved' }))
      .filter((d) => d.date.startsWith(month) && d.winner)
      .forEach((d) => { counts[d.winner] = (counts[d.winner] || 0) + 1; });
    return counts;
  }

  async function forTv() {
    const names = await playersById();
    return (await db.find('duels', { date: today() }))
      .filter((d) => d.status === 'active' || d.status === 'resolved')
      .map((d) => ({
        id: d.id, question: d.question, kind: d.kind, stake: d.stake, status: d.status, winner: d.winner ?? null,
        answer: d.status === 'resolved' ? d.answer : null,
        by: { id: d.by, name: names[d.by]?.name, photo: photoOf(names[d.by]) },
        target: { id: d.target, name: names[d.target]?.name, photo: photoOf(names[d.target]) },
        byGuess: d.status === 'resolved' || d.kind === 'yesno' ? d.byGuess : null,
        targetGuess: d.status === 'resolved' || d.kind === 'yesno' ? d.targetGuess : null,
      }));
  }

  // When a player is deleted, their open duels are cancelled and everyone gets their stake back.
  const cleanupPlayer = (playerId) => serial(() => cleanupPlayerNow(playerId));
  async function cleanupPlayerNow(playerId) {
    for (const d of await involving(playerId)) {
      if (d.status === 'resolved') continue;
      await refundStakes(d);
      await db.deleteMany('duels', { id: d.id });
    }
  }

  function decide(d, answer) {
    if (d.kind === 'yesno') {
      if (d.byGuess === answer) return d.by;
      if (d.targetGuess === answer) return d.target;
      return null;
    }
    const a = Math.abs(d.byGuess - answer);
    const b = Math.abs(d.targetGuess - answer);
    if (a === b) return null;
    return a < b ? d.by : d.target;
  }

  function register({ admin, play }) {
    // ===== player =====
    play.get('/duels', wrap(async (req, res) => {
      await expireStale();
      const me = req.player.id;
      const names = await playersById();
      const all = (await involving(me)).sort((a, b) => b.at.localeCompare(a.at));
      const { lockTime } = await getSettings();
      res.json({
        today: all.filter((d) => d.date === today()).map((d) => view(d, me, names)),
        history: all.filter((d) => d.status === 'resolved').slice(0, 10).map((d) => view(d, me, names)),
        record: await record(me),
        busy: await busyToday(me),
        rules: { min: DUEL_MIN, max: DUEL_MAX, maxChars: DUEL_QUESTION_MAX, lockTime, lockPassed: await lockPassed() },
      });
    }));

    play.post('/duels', wrap((req, res) => serial(() => createDuel(req, res))));

    async function createDuel(req, res) {
      await expireStaleNow();
      if (await lockPassed()) throw fail(400, 'אחרי שעת הנעילה כבר אי אפשר לפתוח התערבות. נסה מחר בבוקר');
      const question = String(req.body.question || '').trim();
      const kind = req.body.kind || 'number';
      const amount = Number(req.body.stake);
      if (!question) throw fail(400, 'כתוב על מה מתערבים');
      if (question.length > DUEL_QUESTION_MAX) throw fail(400, `עד ${DUEL_QUESTION_MAX} תווים`);
      if (!KINDS.includes(kind)) throw fail(400, 'סוג התערבות לא תקין');
      if (!Number.isInteger(amount) || amount < DUEL_MIN || amount > DUEL_MAX) throw fail(400, `הסכום חייב להיות בין ${DUEL_MIN} ל-${DUEL_MAX}`);
      const target = await db.findOne('players', { id: req.body.targetId });
      if (!target || target.active === false) throw fail(404, 'שחקן לא נמצא');
      if (target.id === req.player.id) throw fail(400, 'אי אפשר להתערב עם עצמך 😄');
      if (await busyToday(req.player.id)) throw fail(400, 'כבר יש לך התערבות היום. אפשר אחת ביום');
      if (await busyToday(target.id)) throw fail(400, `ל${target.name} כבר יש התערבות היום`);
      if ((await wallet(target.id)).balance < amount) throw fail(400, `ל${target.name} אין מספיק דינרים להתערבות כזו`);
      const guess = parseGuess(kind, req.body.guess);

      const duel = {
        id: newId('du'), date: today(), by: req.player.id, target: target.id, question, kind, stake: amount,
        byGuess: guess, targetGuess: null, status: 'pending', at: nowIso(),
      };
      await stake(req.player, duel); // throws before the duel exists if the challenger can't pay
      await db.insertOne('duels', duel);
      await addEvent('duel', `⚔️ ${req.player.name} אתגר/ה את ${target.name} להתערבות על ${amount} דינרים: "${question}"`, req.player.id, { duelId: duel.id });
      res.json({ ok: true, id: duel.id });
    }

    play.post('/duels/:id/accept', wrap((req, res) => serial(() => acceptDuel(req, res))));

    async function acceptDuel(req, res) {
      const d = await db.findOne('duels', { id: req.params.id });
      if (!d || d.target !== req.player.id) throw fail(404, 'התערבות לא נמצאה');
      await expireStaleNow();
      const fresh = await db.findOne('duels', { id: d.id });
      if (fresh.status !== 'pending') throw fail(400, 'ההתערבות כבר לא מחכה לתשובה');
      if (await busyToday(req.player.id)) throw fail(400, 'כבר יש לך התערבות היום. אם שלחת אתגר שעוד לא התקבל, בטל אותו קודם');
      // In yes/no the opponent automatically takes the other side.
      const guess = d.kind === 'yesno' ? 1 - d.byGuess : parseGuess(d.kind, req.body.guess);
      await stake(req.player, d);
      await db.updateOne('duels', { id: d.id }, { status: 'active', targetGuess: guess, acceptedAt: nowIso() });
      // One bet a day: other invitations to this player are declined, and their challengers refunded.
      for (const other of await db.find('duels', { date: today(), target: req.player.id, status: 'pending' })) {
        await refundStakes(other);
        await db.updateOne('duels', { id: other.id }, { status: 'declined', closedAt: nowIso() });
      }
      const by = await db.findOne('players', { id: d.by });
      await addEvent('duel', `🤝 ${req.player.name} קיבל/ה את האתגר של ${by?.name}! בקופה ${d.stake * 2} דינרים`, req.player.id, { duelId: d.id });
      res.json({ ok: true });
    }

    play.post('/duels/:id/decline', wrap((req, res) => serial(async () => {
      const d = await db.findOne('duels', { id: req.params.id });
      if (!d || d.target !== req.player.id || d.status !== 'pending') throw fail(404, 'התערבות ממתינה לא נמצאה');
      await refundStakes(d);
      await db.updateOne('duels', { id: d.id }, { status: 'declined', closedAt: nowIso() });
      res.json({ ok: true });
    })));

    play.post('/duels/:id/withdraw', wrap((req, res) => serial(async () => {
      const d = await db.findOne('duels', { id: req.params.id });
      if (!d || d.by !== req.player.id || d.status !== 'pending') throw fail(404, 'אפשר לבטל רק התערבות שעוד לא התקבלה');
      await refundStakes(d);
      await db.updateOne('duels', { id: d.id }, { status: 'cancelled', closedAt: nowIso() });
      res.json({ ok: true });
    })));

    // ===== admin =====
    admin.get('/duels', wrap(async (req, res) => {
      await expireStale();
      const date = req.query.date || today();
      const names = await playersById();
      const list = (await db.find('duels', { date })).sort((a, b) => a.at.localeCompare(b.at));
      res.json(list.map((d) => ({
        ...d,
        byName: names[d.by]?.name, byPhoto: photoOf(names[d.by]),
        targetName: names[d.target]?.name, targetPhoto: photoOf(names[d.target]),
      })));
    }));

    // Safe to run again with a corrected answer: the previous result is removed first.
    admin.post('/duels/:id/resolve', wrap((req, res) => serial(async () => {
      const d = await db.findOne('duels', { id: req.params.id });
      if (!d || !['active', 'resolved'].includes(d.status)) throw fail(404, 'אפשר להכריע רק התערבות שהתקבלה');
      const answer = toNumber(req.body.answer);
      if (d.kind === 'yesno' ? answer !== 0 && answer !== 1 : !Number.isFinite(answer)) throw fail(400, 'תשובה לא תקינה');
      await clearResult(d);
      const winner = decide(d, answer);
      const names = await playersById();
      const pot = d.stake * 2;
      if (winner) {
        await db.insertOne('bonuses', {
          id: `${d.id}:win`, duelId: d.id, date: d.date, at: nowIso(), playerId: winner, kind: 'duel-win', points: pot,
        });
        const loser = winner === d.by ? d.target : d.by;
        await addEvent('duel-result', `🏆 ${names[winner]?.name} ניצח/ה את ${names[loser]?.name} בהתערבות "${d.question}" ולקח/ה ${pot} דינרים!`, winner, { duelId: d.id });
      } else {
        // A tie gives each player their own stake back.
        for (const pid of [d.by, d.target]) {
          await db.insertOne('bonuses', {
            id: `${d.id}:tie:${pid}`, duelId: d.id, date: d.date, at: nowIso(), playerId: pid, kind: 'duel-tie', points: d.stake,
          });
        }
        await addEvent('duel-result', `🤝 תיקו בהתערבות של ${names[d.by]?.name} ו${names[d.target]?.name}: "${d.question}"`, null, { duelId: d.id });
      }
      await db.updateOne('duels', { id: d.id }, { status: 'resolved', answer, winner, resolvedAt: nowIso() });
      res.json({ ok: true, winner, winnerName: winner ? names[winner]?.name : null });
    })));

    admin.post('/duels/:id/cancel', wrap((req, res) => serial(async () => {
      const d = await db.findOne('duels', { id: req.params.id });
      if (!d || d.status === 'cancelled') throw fail(404, 'התערבות לא נמצאה');
      await clearResult(d);
      await refundStakes(d);
      await db.updateOne('duels', { id: d.id }, { status: 'cancelled', closedAt: nowIso() });
      res.json({ ok: true });
    })));
  }

  return { register, record, records, winsThisMonth, forTv, cleanupPlayer, expireStale };
}
