import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createStore } from './store.js';
import { createSeason2 } from './season2.js';
import { perfectDayPlayers, scoreQuestion, PERFECT_DAY_BONUS } from './scoring.js';
import { sampleArchitecture } from '../src/model.js';
import { autoLayout } from '../src/layout.js';

const PORT = Number(process.env.PORT) || 3001;
const TZ = process.env.GAME_TZ || 'Asia/Jerusalem';
const MAX_QUESTIONS_PER_DAY = 5;

const db = await createStore();
const app = express();
app.use(express.json({ limit: '3mb' }));

// ---------- helpers ----------
const newId = (p) => `${p}-${crypto.randomBytes(5).toString('hex')}`;
const newToken = () => crypto.randomBytes(16).toString('base64url');

// "YYYY-MM-DD HH:MM" in the game's timezone; string comparison works on this format.
function nowLocal(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60000).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);
}
const LATE_QUESTION_MINUTES = 60;
const today = () => nowLocal().slice(0, 10);

async function getMeta(id, fallback) {
  const doc = await db.findOne('meta', { id });
  return doc ? doc.value : fallback;
}
const setMeta = (id, value) => db.updateOne('meta', { id }, { value }, { upsert: true });

const DEFAULT_SETTINGS = {
  lockTime: '10:30',
  // Season 2
  earlyTime: '10:00',
  earlyBonus: 10,
  mineOpen: '07:00',
  mineClose: '09:45',
  mineBase: 50,
  workDays: [0, 1, 2, 3, 4], // Sunday..Thursday
  incomeRate: 0.02,
  payoutTime: '18:00',
  incidentBonus: 200,
  voteDay: 4, // Thursday
  voteBonus: 300,
};

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await getMeta('settings', {})) };
}

async function getArchitecture() {
  let arch = await getMeta('architecture', null);
  if (!arch) {
    const s = sampleArchitecture();
    arch = { ...s, nodes: autoLayout(s.nodes, s.edges) };
    await setMeta('architecture', arch);
  }
  return arch;
}

// Each question keeps the lock moment it was created with, so changing the lock time
// in settings never reopens a question whose guesses were already revealed.
async function lockAtFor(q) {
  if (q.lockAt) return q.lockAt;
  const { lockTime } = await getSettings();
  return `${q.date} ${lockTime}`;
}

async function isLocked(q) {
  return Boolean(q.resolved) || nowLocal() >= (await lockAtFor(q));
}

// A question added after today's lock time still gets a fair window to guess.
async function newLockAt(date) {
  const { lockTime } = await getSettings();
  const regular = `${date} ${lockTime}`;
  if (date === today() && nowLocal() >= regular) return { lockAt: nowLocal(LATE_QUESTION_MINUTES), late: true };
  return { lockAt: regular, late: false };
}

async function addEvent(type, text, playerId = null, extra = {}) {
  await db.insertOne('events', { id: newId('ev'), at: new Date().toISOString(), type, text, playerId, ...extra });
}

const publicPlayer = ({ token, ...p }) => p;

// Balance is derived (earned - spent), so re-scoring a day never double-counts.
// Spending is split in two: components (purchases) and everything else (the "spend"
// collection: upgrades, cosmetics, billboards). Only components and their
// upgrades count toward the city's value on the leaderboard.
async function wallet(playerId) {
  const [guesses, bonuses, purchases, spends] = await Promise.all([
    db.find('guesses', { playerId }),
    db.find('bonuses', { playerId }),
    db.find('purchases', { playerId }),
    db.find('spend', { playerId }),
  ]);
  const earned = guesses.reduce((s, g) => s + (g.points || 0) + (g.bonus || 0), 0)
    + bonuses.reduce((s, b) => s + b.points, 0);
  const upgrades = spends.filter((s) => s.kind === 'upgrade');
  const componentSpend = purchases.reduce((s, p) => s + p.price, 0) + upgrades.reduce((s, u) => s + u.price, 0);
  const spent = purchases.reduce((s, p) => s + p.price, 0) + spends.reduce((s, x) => s + x.price, 0);
  const levels = {};
  upgrades.forEach((u) => { levels[u.ref] = Math.max(levels[u.ref] || 1, u.level); });
  return {
    earned,
    spent,
    balance: earned - spent,
    // City value counts what was actually paid, so later price changes don't move the leaderboard.
    value: componentSpend,
    owned: purchases.map((p) => p.componentId),
    paid: Object.fromEntries(purchases.map((p) => [p.componentId, p.price])),
    levels,
    spends,
  };
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message });
});
const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- auth ----------
let adminToken = process.env.ADMIN_TOKEN || (await getMeta('adminToken', null));
if (!adminToken) {
  adminToken = newToken();
  await setMeta('adminToken', adminToken);
}

