import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, Building2, Clock, Lightbulb, Megaphone, Pickaxe, Sun, Swords, Timer, Trophy, Tv, Volume2, VolumeX,
} from 'lucide-react';
import { tvApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import ComponentNode, { DecorationNode, EditorContext } from '../ComponentNode.jsx';
import FlowEdge from '../FlowEdge.jsx';
import { Coin } from '../icons.jsx';
import { useSound } from './sound.js';
import Ceremony, { ceremonyLength } from './Ceremony.jsx';
import './tv.css';

const SLIDE_MS = 13000;
const POLL_MS = 10000;
const MOMENT_MS = 7000;
const MAX_QUEUED_MOMENTS = 6;
const COUNTDOWN_SLIDE_FROM_MS = 45 * 60 * 1000; // the big countdown joins the show 45 minutes before the lock
const MEDALS = ['🥇', '🥈', '🥉'];
const DECO_EMOJI = { tree: '🌳', flag: '🚩', lamp: '🏮', rocket: '🚀', statue: '🗿' };
const PARTICLE = { mint: '#2dd4a0', gold: '#fbbf24', pink: '#f472b6', cyan: '#22d3ee', violet: '#a78bfa' };
const nodeTypes = { component: ComponentNode, decoration: DecorationNode };
const edgeTypes = { flow: FlowEdge };

// How each kind of game event looks when it takes over the screen.
const MOMENT_STYLE = {
  purchase: { title: 'קנייה חדשה!', tone: 'mint', sound: 'chime' },
  upgrade: { title: 'שדרוג!', tone: 'violet', sound: 'chime' },
  gold: { title: 'זהב במכרה!', tone: 'gold', sound: 'fanfare' },
  perfect: { title: 'יום מושלם!', tone: 'gold', sound: 'fanfare' },
  results: { title: 'התוצאות פורסמו!', tone: 'gold', sound: 'fanfare', opens: 'reveal' },
  bonus: { title: 'בונוס!', tone: 'mint', sound: 'chime' },
  vote: { title: 'העיר היפה של השבוע!', tone: 'pink', sound: 'fanfare' },
  duel: { title: 'התערבות!', tone: 'violet', sound: 'whoosh' },
  'duel-result': { title: '⚔️ ההתערבות הוכרעה!', tone: 'violet', sound: 'fanfare', crown: true },
  'incident-resolved': { title: '🧯 התקלה טופלה!', tone: 'mint', sound: 'fanfare', crown: true },
  mine: { title: 'המכרה נפתח!', tone: 'gold', sound: 'chime' },
  join: { title: 'שחקן חדש!', tone: 'cyan', sound: 'chime' },
  incident: { title: 'תקלה!', tone: 'red', sound: 'alarm' },
  billboard: { title: 'שלט חדש!', tone: 'cyan', sound: 'chime' },
};

const fmtCountdown = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
const showValue = (kind, v, unit = '') => (v === null || v === undefined ? '?' : kind === 'yesno' ? (v ? 'כן' : 'לא') : `${Number(v).toLocaleString()} ${unit}`.trim());

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function partOfDay(hour) {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'day';
  if (hour >= 16 && hour < 19) return 'evening';
  return 'night';
}

function Confetti({ count = 40 }) {
  return (
    <div className="tv-confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={{ '--x': `${(i * 29) % 100}%`, '--d': `${2.5 + (i % 5) * 0.6}s`, '--delay': `${(i % 9) * 0.3}s` }} />
      ))}
    </div>
  );
}

// ---------- slides ----------

function Podium({ rows, delta }) {
  const order = [rows[1], rows[0], rows[2]]; // silver, gold, bronze
  return (
    <div className="tv-podium">
      {order.map((r, i) => r && (
        <div key={r.id} className={`tv-podium-spot place-${[2, 1, 3][i]}`} style={{ '--i': i }}>
          <div className="tv-podium-face">
            <Avatar name={r.name} photo={r.photo} size={[110, 150, 96][i]} crown={i === 1 && r.value > 0} frame={r.frame} />
            <Delta value={delta[r.id]} />
          </div>
          <b className="tv-podium-name">{r.name}</b>
          <Coin value={r.value} size={26} className="tv-podium-value" />
          <div className="tv-podium-block"><span>{MEDALS[[1, 0, 2][i]]}</span></div>
        </div>
      ))}
    </div>
  );
}

