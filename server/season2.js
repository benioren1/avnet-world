// Season 2 features, kept apart from the core game (index.js):
// mining, incidents, passive income + upgrades, cosmetics, decorations,
// billboards, the weekly "most beautiful city" vote, and the office TV screen.
// See docs/season-2.md for the product spec.

import express from 'express';
import {
  BILLBOARD_MAX_CHARS, BILLBOARD_PRICE, DECORATIONS, DEFAULT_PROFILE, LEVEL_INCOME_MULT,
  UNLOCKABLES, UPGRADE_COST_MULT, catalog,
} from './catalog.js';
import { addDays, isWorkDay, streakBefore, weekKey, weekday } from './calendar.js';

const FIRST_MINER_BONUS = 20;
const GOLD_NUGGET = 250;
const GOLD_CHANCE = 0.05;
const MINE_STREAK_STEP = 5;
const MAX_DECORATIONS = 30;
const EARLY_BIRD_TITLE_AT = 10;
const MINER_TITLE_STREAK = 5;
const ANNOUNCEMENT_MAX_CHARS = 120;
const DUEL_KING_MIN_WINS = 3;
const FACT_MAX_CHARS = 140;
const STATS_TTL_MS = 5 * 60 * 1000;
const CATCH_UP_DAYS = 7; // missed evenings (server down at payout time) are paid up to a week back