if (process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length < 8) {
  console.warn('⚠️  ADMIN_TOKEN is shorter than 8 characters. Choose a longer admin code.');
}

// Wrong admin codes are counted per IP; after MAX_FAILS the IP is locked out for a while,
// so a typed (human-chosen) code can't be brute-forced.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, lockedUntil }

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function requireAdmin(req, res, next) {
  const ip = req.ip;
  const entry = failures.get(ip);
  if (entry?.lockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `יותר מדי ניסיונות שגויים. נסה שוב בעוד ${minutes} דקות` });
  }
  const token = req.get('x-admin-token') || '';
  if (!safeEqual(token, adminToken)) {
    if (token) {
      const expired = entry?.lockedUntil && entry.lockedUntil <= Date.now();
      const count = (expired ? 0 : entry?.count || 0) + 1;
      failures.set(ip, { count, lockedUntil: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    }
    return res.status(401).json({ error: 'אין הרשאת מנהל' });
  }
  failures.delete(ip);
  next();
}

async function requirePlayer(req, res, next) {
  const token = req.get('x-player-token');
  const player = token && (await db.findOne('players', { token }));
  if (!player || player.active === false) return res.status(401).json({ error: 'קישור שחקן לא תקין' });
  req.player = player;
  next();
}

// =============== ROUTERS ===============
const admin = express.Router();
admin.use(requireAdmin);
const play = express.Router();
play.use((req, res, next) => requirePlayer(req, res, next).catch(next));

// Season 2 features (mining, incidents, upgrades, cosmetics, TV...) live in their own module.
const season2 = createSeason2({
  db, newId, newToken, nowLocal, today, getMeta, setMeta, getSettings, getArchitecture,
  addEvent, wallet, wrap, fail, publicPlayer, isLocked, lockAtFor, leaderboard,
});

// =============== ADMIN ===============

async function purchaseCounts() {
  const counts = {};
  (await db.find('purchases')).forEach((p) => { counts[p.componentId] = (counts[p.componentId] || 0) + 1; });
  return counts;
}

admin.get('/state', wrap(async (req, res) => {
  res.json({
    architecture: await getArchitecture(),
    players: await db.find('players'),
    settings: await getSettings(),
    purchaseCounts: await purchaseCounts(),
    today: today(),
    store: db.kind,
    ...(await season2.adminExtras()),
  });
}));

// Saving the architecture. If a component that players bought is gone, their purchase
// is removed, which refunds the price (balances are derived from purchases).
admin.put('/architecture', wrap(async (req, res) => {
  const { domains, nodes, edges } = req.body;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw fail(400, 'ארכיטקטורה לא תקינה');
  const before = await getArchitecture();
  const remaining = new Set(nodes.map((n) => n.id));
  const removed = before.nodes.filter((n) => !remaining.has(n.id));
  let refunded = 0;
  for (const n of removed) {
    const bought = await db.find('purchases', { componentId: n.id });
    if (!bought.length) continue;
    await db.deleteMany('purchases', { componentId: n.id });
    await db.deleteMany('spend', { kind: 'upgrade', ref: n.id });
    refunded += bought.length;
    await addEvent('refund', `🔧 הרכיב "${n.data.name}" הוסר מהארכיטקטורה. ${bought.length} שחקנים קיבלו את הכסף בחזרה`);
  }
  await setMeta('architecture', { domains: domains || [], nodes, edges });
  res.json({ ok: true, refunded, purchaseCounts: await purchaseCounts() });
}));

// Every setting is validated by its kind; unknown keys are ignored.
const TIME_KEYS = ['lockTime', 'earlyTime', 'mineOpen', 'mineClose', 'payoutTime'];
const NUMBER_KEYS = { earlyBonus: [0, 1000], mineBase: [0, 5000], incidentBonus: [0, 10000], voteBonus: [0, 10000], incomeRate: [0, 0.5], voteDay: [0, 6] };

admin.put('/settings', wrap(async (req, res) => {
  const next = { ...(await getSettings()) };
  for (const key of TIME_KEYS) {
    if (!(key in req.body)) continue;
    if (!/^\d{2}:\d{2}$/.test(req.body[key] || '')) throw fail(400, `שעה לא תקינה: ${key}`);
    next[key] = req.body[key];
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_KEYS)) {
    if (!(key in req.body)) continue;
    const v = Number(req.body[key]);
    if (!Number.isFinite(v) || v < min || v > max) throw fail(400, `ערך לא תקין: ${key}`);
    next[key] = v;
  }
  if ('workDays' in req.body) {
    const days = req.body.workDays;
    if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw fail(400, 'ימי עבודה לא תקינים');
    next.workDays = [...new Set(days)].sort();
  }
  if (next.mineOpen >= next.mineClose) throw fail(400, 'שעת פתיחת המכרה חייבת להיות לפני שעת הסגירה');
  await setMeta('settings', next);
  res.json(next);
}));