function Delta({ value }) {
  if (!value) return null;
  return <span className={`delta ${value > 0 ? 'up' : 'down'}`}>{value > 0 ? '▲' : '▼'}{Math.abs(value)}</span>;
}

function BoardSlide({ board, delta }) {
  const top = board.rows.slice(0, 3);
  const rest = board.rows.slice(3, 10);
  const max = Math.max(1, ...board.rows.map((r) => r.value));
  if (!board.rows.length) return <div className="tv-slide tv-empty">עוד אין שחקנים</div>;
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Trophy size={40} className="warn" /> טבלת האדריכלים <span className="tv-sub">החיצים: מאז הבוקר</span></h1>
      <div className="board-stage">
        <Podium rows={top} delta={delta} />
        <div className="board-rest">
          {rest.map((r, i) => (
            <div className="rest-row" key={r.id} style={{ '--i': i, '--w': `${(r.value / max) * 100}%` }}>
              <span className="rest-rank">{i + 4}</span>
              <Avatar name={r.name} photo={r.photo} size={44} frame={r.frame} />
              <b>{r.name}</b>
              <Delta value={delta[r.id]} />
              <div className="rest-bar"><i /></div>
              <Coin value={r.value} size={20} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CitySlide({ state }) {
  const { leader, architecture } = state;
  const domainsById = useMemo(() => Object.fromEntries(architecture.domains.map((d) => [d.id, d])), [architecture]);
  const owned = useMemo(() => new Set(leader?.owned || []), [leader]);
  const burning = useMemo(() => new Set(leader?.burning || []), [leader]);
  if (!leader) return <div className="tv-slide tv-empty">עוד אף אחד לא בנה עיר. מי יהיה הראשון? 🏗️</div>;

  const nodes = [
    ...architecture.nodes.map((n) => ({ ...n, draggable: false })),
    ...leader.decorations.map((d) => ({
      id: `deco-${d.id}`, type: 'decoration', position: { x: d.x, y: d.y }, draggable: false, zIndex: -1,
      data: { type: d.type, emoji: DECO_EMOJI[d.type], photo: leader.player.photo },
    })),
  ];
  const edges = architecture.edges.map((e) => {
    const lit = owned.has(e.source) && owned.has(e.target) && !burning.has(e.source) && !burning.has(e.target);
    return lit ? { ...e, type: 'flow' } : { ...e, type: 'smoothstep', className: 'dark', label: '' };
  });

  return (
    <div className="tv-slide tv-city-slide">
      <h1 className="tv-title">
        <Avatar name={leader.player.name} photo={leader.player.photo} size={54} crown frame={leader.profile.frame} />
        {leader.profile.cityName || `העיר של ${leader.player.name}`}
        <span className="tv-sub">העיר המובילה · <Coin value={leader.value} size={22} /></span>
      </h1>
      {leader.profile.motto && <p className="tv-motto">"{leader.profile.motto}"</p>}
      <div className={`tv-city city flyover theme-${leader.profile.theme}`} style={{ '--particle': PARTICLE[leader.profile.particle] || PARTICLE.mint }} dir="ltr">
        <EditorContext.Provider value={{ domainsById, highlightDomain: null, owned, levels: leader.levels, burning, justBought: null }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid)" />
            </ReactFlow>
          </ReactFlowProvider>
        </EditorContext.Provider>
      </div>
    </div>
  );
}

function YesNoBar({ split }) {
  const total = split.yes + split.no || 1;
  return (
    <div className="tv-split">
      <span style={{ flexBasis: `${(split.yes / total) * 100}%` }} className="yes">כן {split.yes}</span>
      <span style={{ flexBasis: `${(split.no / total) * 100}%` }} className="no">לא {split.no}</span>
    </div>
  );
}

function TodaySlide({ state }) {
  const { questions } = state;
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Sun size={40} className="accent" /> התחזיות של היום</h1>
      {!questions.length && <p className="tv-empty">עוד אין שאלות להיום ☕</p>}
      <div className="tv-questions">
        {questions.map((q, i) => (
          <div className="tv-question" key={q.id} style={{ '--i': i }}>
            <span className="q-num">{i + 1}</span>
            <div className="tv-q-text">
              {q.text}
              {q.split && !q.resolved && <YesNoBar split={q.split} />}
            </div>
            {q.resolved ? (
              <span className="tv-answer">🎯 {showValue(q.kind, q.answer, q.unit)}</span>
            ) : q.locked ? (
              <span className="tv-locked">🔒 {q.guessCount} ניחושים · מחכים לתשובה</span>
            ) : (
              <span className="tv-open"><Clock size={20} /> נועל ב-{q.lockTime} · {q.guessCount} ניחשו</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CountdownSlide({ countdown, deadline }) {
  const now = useNow(250);
  const left = deadline - now;
  const urgent = left < 5 * 60 * 1000;
  return (
    <div className={`tv-slide countdown-slide${urgent ? ' urgent' : ''}`}>
      <div className="countdown-label"><Timer size={40} /> הניחושים ננעלים בעוד</div>
      <div className="countdown-digits">{fmtCountdown(left)}</div>
      {countdown.missing.length ? (
        <>
          <div className="countdown-missing-title">⏳ עוד לא סיימו לנחש:</div>
          <div className="countdown-faces">
            {countdown.missing.map((p, i) => (
              <div key={p.id} className="missing-face" style={{ '--i': i }}>
                <Avatar name={p.name} photo={p.photo} size={84} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="countdown-all">כולם ניחשו! 🎉 עכשיו רק מחכים לתוצאות</div>
      )}
    </div>
  );
}

function DuelsSlide({ duels }) {
  const show = (d, v) => (v === null || v === undefined ? '🔒' : showValue(d.kind, v));
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Swords size={40} className="accent" /> ההתערבויות של היום</h1>
      <div className="tv-duels">
        {duels.slice(0, 5).map((d) => (
          <div className={`tv-duel${d.status === 'resolved' ? ' done' : ''}`} key={d.id}>
            <div className={`tv-duelist${d.winner === d.by.id ? ' winner' : ''}`}>
              <Avatar name={d.by.name} photo={d.by.photo} size={72} crown={d.winner === d.by.id} />
              <b>{d.by.name}</b>
              <span>{show(d, d.byGuess)}</span>
            </div>
            <div className="tv-duel-mid">
              <div className="tv-vs">VS</div>
              <div className="tv-duel-q">"{d.question}"</div>
              <div className="tv-duel-pot">⚔️ קופה <Coin value={d.stake * 2} size={22} /></div>
              {d.status === 'resolved' && <div className="tv-duel-answer">התשובה: {show(d, d.answer)}</div>}
            </div>
            <div className={`tv-duelist${d.winner === d.target.id ? ' winner' : ''}`}>
              <Avatar name={d.target.name} photo={d.target.photo} size={72} crown={d.winner === d.target.id} />
              <b>{d.target.name}</b>
              <span>{show(d, d.targetGuess)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactSlide({ fact }) {
  return (
    <div className="tv-slide fact-slide">
      <div className="fact-bulb"><Lightbulb size={90} /></div>
      <div className="fact-label">הידעת?</div>
      <p className="fact-text">{fact.text}</p>
      {fact.auto && <span className="fact-source">נמצא בנתוני המשחק</span>}
    </div>
  );
}

function RecordsSlide({ records }) {
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Trophy size={40} className="warn" /> היכל התהילה</h1>
      <div className="records-grid">
        {records.map((r, i) => (
          <div className="record-card" key={r.id} style={{ '--i': i }}>
            <div className="record-emoji">{r.emoji}</div>
            <div className="record-label">{r.label}</div>
            {r.player && <Avatar name={r.player.name} photo={r.player.photo} size={64} />}
            {r.player && <b className="record-player">{r.player.name}</b>}
            <div className="record-value">{r.value}</div>
            {r.sub && <div className="record-sub">{r.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementSlide({ announcement }) {
  return (
    <div className="tv-slide tv-announce-slide">
      <Confetti count={36} />
      <Megaphone size={64} className="tv-announce-icon" />
      <p className="tv-announce-text">{announcement.text}</p>
    </div>
  );
}

function IncidentSlide({ incidents }) {
  return (
    <div className="tv-slide tv-incident">
      <AlertTriangle size={96} />
      <h1>תקלה פעילה</h1>
      {incidents.map((i) => (
        <div key={i.id} className="tv-incident-row">
          <b>🔥 {i.componentNames.join(', ')}</b>
          <span>{i.description}</span>
        </div>
      ))}
      <p>מי שמטפל בתקלה מקבל בונוס ואת התואר 🧯 כבאי</p>
    </div>
  );
}

// ---------- live moments ----------

// A full-screen takeover when something happens: a purchase, an overtake, a duel won...
function MomentOverlay({ moment }) {
  return (
    <div className={`moment tone-${moment.tone}`} key={moment.key}>
      <div className="moment-rays" />
      <Confetti count={50} />
      <div className="moment-card">
        <div className="moment-title">{moment.title}</div>
        <div className="moment-faces">
          {moment.player && (
            <div className="moment-face">
              <Avatar name={moment.player.name} photo={moment.player.photo} size={200} crown={moment.crown} />
            </div>
          )}
          {moment.other && (
            <>
              <span className="moment-vs">{moment.otherLabel || '⟵'}</span>
              <div className="moment-face other">
                <Avatar name={moment.other.name} photo={moment.other.photo} size={140} />
              </div>
            </>
          )}
        </div>
        <div className="moment-text">{moment.text}</div>
      </div>
    </div>
  );
}

// Compares each new state to the previous one and queues moments for what changed.
function detectMoments(prev, next) {
  const moments = [];
  const seen = new Set(prev.feed.map((e) => e.id));
  // Several events of the same kind by the same player (a shopping spree) become one moment.
  const groups = new Map();
  [...next.feed].reverse().forEach((e) => {
    if (seen.has(e.id) || e.type === 'income' || e.type === 'refund') return;
    const key = `${e.type}:${e.playerId || e.id}`;
    groups.set(key, [...(groups.get(key) || []), e]);
  });
  groups.forEach((list) => {
    const e = list[list.length - 1];
    const style = MOMENT_STYLE[e.type] || { title: 'עדכון!', tone: 'cyan', sound: 'chime' };
    moments.push({
      key: e.id, crown: e.type === 'results' || e.type === 'vote', ...style,
      text: list.length > 1 ? `${e.text} (ועוד ${list.length - 1} כאלה! 🤯)` : e.text,
      player: e.name ? { name: e.name, photo: e.photo } : null,
    });
  });

  // Overtakes among players who already built something: who passed whom.
  const oldRank = Object.fromEntries(prev.board.rows.map((r, i) => [r.id, i]));
  next.board.rows.slice(0, 8).forEach((r, i) => {
    if (r.value <= 0 || oldRank[r.id] === undefined || oldRank[r.id] <= i) return;
    const passed = next.board.rows.slice(i + 1).find((o) => oldRank[o.id] !== undefined && oldRank[o.id] < oldRank[r.id]);
    if (!passed) return;
    moments.push({
      key: `over-${r.id}-${i}-${next.board.rows.length}`, title: i === 0 ? '👑 יש מוביל חדש!' : 'עקיפה!', tone: 'gold', sound: 'fanfare',
      text: `${r.name} עקף/ה את ${passed.name} ועלה/תה למקום ${i + 1}!`, crown: i === 0,
      player: { name: r.name, photo: r.photo }, other: { name: passed.name, photo: passed.photo }, otherLabel: '🏎️',
    });
  });

  return moments;
}

// ---------- the show ----------

// The TV runs unattended all day: if anything ever breaks while drawing,
// show a calm screen and start over a few seconds later instead of going black.
class Recover extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, round: 0 };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) {
    console.error('TV screen failed, restarting it:', error);
    setTimeout(() => this.setState((s) => ({ failed: false, round: s.round + 1 })), 10000);
  }

  render() {
    if (this.state.failed) {
      return <div className="center-page tv"><Tv size={48} className="muted" /><h1>רגע, מסדרים את הבמה...</h1></div>;
    }
    return <TvShow key={this.state.round} />;
  }
}

export default function TvApp() {
  return <Recover />;
}

function TvShow() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [forced, setForced] = useState(null);
  const [moments, setMoments] = useState([]);
  // Read once: the app removes the link's parameters from the address bar after loading.
  const [only] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('only'));
  const deadlineRef = useRef(null);
  const prevRef = useRef(null);
  const sound = useSound();
  const now = useNow(1000);

  const load = useCallback(() => tvApi.get('/state').then((s) => {
    deadlineRef.current = s.countdown?.lockInMs != null ? Date.now() + s.countdown.lockInMs : null;
    if (prevRef.current) {
      const found = detectMoments(prevRef.current, s);
      if (found.length) setMoments((q) => [...q, ...found].slice(-MAX_QUEUED_MOMENTS));
    }
    prevRef.current = s;
    setState(s);
    setError(null);
  }).catch((e) => setError({ status: e.status, message: e.message })), []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Play each moment for a few seconds; a "results" moment then opens the ceremony.
  const moment = moments[0];
  useEffect(() => {
    if (!moment) return undefined;
    sound.play(moment.sound);
    const t = setTimeout(() => {
      setMoments((q) => q.slice(1));
      if (moment.opens) setForced(moment.opens);
    }, MOMENT_MS);
    return () => clearTimeout(t);
  }, [moment]); // eslint-disable-line react-hooks/exhaustive-deps

  const slides = useMemo(() => {
    if (!state) return [];
    if (state.incidents.length) return ['incident', 'board', 'incident', 'city'];
    const featured = state.announcements.some((a) => a.featured);
    const list = ['board'];
    if (state.facts.length) list.push('fact');
    list.push('today');
    list.push('city');
    if (state.duels?.length) list.push('duels');
    if (state.facts.length) list.push('fact');
    if (state.records.length) list.push('records');
    // Close to the lock the countdown opens the round and returns mid-way; featured
    // announcements come back every third slide.
    const soon = deadlineRef.current && deadlineRef.current - Date.now() < COUNTDOWN_SLIDE_FROM_MS && deadlineRef.current > Date.now();
    if (soon) {
      list.splice(Math.ceil(list.length / 2), 0, 'countdown');
      list.unshift('countdown');
    }
    return featured ? list.flatMap((s, i) => (i % 3 === 2 ? [s, 'announce'] : [s])) : list;
  }, [state]);

  // "&only=board" in the TV link pins one slide (handy for checking a screen).
  const current = only || forced || slides[index % Math.max(1, slides.length)];
  const turn = Math.floor(index / Math.max(1, slides.length));

  const resolvedCount = state ? state.questions.filter((q) => q.resolved).length : 0;
  const slideMs = current === 'reveal' ? ceremonyLength(resolvedCount) : SLIDE_MS;
  useEffect(() => {
    if (!state) return undefined;
    const t = setTimeout(() => {
      if (forced) setForced(null);
      else setIndex((i) => i + 1);
    }, slideMs);
    return () => clearTimeout(t);
  }, [current, index, forced, slideMs, Boolean(state)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only a rejected code means the link is wrong; anything else (the server restarting,
  // the network blinking) just retries on the next poll.
  if (error && !state) {
    return error.status === 401 ? (
      <div className="center-page tv">
        <Tv size={48} className="muted" />
        <h1>צריך קישור טלוויזיה</h1>
        <p className="muted">את הקישור מעתיקים בפאנל המנהל, בלשונית "טלוויזיה ושלטים".</p>
      </div>
    ) : (
      <div className="center-page tv">
        <Tv size={48} className="muted" />
        <h1>מתחבר מחדש לשרת...</h1>
        <p className="muted">המסך ינסה שוב בעוד כמה שניות</p>
      </div>
    );
  }
  if (!state) return <div className="center-page tv muted">טוען את ההופעה...</div>;

  const featured = state.announcements.filter((a) => a.featured);
  const occurrence = (name) => turn * slides.filter((s) => s === name).length
    + slides.slice(0, index % slides.length).filter((s) => s === name).length;
  const ticker = [
    ...state.announcements.map((a) => ({ id: a.id, announce: true, text: a.text })),
    ...state.billboards.map((b) => ({ id: b.id, billboard: true, text: b.text, name: b.name, photo: b.photo })),
    ...state.feed.map((e) => ({ id: e.id, text: e.text })),
  ];
  const deadline = deadlineRef.current;
  const counting = state.countdown && deadline && deadline > now;

  return (
    <div className={`tv tv-show daypart-${partOfDay(new Date(now).getHours())}${state.incidents.length ? ' alarm' : ''}`}>
      <div className="tv-orbs" aria-hidden="true"><i /><i /><i /></div>
      <header className="tv-top">
        <div className="brand">
          <span className="logo"><Building2 size={22} /></span>
          <h1>ארכיטקטורה חיה</h1>
          <span className="live-dot">LIVE</span>
        </div>
        <div className="tv-top-mid">
          {state.mining.open && (
            <span className="tv-mine">
              <Pickaxe size={20} /> המכרה פתוח עד {state.mining.closesAt}
              {state.mining.firstMiner && <> · כורה ראשון: <b>{state.mining.firstMiner.name}</b></>}
            </span>
          )}
          {counting && (
            <span className={`tv-lock-chip${deadline - now < 5 * 60 * 1000 ? ' urgent' : ''}`}>
              <Timer size={20} /> נועל בעוד {fmtCountdown(deadline - now)}
            </span>
          )}
        </div>
        <button className="tv-sound" onClick={sound.toggle} title={sound.on ? 'השתק' : 'הפעל צלילים'}>
          {sound.on ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
        <span className="tv-clock">{new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
      </header>

      <main className="tv-main" key={`${current}-${index}-${forced || ''}`}>
        {current === 'board' && <BoardSlide board={state.board} delta={state.rankDelta || {}} />}
        {current === 'city' && <CitySlide state={state} />}
        {current === 'today' && <TodaySlide state={state} />}
        {current === 'countdown' && counting && <CountdownSlide countdown={state.countdown} deadline={deadline} />}
        {current === 'countdown' && !counting && <TodaySlide state={state} />}
        {current === 'reveal' && <Ceremony questions={state.questions} sound={sound} />}
        {current === 'duels' && <DuelsSlide duels={state.duels} />}
        {current === 'fact' && state.facts.length > 0 && <FactSlide fact={state.facts[occurrence('fact') % state.facts.length]} />}
        {current === 'records' && <RecordsSlide records={state.records} />}
        {current === 'incident' && <IncidentSlide incidents={state.incidents} />}
        {current === 'announce' && featured.length > 0 && <AnnouncementSlide announcement={featured[occurrence('announce') % featured.length]} />}
      </main>

      <div className="tv-progress" key={`p-${current}-${index}-${forced || ''}`} style={{ animationDuration: `${slideMs}ms` }} />

      {ticker.length > 0 && (
        <footer className="tv-ticker">
          <div className="tv-ticker-track" style={{ '--n': ticker.length }}>
            {[...ticker, ...ticker].map((t, i) => (
              <span key={`${t.id}-${i}`} className={t.announce ? 'tv-announce' : t.billboard ? 'tv-billboard' : ''}>
                {t.billboard && <Avatar name={t.name} photo={t.photo} size={30} />}
                {t.announce ? `📢 ${t.text}` : t.billboard ? `📺 ${t.text}` : t.text}
              </span>
            ))}
          </div>
        </footer>
      )}

      {moment && <MomentOverlay moment={moment} />}
    </div>
  );
}