export function createSeason2(ctx) {
  const {
    db, newId, newToken, nowLocal, today, getMeta, setMeta, getSettings, getArchitecture,
    addEvent, wallet, wrap, fail, publicPlayer, leaderboard, duels, withLock, photoOf, createCodeGuard,
  } = ctx;

  const nowIso = () => new Date().toISOString();
  const time = () => nowLocal().slice(11);
  const isActive = (announcement) => !announcement.until || announcement.until >= today();

  // ---------- spending ----------
  // Charges the player for a non-component item. A fixed id makes one-off items
  // (a theme, an upgrade level) impossible to buy twice even with a double click.
  // Serialized per player (withLock), so two quick purchases can't both pass the balance check.
  function charge(player, { kind, ref = '', price, id = newId('s'), extra = {} }) {
    return withLock(player.id, async () => {
      const w = await wallet(player.id);
      if (w.balance < price) throw fail(400, `חסרים לך ${price - w.balance} דינרים`);
      try {
        await db.insertOne('spend', { id, playerId: player.id, kind, ref, price, date: today(), at: nowIso(), ...extra });
      } catch (e) {
        if (e.code === 'DUPLICATE') throw fail(400, 'כבר קנית את זה');
        throw e;
      }
      return id;
    });
  }

  const ownedUnlockables = (spends) => new Set(spends.filter((s) => s.kind === 'cosmetic').map((s) => s.ref));
  const profileOf = (player) => ({ ...DEFAULT_PROFILE, ...(player.profile || {}) });

  async function decorationsOf(playerId) {
    return (await db.find('spend', { playerId, kind: 'decoration' }))
      .map((d) => ({ id: d.id, type: d.ref, x: d.x, y: d.y }));
  }

  // ---------- incidents ----------
  const openIncidents = () => db.find('incidents', { status: 'open' });
  async function burningSet() {
    return new Set((await openIncidents()).flatMap((i) => i.componentIds));
  }

  // ---------- mining ----------
  async function mineGeneral() {
    const s = await getSettings();
    const date = today();
    const workday = isWorkDay(date, s.workDays);
    const t = time();
    const mines = (await db.find('bonuses', { kind: 'mine', date })).sort((a, b) => a.at.localeCompare(b.at));
    let firstMiner = null;
    if (mines.length) {
      const p = await db.findOne('players', { id: mines[0].playerId });
      firstMiner = { name: p?.name, photo: photoOf(p), time: mines[0].time };
    }
    return {
      workday,
      open: workday && t >= s.mineOpen && t < s.mineClose,
      opensAt: s.mineOpen,
      closesAt: s.mineClose,
      minersToday: mines.length,
      firstMiner,
    };
  }

  async function miningStatus(player) {
    const s = await getSettings();
    const date = today();
    const mine = await db.find('bonuses', { playerId: player.id, kind: 'mine' });
    const dates = new Set(mine.map((m) => m.date));
    const before = streakBefore(date, dates, s.workDays);
    const minedToday = mine.find((m) => m.date === date) || null;
    return {
      ...(await mineGeneral()),
      minedToday,
      streak: before + (minedToday ? 1 : 0),
      nextAmount: Math.min(s.mineBase + MINE_STREAK_STEP * before, s.mineBase * 2),
    };
  }

  // ---------- TV hall of fame + automatic "did you know?" ----------
  // Scans the whole history, so it is refreshed at most every few minutes.
  let statsCache = { at: 0, value: null };
  async function teamStats(board, players) {
    if (statsCache.value && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.value;
    const [arch, purchases, guesses, questions, bonuses, allDuels] = await Promise.all([
      getArchitecture(), db.find('purchases'), db.find('guesses'), db.find('questions'), db.find('bonuses'), db.find('duels'),
    ]);
    const name = (id) => players[id]?.name;
    const face = (id) => ({ id, name: name(id), photo: photoOf(players[id]) });
    const compName = Object.fromEntries(arch.nodes.map((n) => [n.id, n.data.name]));
    const records = [];
    const autoFacts = [];
    const fact = (id, text) => autoFacts.push({ id: `auto-${id}`, text, auto: true });

    // Most popular component, and how much of the system nobody has built yet.
    const buyers = {};
    purchases.forEach((p) => { buyers[p.componentId] = (buyers[p.componentId] || 0) + 1; });
    const popular = Object.entries(buyers).sort((a, b) => b[1] - a[1])[0];
    if (popular && compName[popular[0]]) {
      records.push({ id: 'popular', emoji: '🔥', label: 'הרכיב הכי מבוקש', value: compName[popular[0]], sub: `${popular[1]} שחקנים קנו אותו` });
    }
    if (purchases.length) {
      const spent = purchases.reduce((s, p) => s + (p.price || 0), 0);
      fact('bought', `הצוות קנה כבר ${purchases.length.toLocaleString()} רכיבים ב-${spent.toLocaleString()} דינרים`);
      const untouched = arch.nodes.filter((n) => !buyers[n.id]).length;
      if (untouched) fact('untouched', `${untouched} רכיבים במערכת עוד לא נקנו אף פעם. מי יהיה הראשון?`);
    }
    const priciest = purchases.reduce((m, p) => (!m || (p.price || 0) > (m.price || 0) ? p : m), null);
    if (priciest && compName[priciest.componentId] && name(priciest.playerId)) {
      records.push({ id: 'priciest', emoji: '💸', label: 'הקנייה הכי יקרה', value: compName[priciest.componentId], sub: `${(priciest.price || 0).toLocaleString()} דינרים`, player: face(priciest.playerId) });
    }

    // Sharpest single guess on a number question ever.
    const questionOf = Object.fromEntries(questions.map((q) => [q.id, q]));
    const isNumber = (g) => (questionOf[g.questionId]?.kind || 'number') === 'number';
    const sharp = guesses
      .filter((g) => typeof g.error === 'number' && isNumber(g) && name(g.playerId))
      .reduce((m, g) => (!m || g.error < m.error ? g : m), null);
    if (sharp) {
      records.push({
        id: 'sharp', emoji: '🎯', label: 'הניחוש הכי מדויק אי פעם', player: face(sharp.playerId),
        value: sharp.error === 0 ? 'בול!' : `סטייה של ${(sharp.error * 100).toFixed(1)}%`, sub: questionOf[sharp.questionId]?.text,
      });
    }
    if (guesses.length) fact('guesses', `שלחתם עד היום ${guesses.length.toLocaleString()} ניחושים על ${questions.length.toLocaleString()} שאלות`);
    const bullseyes = guesses.filter((g) => g.error === 0 && isNumber(g)).length;
    if (bullseyes) fact('bullseye', `${bullseyes} פעמים מישהו ניחש מספר בול בדיוק 🎯`);

    // The most dedicated miner, gold, firefighters, the duel champion.
    const mineDays = {};
    bonuses.filter((b) => b.kind === 'mine').forEach((b) => { mineDays[b.playerId] = (mineDays[b.playerId] || 0) + 1; });
    const miner = Object.entries(mineDays).filter(([id]) => name(id)).sort((a, b) => b[1] - a[1])[0];
    if (miner) records.push({ id: 'miner', emoji: '⛏️', label: 'הכורה הכי חרוץ', player: face(miner[0]), value: `${miner[1]} בקרים` });
    const golds = bonuses.filter((b) => b.kind === 'mine' && b.gold).length;
    if (golds) fact('gold', `נמצאו במכרה ${golds} גושי זהב עד היום 💎`);
    const fires = bonuses.filter((b) => b.kind === 'incident').length;
    if (fires) fact('fire', `${fires} פעמים מישהו טיפל בתקלה וקיבל בונוס כבאי 🧯`);
    const wins = {};
    allDuels.filter((d) => d.status === 'resolved' && d.winner).forEach((d) => { wins[d.winner] = (wins[d.winner] || 0) + 1; });
    const champ = Object.entries(wins).filter(([id]) => name(id)).sort((a, b) => b[1] - a[1])[0];
    if (champ) records.push({ id: 'duels', emoji: '⚔️', label: 'אלוף ההתערבויות', player: face(champ[0]), value: `${champ[1]} ניצחונות` });

    // From the board: the fattest wallet and the best forecaster.
    const richest = [...board.rows].sort((a, b) => b.balance - a.balance)[0];
    if (richest?.balance > 0) records.push({ id: 'rich', emoji: '💰', label: 'הארנק הכי שמן', player: face(richest.id), value: `${richest.balance.toLocaleString()} דינרים` });
    const sage = board.rows.filter((r) => r.accuracy !== null).sort((a, b) => b.accuracy - a.accuracy)[0];
    if (sage) records.push({ id: 'sage', emoji: '🔮', label: 'החזאי הכי מדויק', player: face(sage.id), value: `${Math.round(sage.accuracy)}% דיוק` });

    // Fun with names: shared first names on the team.
    const firstNames = {};
    Object.values(players).filter((p) => p.active !== false).forEach((p) => {
      const first = String(p.name || '').trim().split(/\s+/)[0];
      if (first) firstNames[first] = (firstNames[first] || 0) + 1;
    });
    Object.entries(firstNames).filter(([, n]) => n > 1)
      .forEach(([first, n]) => fact(`name-${first}`, `יש בצוות ${n === 2 ? 'שני' : n} אנשים שקוראים להם ${first} 👯`));

    statsCache = { at: Date.now(), value: { records, autoFacts } };
    return statsCache.value;
  }

  // ---------- titles ----------
  // What every player's titles depend on, loaded once (the leaderboard needs all players).
  async function badgeContext() {
    const [settings, beautyWinner, wins] = await Promise.all([getSettings(), getMeta('beautyWinner', null), duels.winsThisMonth()]);
    return { settings, beautyWinner, wins, topWins: Math.max(0, ...Object.values(wins)) };
  }

  function titlesFor(player, bonuses, { settings, beautyWinner, wins, topWins }) {
    const titles = [];
    if (bonuses.some((b) => b.kind === 'incident')) titles.push({ id: 'firefighter', label: '🧯 כבאי' });
    if (bonuses.filter((b) => b.kind === 'early').length >= EARLY_BIRD_TITLE_AT) titles.push({ id: 'earlybird', label: '🐦 ציפור מוקדמת' });
    const mineDates = new Set(bonuses.filter((b) => b.kind === 'mine').map((b) => b.date));
    const streak = streakBefore(today(), mineDates, settings.workDays) + (mineDates.has(today()) ? 1 : 0);
    if (streak >= MINER_TITLE_STREAK) titles.push({ id: 'miner', label: '⛏️ כורה מתמיד' });
    const beautyIds = beautyWinner?.playerIds || (beautyWinner?.playerId ? [beautyWinner.playerId] : []);
    if (beautyIds.includes(player.id) && today() < addDays(beautyWinner.date, 7)) titles.push({ id: 'beauty', label: '🏆 העיר היפה' });
    // Duel king: most bet wins this month (at least 3).
    if (topWins >= DUEL_KING_MIN_WINS && wins[player.id] === topWins) titles.push({ id: 'duelking', label: '🗡️ מלך ההתערבויות' });
    return titles;
  }

  // ---------- weekly vote ----------
  async function voteState(player) {
    const s = await getSettings();
    const date = today();
    const week = weekKey(date);
    const closed = (await getMeta('votesClosed', [])).includes(week);
    const mine = player ? await db.findOne('votes', { id: `${week}:${player.id}` }) : null;
    return { open: weekday(date) === s.voteDay && !closed, week, myVote: mine?.target || null };
  }

  // Closes one week's vote: the most-voted active city wins the bonus. A tie is announced
  // as a tie and every tied city gets the bonus. Runs under a lock so it can't run twice at once.
  const closeVote = (week) => withLock('vote', () => closeVoteNow(week));
  async function closeVoteNow(week) {
    const closedWeeks = await getMeta('votesClosed', []);
    if (closedWeeks.includes(week)) return { already: true };
    const players = Object.fromEntries((await db.find('players')).filter((p) => p.active !== false).map((p) => [p.id, p]));
    const votes = (await db.find('votes', { week })).filter((v) => players[v.target]);
    await setMeta('votesClosed', [...closedWeeks.slice(-52), week]);
    if (!votes.length) return { winner: null };
    const tally = {};
    votes.forEach((v) => { tally[v.target] = (tally[v.target] || 0) + 1; });
    const count = Math.max(...Object.values(tally));
    const winnerIds = Object.keys(tally).filter((id) => tally[id] === count);
    const names = winnerIds.map((id) => players[id].name);
    const { voteBonus } = await getSettings();
    for (const id of winnerIds) {
      await db.insertOne('bonuses', { id: `${week}:vote:${id}`, date: today(), at: nowIso(), playerId: id, kind: 'vote', points: voteBonus });
    }
    await setMeta('beautyWinner', { playerIds: winnerIds, week, date: today() });
    await addEvent('vote', winnerIds.length > 1
      ? `🏆 תיקו בהצבעה על העיר היפה של השבוע! ${names.join(' ו')} עם ${count} קולות כל אחד/ת. +${voteBonus} דינרים לכל אחד/ת`
      : `🏆 העיר היפה של השבוע: ${names[0]} עם ${count} קולות! +${voteBonus} דינרים`, winnerIds[0]);
    return { winner: names.join(', '), count, tie: winnerIds.length > 1 };
  }

  // ---------- passive income ----------
  // Pays every active player 2% (configurable) of what they paid for each component they own,
  // multiplied by the component's level. Burning components (open incident) pay nothing.
  // Idempotent per date, so the background job and the admin button can't pay twice.
  const runPayout = (date = today()) => withLock('payout', () => runPayoutNow(date));
  async function runPayoutNow(date) {
    const paid = await getMeta('payouts', []);
    if (paid.includes(date)) return { already: true, total: 0 };
    const { incomeRate } = await getSettings();
    const burning = await burningSet();
    const players = (await db.find('players')).filter((p) => p.active !== false);
    let total = 0;
    for (const p of players) {
      const w = await wallet(p.id);
      const income = w.owned
        .filter((c) => !burning.has(c))
        .reduce((s, c) => s + Math.floor(w.paid[c] * incomeRate * LEVEL_INCOME_MULT[w.levels[c] || 1]), 0);
      if (income <= 0) continue;
      try {
        await db.insertOne('bonuses', { id: `${date}:${p.id}:income`, date, at: nowIso(), playerId: p.id, kind: 'income', points: income });
        total += income;
      } catch (e) {
        if (e.code !== 'DUPLICATE') throw e;
      }
    }
    await setMeta('payouts', [...paid.slice(-90), date]);
    if (total > 0) await addEvent('income', `💸 ההכנסה היומית מהרכיבים חולקה: ${total.toLocaleString()} דינרים לכל העיר`);
    return { total };
  }

  // Runs every minute: bet expiry, the daily payout on work days, and closing the weekly vote.
  // It also catches up on what a stopped server missed (an update or a crash at 18:00):
  // unpaid work days of the last week, and earlier weeks whose vote was never closed.
  async function tick() {
    const s = await getSettings();
    const date = today();
    await duels.expireStale(); // unanswered bet invitations get their stake back at the lock time

    // Days before the server first ran are never "missed".
    let since = await getMeta('gameStart', null);
    if (!since) { since = date; await setMeta('gameStart', date); }
    const paid = await getMeta('payouts', []);
    for (let back = CATCH_UP_DAYS; back >= 1; back -= 1) {
      const day = addDays(date, -back);
      if (day >= since && isWorkDay(day, s.workDays) && !paid.includes(day)) await runPayout(day);
    }
    const week = weekKey(date);
    const closed = await getMeta('votesClosed', []);
    const openPastWeeks = [...new Set((await db.find('votes')).map((v) => v.week))].filter((w) => w < week && !closed.includes(w));
    for (const w of openPastWeeks.sort()) await closeVote(w);

    const afterPayout = time() >= s.payoutTime;
    if (afterPayout && isWorkDay(date, s.workDays)) await runPayout(date);
    // This week's vote closes on the vote day's evening, or later in the week if the server was down then.
    if ((weekday(date) === s.voteDay && afterPayout) || weekday(date) > s.voteDay) await closeVote(week);
  }

  // ---------- shared views ----------
  async function cityOf(player) {
    const w = await wallet(player.id);
    return {
      player: publicPlayer(player),
      owned: w.owned,
      value: w.value,
      levels: w.levels,
      profile: profileOf(player),
      decorations: await decorationsOf(player.id),
      burning: [...(await burningSet())],
    };
  }

  function playerBadges(player, bonuses, badgeCtx) {
    const profile = profileOf(player);
    return { titles: titlesFor(player, bonuses, badgeCtx), frame: profile.frame, cityName: profile.cityName };
  }

  async function meExtras(player) {
    const s = await getSettings();
    const [spends, bonuses, badgeCtx] = await Promise.all([
      db.find('spend', { playerId: player.id }), db.find('bonuses', { playerId: player.id }), badgeContext(),
    ]);
    return {
      profile: profileOf(player),
      unlocked: [...ownedUnlockables(spends)],
      decorations: await decorationsOf(player.id),
      mining: await miningStatus(player),
      incidents: await incidentsView(),
      titles: titlesFor(player, bonuses, badgeCtx),
      vote: await voteState(player),
      rules: { earlyTime: s.earlyTime, earlyBonus: s.earlyBonus, incomeRate: s.incomeRate, payoutTime: s.payoutTime },
      catalog: catalog(),
    };
  }

  async function incidentsView() {
    const arch = await getArchitecture();
    const nameOf = Object.fromEntries(arch.nodes.map((n) => [n.id, n.data.name]));
    return (await openIncidents()).map((i) => ({ ...i, componentNames: i.componentIds.map((c) => nameOf[c] || c) }));
  }

  async function getTvToken() {
    if (process.env.TV_TOKEN) return process.env.TV_TOKEN;
    let token = await getMeta('tvToken', null);
    if (!token) {
      token = newToken();
      await setMeta('tvToken', token);
    }
    return token;
  }

  async function adminExtras() {
    return {
      tvToken: await getTvToken(),
      pendingBillboards: (await db.find('billboards', { status: 'pending' })).length,
      openIncidents: (await openIncidents()).length,
    };
  }

  // ---------- routes ----------
  function register({ app, admin, play }) {
    // ===== mining =====
    // One global queue for mining, so "first miner of the day" is decided exactly once.
    play.post('/mine', wrap((req, res) => withLock('mine', () => mine(req, res))));

    async function mine(req, res) {
      const s = await getSettings();
      const date = today();
      const t = time();
      if (!isWorkDay(date, s.workDays)) throw fail(400, 'היום המכרה סגור. נתראה ביום עבודה ⛏️');
      if (t < s.mineOpen) throw fail(400, `המכרה נפתח ב-${s.mineOpen}`);
      if (t >= s.mineClose) throw fail(400, `המכרה נסגר ב-${s.mineClose}. חזור מחר ב-${s.mineOpen}`);
      const status = await miningStatus(req.player);
      if (status.minedToday) throw fail(400, 'כבר כרית היום');

      const first = status.minersToday === 0;
      const gold = Math.random() < GOLD_CHANCE;
      const base = gold ? GOLD_NUGGET : status.nextAmount;
      const amount = base + (first ? FIRST_MINER_BONUS : 0);
      const streak = status.streak + 1;
      try {
        await db.insertOne('bonuses', {
          id: `${date}:${req.player.id}:mine`, date, at: nowIso(), time: t, playerId: req.player.id,
          kind: 'mine', points: amount, gold, first, streak,
        });
      } catch (e) {
        if (e.code === 'DUPLICATE') throw fail(400, 'כבר כרית היום');
        throw e;
      }
      if (first) await addEvent('mine', `⛏️ ${req.player.name} פתח/ה את המכרה ב-${t}`, req.player.id);
      if (gold) await addEvent('gold', `💎 ${req.player.name} מצא/ה גוש זהב במכרה! +${GOLD_NUGGET} דינרים`, req.player.id);
      res.json({ amount, gold, first, streak });
    }

    // ===== upgrades =====
    play.post('/upgrade', wrap(async (req, res) => {
      const { componentId } = req.body;
      const w = await wallet(req.player.id);
      if (!w.owned.includes(componentId)) throw fail(400, 'אפשר לשדרג רק רכיב שלך');
      const level = w.levels[componentId] || 1;
      if (level >= 3) throw fail(400, 'הרכיב כבר ברמה המקסימלית');
      const nextLevel = level + 1;
      const price = w.paid[componentId] * UPGRADE_COST_MULT[nextLevel];
      await charge(req.player, {
        kind: 'upgrade', ref: componentId, price, id: `${req.player.id}:${componentId}:L${nextLevel}`, extra: { level: nextLevel },
      });
      const arch = await getArchitecture();
      const name = arch.nodes.find((n) => n.id === componentId)?.data.name || componentId;
      await addEvent('upgrade', `⬆️ ${req.player.name} שדרג/ה את "${name}" לרמה ${nextLevel}`, req.player.id);
      res.json({ ok: true, level: nextLevel });
    }));

    // ===== cosmetics =====
    play.post('/cosmetics/buy', wrap(async (req, res) => {
      const { key } = req.body;
      const item = UNLOCKABLES[key];
      if (!item) throw fail(404, 'פריט לא נמצא');
      if (!item.price) throw fail(400, 'הפריט הזה בחינם');
      await charge(req.player, { kind: 'cosmetic', ref: key, price: item.price, id: `${req.player.id}:cos:${key}` });
      // Buying something equips it right away.
      const [group, id] = key.split(':');
      if (id) await db.updateOne('players', { id: req.player.id }, { profile: { ...profileOf(req.player), [group]: id } });
      res.json({ ok: true });
    }));

    play.post('/profile', wrap(async (req, res) => {
      const spends = await db.find('spend', { playerId: req.player.id });
      const unlocked = ownedUnlockables(spends);
      const next = profileOf(req.player);
      for (const group of ['theme', 'particle', 'celebration', 'frame']) {
        if (!(group in req.body)) continue;
        const key = `${group}:${req.body[group]}`;
        const item = UNLOCKABLES[key];
        if (!item) throw fail(400, 'פריט לא קיים');
        if (item.price && !unlocked.has(key)) throw fail(400, `עוד לא קנית את "${item.label}"`);
        next[group] = req.body[group];
      }
      for (const [field, max] of [['cityName', 30], ['motto', 60]]) {
        if (!(field in req.body)) continue;
        if (!unlocked.has('naming')) throw fail(400, 'צריך לקנות קודם "שם ומוטו לעיר"');
        next[field] = String(req.body[field] || '').trim().slice(0, max);
      }
      await db.updateOne('players', { id: req.player.id }, { profile: next });
      res.json(next);
    }));

    // ===== decorations =====
    play.post('/decorations', wrap(async (req, res) => {
      const deco = DECORATIONS.find((d) => d.id === req.body.type);
      if (!deco) throw fail(404, 'קישוט לא נמצא');
      const x = Number(req.body.x);
      const y = Number(req.body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw fail(400, 'מיקום לא תקין');
      if ((await decorationsOf(req.player.id)).length >= MAX_DECORATIONS) throw fail(400, `אפשר עד ${MAX_DECORATIONS} קישוטים בעיר`);
      const id = await charge(req.player, { kind: 'decoration', ref: deco.id, price: deco.price, extra: { x, y } });
      res.json({ id, type: deco.id, x, y });
    }));

    play.patch('/decorations/:id', wrap(async (req, res) => {
      const d = await db.findOne('spend', { id: req.params.id });
      if (!d || d.playerId !== req.player.id || d.kind !== 'decoration') throw fail(404, 'קישוט לא נמצא');
      const x = Number(req.body.x);
      const y = Number(req.body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw fail(400, 'מיקום לא תקין');
      await db.updateOne('spend', { id: d.id }, { x, y });
      res.json({ ok: true });
    }));

    // ===== billboards =====
    play.post('/billboards', wrap(async (req, res) => {
      const text = String(req.body.text || '').trim();
      if (!text) throw fail(400, 'כתוב משהו לשלט');
      if (text.length > BILLBOARD_MAX_CHARS) throw fail(400, `עד ${BILLBOARD_MAX_CHARS} תווים`);
      const id = newId('bb');
      await charge(req.player, { kind: 'billboard', ref: id, price: BILLBOARD_PRICE, id: `${id}:spend` });
      await db.insertOne('billboards', { id, playerId: req.player.id, text, status: 'pending', at: nowIso() });
      res.json({ ok: true, id });
    }));

    play.get('/billboards/mine', wrap(async (req, res) => {
      const list = (await db.find('billboards', { playerId: req.player.id })).sort((a, b) => b.at.localeCompare(a.at));
      res.json(list.slice(0, 10));
    }));

    // ===== weekly vote =====
    play.post('/vote', wrap(async (req, res) => {
      const state = await voteState(req.player);
      if (!state.open) throw fail(400, 'ההצבעה לעיר היפה פתוחה רק ביום ההצבעה');
      const target = await db.findOne('players', { id: req.body.targetId });
      if (!target || target.active === false) throw fail(404, 'שחקן לא נמצא');
      if (target.id === req.player.id) throw fail(400, 'אי אפשר להצביע לעצמך');
      await db.updateOne('votes', { id: `${state.week}:${req.player.id}` }, {
        week: state.week, voter: req.player.id, target: target.id, at: nowIso(),
      }, { upsert: true });
      res.json({ ok: true });
    }));

    // ===== admin: incidents =====
    admin.get('/incidents', wrap(async (req, res) => {
      const arch = await getArchitecture();
      const nameOf = Object.fromEntries(arch.nodes.map((n) => [n.id, n.data.name]));
      const list = (await db.find('incidents')).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
      res.json(list.map((i) => ({ ...i, componentNames: i.componentIds.map((c) => nameOf[c] || c) })));
    }));

    admin.post('/incidents', wrap(async (req, res) => {
      const arch = await getArchitecture();
      const ids = (req.body.componentIds || []).filter((c) => arch.nodes.some((n) => n.id === c));
      const description = String(req.body.description || '').trim();
      if (!ids.length) throw fail(400, 'בחר לפחות רכיב אחד');
      if (!description) throw fail(400, 'כתוב תיאור קצר של התקלה');
      const incident = { id: newId('inc'), componentIds: ids, description, status: 'open', openedAt: nowIso() };
      await db.insertOne('incidents', incident);
      const names = ids.map((c) => arch.nodes.find((n) => n.id === c).data.name).join(', ');
      await addEvent('incident', `🚨 תקלה ב${names}: ${description}`, null, { incidentId: incident.id });
      res.json(incident);
    }));

    admin.post('/incidents/:id/resolve', wrap(async (req, res) => {
      const incident = await db.findOne('incidents', { id: req.params.id });
      if (!incident || incident.status !== 'open') throw fail(404, 'תקלה פתוחה לא נמצאה');
      const s = await getSettings();
      const handler = req.body.handlerId ? await db.findOne('players', { id: req.body.handlerId }) : null;
      const bonus = handler ? Number(req.body.bonus ?? s.incidentBonus) : 0;
      if (handler && (!Number.isInteger(bonus) || bonus < 0 || bonus > 10000)) throw fail(400, 'בונוס לא תקין');
      await db.updateOne('incidents', { id: incident.id }, {
        status: 'closed', closedAt: nowIso(), handlerId: handler?.id || null, bonus,
      });
      if (handler && bonus > 0) {
        await db.insertOne('bonuses', {
          id: `${incident.id}:handler`, date: today(), at: nowIso(), playerId: handler.id, kind: 'incident', points: bonus, reason: incident.description,
        });
      }
      const arch = await getArchitecture();
      const names = incident.componentIds.map((c) => arch.nodes.find((n) => n.id === c)?.data.name || c).join(', ');
      await addEvent('incident-resolved', handler
        ? `✅ התקלה ב${names} טופלה על ידי ${handler.name} 🧯 +${bonus} דינרים`
        : `✅ התקלה ב${names} טופלה`, handler?.id || null);
      res.json({ ok: true });
    }));

    // ===== admin: billboards =====
    admin.get('/billboards', wrap(async (req, res) => {
      const players = Object.fromEntries((await db.find('players')).map((p) => [p.id, p]));
      const list = (await db.find('billboards')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
      res.json(list.map((b) => ({ ...b, playerName: players[b.playerId]?.name, playerPhoto: photoOf(players[b.playerId]) })));
    }));

    // Approve and reject take turns, so a quick double click can't both show and refund a billboard.
    admin.post('/billboards/:id/approve', wrap((req, res) => withLock('billboards', async () => {
      const bb = await db.findOne('billboards', { id: req.params.id });
      if (!bb || bb.status !== 'pending') throw fail(404, 'שלט ממתין לא נמצא');
      await db.updateOne('billboards', { id: bb.id }, { status: 'approved', date: today(), decidedAt: nowIso() });
      const p = await db.findOne('players', { id: bb.playerId });
      await addEvent('billboard', `📺 שלט חדש של ${p?.name} על מסך הטלוויזיה`, bb.playerId);
      res.json({ ok: true });
    })));

    // Rejecting refunds the player: the spend record is removed, and balances are derived.
    admin.post('/billboards/:id/reject', wrap((req, res) => withLock('billboards', async () => {
      const bb = await db.findOne('billboards', { id: req.params.id });
      if (!bb || bb.status !== 'pending') throw fail(404, 'שלט ממתין לא נמצא');
      await db.updateOne('billboards', { id: bb.id }, { status: 'rejected', decidedAt: nowIso() });
      await db.deleteMany('spend', { id: `${bb.id}:spend` });
      res.json({ ok: true });
    })));

    // ===== admin: TV announcements =====
    // Free messages from the admin ("Congrats to Hani!"). They run in the TV ticker;
    // featured ones also get a big slide of their own. "today" ones expire at midnight.
    admin.get('/announcements', wrap(async (req, res) => {
      const list = (await db.find('announcements')).sort((a, b) => b.at.localeCompare(a.at));
      res.json(list.map((a) => ({ ...a, active: isActive(a) })));
    }));

    admin.post('/announcements', wrap(async (req, res) => {
      const text = String(req.body.text || '').trim();
      if (!text) throw fail(400, 'כתוב את ההודעה');
      if (text.length > ANNOUNCEMENT_MAX_CHARS) throw fail(400, `עד ${ANNOUNCEMENT_MAX_CHARS} תווים`);
      const a = {
        id: newId('an'), text, featured: Boolean(req.body.featured),
        until: req.body.duration === 'forever' ? null : today(), at: nowIso(),
      };
      await db.insertOne('announcements', a);
      res.json(a);
    }));

    admin.patch('/announcements/:id', wrap(async (req, res) => {
      const a = await db.findOne('announcements', { id: req.params.id });
      if (!a) throw fail(404, 'הודעה לא נמצאה');
      const patch = {};
      if ('featured' in req.body) patch.featured = Boolean(req.body.featured);
      await db.updateOne('announcements', { id: a.id }, patch);
      res.json({ ...a, ...patch });
    }));

    admin.delete('/announcements/:id', wrap(async (req, res) => {
      await db.deleteMany('announcements', { id: req.params.id });
      res.json({ ok: true });
    }));

    // ===== admin: "did you know?" facts for the TV =====
    admin.get('/facts', wrap(async (req, res) => {
      res.json((await db.find('facts')).sort((a, b) => b.at.localeCompare(a.at)));
    }));

    admin.post('/facts', wrap(async (req, res) => {
      const text = String(req.body.text || '').trim();
      if (!text) throw fail(400, 'כתוב את העובדה');
      if (text.length > FACT_MAX_CHARS) throw fail(400, `עד ${FACT_MAX_CHARS} תווים`);
      const fact = { id: newId('fa'), text, at: nowIso() };
      await db.insertOne('facts', fact);
      res.json(fact);
    }));

    admin.delete('/facts/:id', wrap(async (req, res) => {
      await db.deleteMany('facts', { id: req.params.id });
      res.json({ ok: true });
    }));

    // ===== admin: payout, vote, TV =====
    admin.post('/payout', wrap(async (req, res) => {
      const { workDays } = await getSettings();
      if (!isWorkDay(today(), workDays)) throw fail(400, 'היום הוא לא יום עבודה, אין הכנסה יומית');
      res.json(await runPayout(today()));
    }));
    admin.post('/vote/close', wrap(async (req, res) => {
      const { voteDay } = await getSettings();
      if (weekday(today()) < voteDay) throw fail(400, 'ההצבעה של השבוע עוד לא נפתחה. אפשר לסגור אותה רק מיום ההצבעה והלאה');
      res.json(await closeVote(weekKey(today())));
    }));
    admin.post('/tv/reset', wrap(async (req, res) => {
      if (process.env.TV_TOKEN) throw fail(400, 'קוד הטלוויזיה מוגדר בקובץ .env (TV_TOKEN) ואפשר לשנות אותו רק שם');
      await setMeta('tvToken', newToken());
      res.json({ tvToken: await getTvToken() });
    }));

    // ===== TV screen (read-only, its own code) =====
    const tv = express.Router();
    const tvGuard = createCodeGuard('קוד טלוויזיה לא תקין'); // same limits as the admin code
    tv.use((req, res, next) => {
      getTvToken().then((token) => tvGuard(req, res, next, token, 'x-tv-token')).catch(next);
    });
    tv.get('/state', wrap(async (req, res) => {
      const board = await leaderboard();
      const leaderRow = board.rows.find((r) => r.value > 0);
      const leader = leaderRow ? await cityOf(await db.findOne('players', { id: leaderRow.id })) : null;
      const date = today();
      const players = Object.fromEntries((await db.find('players')).map((p) => [p.id, p]));
      const face = (id) => ({ id, name: players[id]?.name, photo: photoOf(players[id]) });
      const active = Object.values(players).filter((p) => p.active !== false);

      const questions = (await db.find('questions', { date })).sort((a, b) => a.order - b.order);
      const qs = [];
      const openLocks = [];
      const guessedOpen = new Map(active.map((p) => [p.id, 0]));
      let openCount = 0;
      for (const q of questions) {
        const guesses = await db.find('guesses', { questionId: q.id });
        const locked = await ctx.isLocked(q);
        const lockAt = await ctx.lockAtFor(q);
        const kind = q.kind || 'number';
        if (!locked) {
          openCount += 1;
          openLocks.push(lockAt);
          guesses.forEach((g) => { if (guessedOpen.has(g.playerId)) guessedOpen.set(g.playerId, guessedOpen.get(g.playerId) + 1); });
        }
        qs.push({
          id: q.id, text: q.text, unit: q.unit, kind, resolved: q.resolved, answer: q.resolved ? q.answer : null,
          lockTime: lockAt.slice(11), locked, guessCount: guesses.length,
          // Only after the lock, so the screen never helps anyone "go against the crowd".
          split: locked && kind === 'yesno'
            ? { yes: guesses.filter((g) => g.value === 1).length, no: guesses.filter((g) => g.value === 0).length }
            : null,
          // The results ceremony: who nailed it.
          winners: q.resolved
            ? guesses.filter((g) => (kind === 'yesno' ? g.value === q.answer : g.closest))
              .map((g) => ({ ...face(g.playerId), value: g.value }))
            : [],
          // Everyone's guess, for the ceremony's number line (only once the answer is public).
          guesses: q.resolved
            ? guesses.map((g) => ({ ...face(g.playerId), value: g.value, points: (g.points || 0) + (g.bonus || 0) }))
            : [],
        });
      }

      // The results ceremony shows the most recently published day. That is usually today, but
      // when yesterday's answers are entered this morning, the ceremony shows yesterday's.
      const lastResults = (await db.find('events', { type: 'results' })).sort((a, b) => b.at.localeCompare(a.at))[0];
      const revealDate = lastResults?.date || date;
      let revealQuestions = qs.filter((q) => q.resolved);
      if (revealDate !== date) {
        revealQuestions = [];
        for (const q of (await db.find('questions', { date: revealDate })).sort((a, b) => a.order - b.order)) {
          if (!q.resolved) continue;
          const kind = q.kind || 'number';
          const guesses = await db.find('guesses', { questionId: q.id });
          revealQuestions.push({
            id: q.id, text: q.text, unit: q.unit, kind, resolved: true, answer: q.answer,
            winners: guesses.filter((g) => (kind === 'yesno' ? g.value === q.answer : g.closest)).map((g) => ({ ...face(g.playerId), value: g.value })),
            guesses: guesses.map((g) => ({ ...face(g.playerId), value: g.value, points: (g.points || 0) + (g.bonus || 0) })),
          });
        }
      }

      // Countdown to the next lock, and who still owes a guess (faces on screen = friendly pressure).
      let countdown = null;
      if (openLocks.length) {
        const next = openLocks.sort()[0];
        const toMinutes = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
        const now = new Date();
        const lockInMs = (toMinutes(next) - toMinutes(nowLocal())) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds();
        countdown = {
          lockTime: next.slice(11),
          lockInMs: next.slice(0, 10) === date ? Math.max(0, lockInMs) : null,
          missing: active.filter((p) => guessedOpen.get(p.id) < openCount).map((p) => face(p.id)),
        };
      }

      // Rank movement since the morning: the first TV request of the day takes a snapshot.
      let snapshot = await getMeta('rankSnapshot', null);
      if (snapshot?.date !== date) {
        snapshot = { date, ranks: Object.fromEntries(board.rows.map((r, i) => [r.id, i + 1])) };
        await setMeta('rankSnapshot', snapshot);
      }
      const rankDelta = Object.fromEntries(board.rows.map((r, i) => [r.id, snapshot.ranks[r.id] ? snapshot.ranks[r.id] - (i + 1) : 0]));

      const billboards = (await db.find('billboards', { status: 'approved', date }))
        .map((b) => ({ id: b.id, text: b.text, name: players[b.playerId]?.name, photo: photoOf(players[b.playerId]) }));
      const feed = (await db.recent('events', 15))
        .map((e) => (e.playerId ? { ...e, name: players[e.playerId]?.name, photo: photoOf(players[e.playerId]) } : e));
      const announcements = (await db.find('announcements')).filter(isActive)
        .sort((a, b) => a.at.localeCompare(b.at))
        .map(({ id, text, featured }) => ({ id, text, featured }));
      const stats = await teamStats(board, players);
      const facts = [
        ...(await db.find('facts')).map(({ id, text }) => ({ id, text })),
        ...stats.autoFacts,
      ];
      res.json({
        now: time(),
        announcements,
        duels: await duels.forTv(),
        board,
        rankDelta,
        architecture: await getArchitecture(),
        leader,
        questions: qs,
        reveal: { date: revealDate, questions: revealQuestions },
        countdown,
        incidents: await incidentsView(),
        billboards,
        feed,
        facts,
        records: stats.records,
        mining: await mineGeneral(),
      });
    }));
    app.use('/api/tv', tv);
  }

  let timer = null;
  function startJobs() {
    if (timer) return;
    timer = setInterval(() => tick().catch((e) => console.error('season2 job failed:', e)), 60 * 1000);
  }
  function stopJobs() {
    clearInterval(timer);
    timer = null;
  }

  return { register, startJobs, stopJobs, cityOf, playerBadges, badgeContext, meExtras, adminExtras, runPayout, closeVote };
}