admin.post('/players', wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) throw fail(400, 'חסר שם');
  const player = { id: newId('p'), name, photo: req.body.photo || '', token: newToken(), active: true, createdAt: new Date().toISOString() };
  await db.insertOne('players', player);
  await addEvent('join', `${name} הצטרף/ה למשחק 👋`, player.id);
  res.json(player);
}));

admin.patch('/players/:id', wrap(async (req, res) => {
  const patch = {};
  for (const k of ['name', 'photo', 'active']) if (k in req.body) patch[k] = req.body[k];
  if (req.body.resetToken) patch.token = newToken();
  await db.updateOne('players', { id: req.params.id }, patch);
  res.json(await db.findOne('players', { id: req.params.id }));
}));

// Manual bonuses: the admin rewards someone for real work (handling an incident, solving a problem).
// They live in the same collection as perfect-day bonuses, so the wallet already counts them.
const MAX_BONUS = 10000;

admin.post('/players/:id/bonus', wrap(async (req, res) => {
  const player = await db.findOne('players', { id: req.params.id });
  if (!player) throw fail(404, 'שחקן לא נמצא');
  const amount = Number(req.body.amount);
  const reason = (req.body.reason || '').trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BONUS) throw fail(400, `סכום הבונוס חייב להיות מספר שלם בין 1 ל-${MAX_BONUS}`);
  if (!reason) throw fail(400, 'צריך לכתוב על מה הבונוס');
  const bonus = {
    id: newId('b'), date: today(), at: new Date().toISOString(), playerId: player.id, kind: 'manual', points: amount, reason,
  };
  await db.insertOne('bonuses', bonus);
  await addEvent('bonus', `🏅 ${player.name} קיבל/ה ${amount} דינרים בונוס על: ${reason}`, player.id, { bonusId: bonus.id });
  res.json(bonus);
}));

admin.get('/bonuses', wrap(async (req, res) => {
  const list = (await db.find('bonuses', { kind: 'manual' })).sort((a, b) => b.at.localeCompare(a.at));
  res.json(list);
}));

