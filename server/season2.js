// Season 2 features, kept apart from the core game (index.js):
// mining, incidents, passive income + upgrades, cosmetics, decorations, pranks,
// billboards, the weekly "most beautiful city" vote, and the office TV screen.
// See docs/season-2.md for the product spec.

import express from 'express';
import {
  BILLBOARD_MAX_CHARS, BILLBOARD_PRICE, DECORATIONS, DEFAULT_PROFILE, LEVEL_INCOME_MULT, MAX_PRANKS_PER_DAY,
  PRANK_HOURS, PRANK_REMOVE_PRICE, PRANKS, UMBRELLA_PRICE, UNLOCKABLES, UPGRADE_COST_MULT, catalog,
} from './catalog.js';
import { addDays, isWorkDay, streakBefore, weekKey, weekday } from './calendar.js';

const FIRST_MINER_BONUS = 20;
const GOLD_NUGGET = 250;
const GOLD_CHANCE = 0.05;
const MINE_STREAK_STEP = 5;
const MAX_DECORATIONS = 30;
const EARLY_BIRD_TITLE_AT = 10;
const MINER_TITLE_STREAK = 5;

export function createSeason2(ctx) {
  const {
    db, newId, newToken, nowLocal, today, getMeta, setMeta, getSettings, getArchitecture,
    addEvent, wallet, wrap, fail, publicPlayer, leaderboard,
  } = ctx;

  const nowIso = () => new Date().toISOString();
  const time = () => nowLocal().slice(11);

  // ---------- spending ----------
  // Charges the player for a non-component item. A fixed id makes one-off items
  // (a theme, today's umbrella) impossible to buy twice even with a double click.
  async function charge(player, { kind, ref = '', price, id = newId('s'), extra = {} }) {
    const w = await wallet(player.id);
    if (w.balance < price) throw fail(400, `חסרים לך ${price - w.balance} דינרים`);
    try {
      await db.insertOne('spend', { id, playerId: player.id, kind, ref, price, date: today(), at: nowIso(), ...extra });
    } catch (e) {
      if (e.code === 'DUPLICATE') throw fail(400, 'כבר קנית את זה');
      throw e;
    }
    return id;
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

  // ---------- pranks ----------
  async function activePrankOn(playerId) {
    const now = nowIso();
    return (await db.find('pranks', { target: playerId })).find((p) => !p.removed && p.until > now) || null;
  }
  const umbrellaId = (playerId, date = today()) => `${playerId}:${date}:umbrella`;

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
      firstMiner = { name: p?.name, photo: p?.photo, time: mines[0].time };
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

  // ---------- titles ----------
  async function titlesFor(player) {
    const bonuses = await db.find('bonuses', { playerId: player.id });
    const s = await getSettings();
    const titles = [];
    if (bonuses.some((b) => b.kind === 'incident')) titles.push({ id: 'firefighter', label: '🧯 כבאי' });
    if (bonuses.filter((b) => b.kind === 'early').length >= EARLY_BIRD_TITLE_AT) titles.push({ id: 'earlybird', label: '🐦 ציפור מוקדמת' });
    const mineDates = new Set(bonuses.filter((b) => b.kind === 'mine').map((b) => b.date));
    const streak = streakBefore(today(), mineDates, s.workDays) + (mineDates.has(today()) ? 1 : 0);
    if (streak >= MINER_TITLE_STREAK) titles.push({ id: 'miner', label: '⛏️ כורה מתמיד' });
    const winner = await getMeta('beautyWinner', null);
    if (winner?.playerId === player.id && today() < addDays(winner.date, 7)) titles.push({ id: 'beauty', label: '🏆 העיר היפה' });
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

  async function closeVote(week) {
    const closedWeeks = await getMeta('votesClosed', []);
    if (closedWeeks.includes(week)) return { already: true };
    const votes = await db.find('votes', { week });
    await setMeta('votesClosed', [...closedWeeks.slice(-52), week]);
    if (!votes.length) return { winner: null };
    const tally = {};
    votes.sort((a, b) => a.at.localeCompare(b.at)).forEach((v) => { tally[v.target] = (tally[v.target] || 0) + 1; });
    const [winnerId, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const winner = await db.findOne('players', { id: winnerId });
    const { voteBonus } = await getSettings();
    await db.insertOne('bonuses', { id: `${week}:vote`, date: today(), at: nowIso(), playerId: winnerId, kind: 'vote', points: voteBonus });
    await setMeta('beautyWinner', { playerId: winnerId, week, date: today() });
    await addEvent('vote', `🏆 העיר היפה של השבוע: ${winner?.name} עם ${count} קולות! +${voteBonus} דינרים`, winnerId);
    return { winner: winner?.name, count };
  }

  // ---------- passive income ----------
  // Pays every active player 2% (configurable) of what they paid for each component they own,
  // multiplied by the component's level. Burning components (open incident) pay nothing.
  // Idempotent per date, so the background job and the admin button can't pay twice.
  async function runPayout(date = today()) {
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

  // Runs every minute: daily payout on work days, and closing the weekly vote.
  async function tick() {
    const s = await getSettings();
    const date = today();
    if (time() < s.payoutTime) return;
    if (isWorkDay(date, s.workDays)) await runPayout(date);
    if (weekday(date) === s.voteDay) await closeVote(weekKey(date));
  }

  // ---------- shared views ----------
  async function cityOf(player) {
    const w = await wallet(player.id);
    const prank = await activePrankOn(player.id);
    return {
      player: publicPlayer(player),
      owned: w.owned,
      value: w.value,
      levels: w.levels,
      profile: profileOf(player),
      decorations: await decorationsOf(player.id),
      prank: prank?.type || null,
      burning: [...(await burningSet())],
    };
  }

  async function playerBadges(player) {
    const prank = await activePrankOn(player.id);
    const profile = profileOf(player);
    return { titles: await titlesFor(player), prank: prank?.type || null, frame: profile.frame, cityName: profile.cityName };
  }

  async function meExtras(player) {
    const s = await getSettings();
    const prank = await activePrankOn(player.id);
    const pranksToday = (await db.find('pranks', { by: player.id, date: today() })).length;
    const spends = await db.find('spend', { playerId: player.id });
    return {
      profile: profileOf(player),
      unlocked: [...ownedUnlockables(spends)],
      decorations: await decorationsOf(player.id),
      mining: await miningStatus(player),
      incidents: await incidentsView(),
      prank: prank ? { type: prank.type, until: prank.until } : null,
      umbrella: Boolean(await db.findOne('spend', { id: umbrellaId(player.id) })),
      pranksToday,
      titles: await titlesFor(player),
      vote: await voteState(player),
      rules: { earlyTime: s.earlyTime, earlyBonus: s.earlyBonus, pranksEnabled: s.pranksEnabled, incomeRate: s.incomeRate, payoutTime: s.payoutTime },
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
    play.post('/mine', wrap(async (req, res) => {
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
    }));

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

    // ===== pranks =====
    play.post('/pranks', wrap(async (req, res) => {
      const s = await getSettings();
      if (!s.pranksEnabled) throw fail(400, 'המתיחות כבויות כרגע');
      const prank = PRANKS.find((p) => p.id === req.body.type);
      if (!prank) throw fail(404, 'מתיחה לא נמצאה');
      const target = await db.findOne('players', { id: req.body.targetId });
      if (!target || target.active === false) throw fail(404, 'שחקן לא נמצא');
      if (target.id === req.player.id) throw fail(400, 'אי אפשר למתוח את עצמך 😄');
      if (await db.findOne('spend', { id: umbrellaId(target.id) })) throw fail(400, `${target.name} פתח/ה מטריה היום ☂️`);
      if (await activePrankOn(target.id)) throw fail(400, `על ${target.name} כבר יש מתיחה פעילה`);
      const mineToday = await db.find('pranks', { by: req.player.id, date: today() });
      if (mineToday.length >= MAX_PRANKS_PER_DAY) throw fail(400, `אפשר עד ${MAX_PRANKS_PER_DAY} מתיחות ביום`);

      const id = newId('pr');
      await charge(req.player, { kind: 'prank', ref: prank.id, price: prank.price, extra: { prankId: id, target: target.id } });
      await db.insertOne('pranks', {
        id, by: req.player.id, target: target.id, type: prank.id, date: today(), at: nowIso(),
        until: new Date(Date.now() + PRANK_HOURS * 3600000).toISOString(), removed: false,
      });
      // The feed stays anonymous; the admin sees who did it in the prank log.
      await addEvent('prank', `${prank.emoji} מישהו ${prank.verb}${target.name}`, null, { prankId: id });
      res.json({ ok: true });
    }));

    play.post('/pranks/remove', wrap(async (req, res) => {
      const prank = await activePrankOn(req.player.id);
      if (!prank) throw fail(400, 'אין עליך מתיחה פעילה');
      await charge(req.player, { kind: 'prank-remove', ref: prank.id, price: PRANK_REMOVE_PRICE });
      await db.updateOne('pranks', { id: prank.id }, { removed: true, removedAt: nowIso() });
      res.json({ ok: true });
    }));

    play.post('/umbrella', wrap(async (req, res) => {
      await charge(req.player, { kind: 'umbrella', price: UMBRELLA_PRICE, id: umbrellaId(req.player.id) });
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
      res.json(list.map((b) => ({ ...b, playerName: players[b.playerId]?.name, playerPhoto: players[b.playerId]?.photo })));
    }));

    admin.post('/billboards/:id/approve', wrap(async (req, res) => {
      const bb = await db.findOne('billboards', { id: req.params.id });
      if (!bb || bb.status !== 'pending') throw fail(404, 'שלט ממתין לא נמצא');
      await db.updateOne('billboards', { id: bb.id }, { status: 'approved', date: today(), decidedAt: nowIso() });
      const p = await db.findOne('players', { id: bb.playerId });
      await addEvent('billboard', `📺 שלט חדש של ${p?.name} על מסך הטלוויזיה`, bb.playerId);
      res.json({ ok: true });
    }));

    // Rejecting refunds the player: the spend record is removed, and balances are derived.
    admin.post('/billboards/:id/reject', wrap(async (req, res) => {
      const bb = await db.findOne('billboards', { id: req.params.id });
      if (!bb || bb.status !== 'pending') throw fail(404, 'שלט ממתין לא נמצא');
      await db.updateOne('billboards', { id: bb.id }, { status: 'rejected', decidedAt: nowIso() });
      await db.deleteMany('spend', { id: `${bb.id}:spend` });
      res.json({ ok: true });
    }));

    // ===== admin: pranks log, payout, vote, TV =====
    admin.get('/pranks', wrap(async (req, res) => {
      const players = Object.fromEntries((await db.find('players')).map((p) => [p.id, p.name]));
      const list = (await db.find('pranks')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
      res.json(list.map((p) => ({ ...p, byName: players[p.by], targetName: players[p.target] })));
    }));

    admin.post('/payout', wrap(async (req, res) => res.json(await runPayout(today()))));
    admin.post('/vote/close', wrap(async (req, res) => res.json(await closeVote(weekKey(today())))));
    admin.post('/tv/reset', wrap(async (req, res) => {
      if (process.env.TV_TOKEN) throw fail(400, 'קוד הטלוויזיה מוגדר בקובץ .env (TV_TOKEN) ואפשר לשנות אותו רק שם');
      await setMeta('tvToken', newToken());
      res.json({ tvToken: await getTvToken() });
    }));

    // ===== TV screen (read-only, its own code) =====
    const tv = express.Router();
    tv.use((req, res, next) => {
      getTvToken()
        .then((token) => (req.get('x-tv-token') === token ? next() : res.status(401).json({ error: 'קוד טלוויזיה לא תקין' })))
        .catch(next);
    });
    tv.get('/state', wrap(async (req, res) => {
      const board = await leaderboard();
      const leaderRow = board.rows.find((r) => r.value > 0);
      const leader = leaderRow ? await cityOf(await db.findOne('players', { id: leaderRow.id })) : null;
      const date = today();
      const questions = (await db.find('questions', { date })).sort((a, b) => a.order - b.order);
      const qs = [];
      for (const q of questions) {
        qs.push({
          id: q.id, text: q.text, unit: q.unit, resolved: q.resolved, answer: q.resolved ? q.answer : null,
          lockTime: (await ctx.lockAtFor(q)).slice(11), locked: await ctx.isLocked(q),
          guessCount: (await db.find('guesses', { questionId: q.id })).length,
        });
      }
      const players = Object.fromEntries((await db.find('players')).map((p) => [p.id, p]));
      const billboards = (await db.find('billboards', { status: 'approved', date }))
        .map((b) => ({ id: b.id, text: b.text, name: players[b.playerId]?.name, photo: players[b.playerId]?.photo }));
      const feed = (await db.find('events')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
      res.json({
        now: time(),
        board,
        architecture: await getArchitecture(),
        leader,
        questions: qs,
        incidents: await incidentsView(),
        billboards,
        feed,
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

  return { register, startJobs, cityOf, playerBadges, meExtras, adminExtras, runPayout, closeVote };
}