// Cancelling a bonus given by mistake; the coins come off the player's balance.
admin.delete('/bonuses/:id', wrap(async (req, res) => {
  const bonus = await db.findOne('bonuses', { id: req.params.id });
  if (!bonus || bonus.kind !== 'manual') throw fail(404, 'בונוס לא נמצא');
  await db.deleteMany('bonuses', { id: bonus.id });
  await db.deleteMany('events', { bonusId: bonus.id });
  res.json({ ok: true, negative: (await wallet(bonus.playerId)).balance < 0 });
}));

admin.delete('/players/:id', wrap(async (req, res) => {
  const playerId = req.params.id;
  for (const c of ['guesses', 'purchases', 'bonuses', 'spend', 'billboards']) await db.deleteMany(c, { playerId });
  await db.deleteMany('votes', { voter: playerId });
  await db.deleteMany('votes', { target: playerId });
  await db.deleteMany('players', { id: playerId });
  res.json({ ok: true });
}));

admin.get('/days', wrap(async (req, res) => {
  const qs = await db.find('questions');
  const days = {};
  qs.forEach((q) => {
    days[q.date] ||= { date: q.date, count: 0, resolved: 0 };
    days[q.date].count++;
    if (q.resolved) days[q.date].resolved++;
  });
  res.json(Object.values(days).sort((a, b) => b.date.localeCompare(a.date)));
}));

admin.get('/questions', wrap(async (req, res) => {
  const date = req.query.date || today();
  const questions = (await db.find('questions', { date })).sort((a, b) => a.order - b.order);
  const guesses = await db.find('guesses', { questionId: { $in: questions.map((q) => q.id) } });
  const out = [];
  for (const q of questions) {
    out.push({
      ...q,
      lockAt: await lockAtFor(q),
      locked: await isLocked(q),
      guesses: guesses.filter((g) => g.questionId === q.id),
    });
  }
  res.json({ date, questions: out });
}));

admin.post('/questions', wrap(async (req, res) => {
  const { date = today(), componentId = '', text, unit = '' } = req.body;
  if (!text?.trim()) throw fail(400, 'חסר טקסט לשאלה');
  if (date < today()) throw fail(400, 'אי אפשר להוסיף שאלה ליום שעבר');
  const existing = await db.find('questions', { date });
  if (existing.length >= MAX_QUESTIONS_PER_DAY) throw fail(400, `מקסימום ${MAX_QUESTIONS_PER_DAY} שאלות ביום`);
  const { lockAt, late } = await newLockAt(date);
  const q = { id: newId('q'), date, componentId, text: text.trim(), unit, order: existing.length, answer: null, resolved: false, lockAt };
  await db.insertOne('questions', q);
  res.json({ ...q, late });
}));

admin.post('/questions/copy', wrap(async (req, res) => {
  const { from, to = today() } = req.body;
  const source = (await db.find('questions', { date: from })).sort((a, b) => a.order - b.order);
  const existing = await db.find('questions', { date: to });
  const room = MAX_QUESTIONS_PER_DAY - existing.length;
  const toCopy = source.slice(0, Math.max(0, room));
  const { lockAt, late } = await newLockAt(to);
  for (const [i, q] of toCopy.entries()) {
    await db.insertOne('questions', {
      id: newId('q'), date: to, componentId: q.componentId, text: q.text, unit: q.unit,
      order: existing.length + i, answer: null, resolved: false, lockAt,
    });
  }
  res.json({ copied: toCopy.length, late });
}));

// Once someone guessed, the question's meaning is frozen; only the unit label may change.
admin.patch('/questions/:id', wrap(async (req, res) => {
  const q = await db.findOne('questions', { id: req.params.id });
  if (!q) throw fail(404, 'שאלה לא נמצאה');
  const guessed = (await db.find('guesses', { questionId: q.id })).length > 0;
  const patch = {};
  for (const k of ['text', 'componentId', 'unit']) if (k in req.body) patch[k] = req.body[k];
  if (guessed && ((patch.text ?? q.text) !== q.text || (patch.componentId ?? q.componentId) !== q.componentId)) {
    throw fail(400, 'כבר ניחשו על השאלה הזו, אז אי אפשר לשנות אותה');
  }
  await db.updateOne('questions', { id: q.id }, patch);
  res.json(await db.findOne('questions', { id: q.id }));
}));

admin.delete('/questions/:id', wrap(async (req, res) => {
  const q = await db.findOne('questions', { id: req.params.id });
  if (q?.resolved) throw fail(400, 'אי אפשר למחוק שאלה שהתוצאות שלה כבר פורסמו: השחקנים כבר קיבלו עליה נקודות');
  await db.deleteMany('guesses', { questionId: req.params.id });
  await db.deleteMany('bonuses', { questionId: req.params.id }); // early-guess bonuses
  await db.deleteMany('questions', { id: req.params.id });
  res.json({ ok: true });
}));

// Save the real answers and score the day. Safe to run again (e.g. to fix a typo).
admin.post('/days/:date/resolve', wrap(async (req, res) => {
  const { date } = req.params;
  const answers = req.body.answers || {};
  const questions = await db.find('questions', { date });
  const players = await db.find('players');
  const nameOf = Object.fromEntries(players.map((p) => [p.id, p.name]));

  for (const q of questions) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') continue;
    const answer = Number(raw);
    if (!Number.isFinite(answer)) throw fail(400, `תשובה לא תקינה לשאלה "${q.text}"`);
    const guesses = await db.find('guesses', { questionId: q.id });
    for (const s of scoreQuestion(guesses, answer)) {
      await db.updateOne('guesses', { id: `${q.id}:${s.playerId}` }, {
        points: s.points, bonus: s.bonus, error: s.error, closest: s.closest, beatCrowd: s.beatCrowd,
      });
    }
    await db.updateOne('questions', { id: q.id }, { answer, resolved: true });
  }

  // Day bonuses only once every question of the day has an answer.
  const updated = await db.find('questions', { date });
  const allResolved = updated.length > 0 && updated.every((q) => q.resolved);
  // Only the computed perfect-day bonuses are rebuilt; manual bonuses from the admin stay.
  await db.deleteMany('bonuses', { date, kind: 'perfect' });
  await db.deleteMany('events', { date, type: { $in: ['perfect', 'results'] } });
  if (allResolved) {
    const scored = [];
    for (const q of updated) {
      scored.push((await db.find('guesses', { questionId: q.id })).map((g) => ({ playerId: g.playerId, error: g.error })));
    }
    for (const pid of perfectDayPlayers(scored)) {
      await db.insertOne('bonuses', { id: `${date}:${pid}:perfect`, date, playerId: pid, kind: 'perfect', points: PERFECT_DAY_BONUS });
      await addEvent('perfect', `🎯 ${nameOf[pid]} עשה/תה יום מושלם! +${PERFECT_DAY_BONUS}`, pid, { date });
    }
    const totals = {};
    for (const q of updated) {
      for (const g of await db.find('guesses', { questionId: q.id })) {
        totals[g.playerId] = (totals[g.playerId] || 0) + (g.points || 0) + (g.bonus || 0);
      }
    }
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    if (top) await addEvent('results', `📊 התוצאות של ${date} פורסמו! ${nameOf[top[0]]} מוביל/ה את היום עם ${top[1]} נקודות 👑`, top[0], { date });
  }

  // A corrected (lower) answer can take back points that were already spent.
  const negative = [];
  for (const p of players) if ((await wallet(p.id)).balance < 0) negative.push(p.name);
  res.json({ ok: true, allResolved, negative });
}));

season2.register({ app, admin, play });
app.use('/api/admin', admin);

// =============== PLAYERS ===============

play.get('/me', wrap(async (req, res) => {
  const { spends, ...w } = await wallet(req.player.id);
  res.json({
    player: publicPlayer(req.player),
    wallet: w,
    today: today(),
    ...(await season2.meExtras(req.player)),
  });
}));

play.get('/architecture', wrap(async (req, res) => res.json(await getArchitecture())));

play.get('/today', wrap(async (req, res) => {
  const date = req.query.date || today();
  const questions = (await db.find('questions', { date })).sort((a, b) => a.order - b.order);
  const guesses = await db.find('guesses', { questionId: { $in: questions.map((q) => q.id) } });
  const players = await db.find('players');
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  const out = [];
  for (const q of questions) {
    const locked = await isLocked(q);
    const mine = guesses.find((g) => g.questionId === q.id && g.playerId === req.player.id);
    const lockTime = (await lockAtFor(q)).slice(11);
    const item = { id: q.id, text: q.text, unit: q.unit, componentId: q.componentId, locked, lockTime, resolved: q.resolved, myGuess: mine || null };
    // Others' guesses stay hidden until the lock, so nobody can copy.
    if (locked) {
      item.guesses = guesses.filter((g) => g.questionId === q.id).map((g) => ({
        playerId: g.playerId, name: byId[g.playerId]?.name, photo: byId[g.playerId]?.photo,
        value: g.value, points: g.points, bonus: g.bonus, closest: g.closest, beatCrowd: g.beatCrowd, early: g.early,
      }));
      item.guessCount = item.guesses.length;
    } else {
      item.guessCount = guesses.filter((g) => g.questionId === q.id).length;
    }
    if (q.resolved) item.answer = q.answer;
    out.push(item);
  }
  const { lockTime, earlyTime, earlyBonus } = await getSettings();
  // Prediction-related bonuses only (perfect day, early guesses); mining and others show elsewhere.
  const dayBonus = (await db.find('bonuses', { date, playerId: req.player.id }))
    .filter((b) => b.kind === 'perfect' || b.kind === 'early')
    .reduce((s, b) => s + b.points, 0);
  res.json({ date, lockTime, earlyTime, earlyBonus, now: nowLocal().slice(11), dayBonus, questions: out });
}));

play.post('/guesses', wrap(async (req, res) => {
  const { questionId } = req.body;
  const value = Number(req.body.value);
  if (!Number.isFinite(value) || value < 0) throw fail(400, 'ניחוש חייב להיות מספר חיובי');
  const q = await db.findOne('questions', { id: questionId });
  if (!q) throw fail(404, 'שאלה לא נמצאה');
  if (q.date !== today()) throw fail(400, 'אפשר לנחש רק על שאלות של היום');
  if (await isLocked(q)) throw fail(400, 'השאלה כבר ננעלה 🔒');
  const id = `${q.id}:${req.player.id}`;
  if (await db.findOne('guesses', { id })) throw fail(400, 'כבר ניחשת על השאלה הזו');
  // Early bird: guessing before earlyTime earns a small bonus, kept as its own bonus record.
  const { earlyTime, earlyBonus } = await getSettings();
  const early = earlyBonus > 0 && nowLocal().slice(11) < earlyTime;
  await db.insertOne('guesses', { id, questionId: q.id, playerId: req.player.id, value, early, at: new Date().toISOString() });
  if (early) {
    await db.insertOne('bonuses', {
      id: `${id}:early`, date: q.date, questionId: q.id, playerId: req.player.id, kind: 'early', points: earlyBonus, at: new Date().toISOString(),
    });
  }
  res.json({ ok: true, early, earlyBonus: early ? earlyBonus : 0 });
}));

play.post('/buy', wrap(async (req, res) => {
  const { componentId } = req.body;
  const arch = await getArchitecture();
  const node = arch.nodes.find((n) => n.id === componentId);
  if (!node) throw fail(404, 'רכיב לא נמצא');
  const price = Number(node.data.price) || 0;
  const w = await wallet(req.player.id);
  if (w.owned.includes(componentId)) throw fail(400, 'הרכיב כבר שלך');
  if (w.balance < price) throw fail(400, `חסרים לך ${price - w.balance} דינרים`);
  try {
    await db.insertOne('purchases', { id: `${req.player.id}:${componentId}`, playerId: req.player.id, componentId, price, at: new Date().toISOString() });
  } catch (e) {
    if (e.code === 'DUPLICATE') throw fail(400, 'הרכיב כבר שלך');
    throw e;
  }
  await addEvent('purchase', `🏗️ ${req.player.name} קנה/תה את "${node.data.name}" ב-${price} דינרים`, req.player.id);
  res.json({ ok: true, wallet: await wallet(req.player.id) });
}));

// Shared by the player leaderboard and the office TV screen.
async function leaderboard() {
  const arch = await getArchitecture();
  const totalComponents = arch.nodes.length;
  const players = (await db.find('players')).filter((p) => p.active !== false);
  const date = today();
  const todayQs = await db.find('questions', { date });
  const todayIds = new Set(todayQs.map((q) => q.id));

  const rows = [];
  for (const p of players) {
    const w = await wallet(p.id);
    const guesses = await db.find('guesses', { playerId: p.id });
    const scored = guesses.filter((g) => typeof g.points === 'number');
    const dayBonus = (await db.find('bonuses', { playerId: p.id, date }))
      .filter((b) => b.kind === 'perfect' || b.kind === 'early')
      .reduce((s, b) => s + b.points, 0);
    rows.push({
      id: p.id,
      name: p.name,
      photo: p.photo,
      value: w.value,
      ownedCount: w.owned.length,
      coverage: totalComponents ? w.owned.length / totalComponents : 0,
      balance: w.balance,
      earned: w.earned,
      accuracy: scored.length ? scored.reduce((s, g) => s + g.points, 0) / scored.length : null,
      todayPoints: guesses.filter((g) => todayIds.has(g.questionId)).reduce((s, g) => s + (g.points || 0) + (g.bonus || 0), 0) + dayBonus,
      ...(await season2.playerBadges(p)),
    });
  }
  // Ties (e.g. everyone at 0 on day one) are broken by balance, then by accuracy.
  rows.sort((a, b) => b.value - a.value || b.balance - a.balance || (b.accuracy ?? -1) - (a.accuracy ?? -1));
  return { rows, totalComponents };
}

play.get('/leaderboard', wrap(async (req, res) => res.json(await leaderboard())));

play.get('/players/:id/owned', wrap(async (req, res) => {
  const p = await db.findOne('players', { id: req.params.id });
  if (!p) throw fail(404, 'שחקן לא נמצא');
  res.json(await season2.cityOf(p));
}));

play.get('/feed', wrap(async (req, res) => {
  const events = (await db.find('events')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  res.json(events);
}));

app.use('/api', play);

// In production the same server also serves the built frontend.
const dist = path.resolve('dist');
const servesFrontend = fs.existsSync(dist);
if (servesFrontend) {
  // index.html must never be cached, or browsers keep running an old version after an update.
  // The JS/CSS files have a content hash in their name, so they can be cached safely.
  const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
  app.use(express.static(dist, { setHeaders: (res, file) => { if (file.endsWith('.html')) noCache(res); } }));
  app.get('*', (req, res) => { noCache(res); res.sendFile(path.join(dist, 'index.html')); });
}

season2.startJobs();

const server = app.listen(PORT, () => {
  const base = process.env.PUBLIC_URL || (servesFrontend ? `http://localhost:${PORT}` : 'http://localhost:5173');
  console.log(`Server on :${PORT} (store: ${db.kind})`);
  // A key the admin chose (ADMIN_TOKEN) is never echoed to the logs.
  if (process.env.ADMIN_TOKEN) console.log(`Admin link: ${base}/#/admin?key=<your ADMIN_TOKEN>`);
  else console.log(`Admin link: ${base}/#/admin?key=${adminToken}`);
});

server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`\n❌ פורט ${PORT} כבר תפוס: כנראה השרת כבר רץ בחלון אחר.`);
  console.error('   סגור את החלון השני (Ctrl+C) או הגדר PORT אחר בקובץ .env\n');
  process.exit(1);
});
