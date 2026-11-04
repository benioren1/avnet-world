import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Building2, Clock, Megaphone, Pickaxe, Sun, Trophy, Tv } from 'lucide-react';
import { tvApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import ComponentNode, { DecorationNode, EditorContext } from '../ComponentNode.jsx';
import FlowEdge from '../FlowEdge.jsx';
import { Coin } from '../icons.jsx';

const SLIDE_MS = 15000;
const POLL_MS = 20000;
const MEDALS = ['🥇', '🥈', '🥉'];
const DECO_EMOJI = { tree: '🌳', flag: '🚩', lamp: '🏮', rocket: '🚀', statue: '🗿' };
const PARTICLE = { mint: '#2dd4a0', gold: '#fbbf24', pink: '#f472b6', cyan: '#22d3ee', violet: '#a78bfa' };
const nodeTypes = { component: ComponentNode, decoration: DecorationNode };
const edgeTypes = { flow: FlowEdge };

function Clock24() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tv-clock">{now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>;
}

function BoardSlide({ board }) {
  const rows = board.rows.slice(0, 8);
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Trophy size={36} className="warn" /> טבלת האדריכלים</h1>
      <div className="tv-board">
        {rows.map((r, i) => (
          <div className={`tv-row${i === 0 && r.value > 0 ? ' leader' : ''}`} key={r.id} style={{ '--i': i }}>
            <span className="tv-rank">{r.value > 0 ? MEDALS[i] || i + 1 : i + 1}</span>
            <Avatar name={r.name} photo={r.photo} size={56} crown={i === 0 && r.value > 0} frame={r.frame} />
            <div className="tv-name">
              <b>{r.name}</b>
              <span>{r.cityName || `${r.ownedCount}/${board.totalComponents} רכיבים`}</span>
            </div>
            <div className="tv-titles">{r.titles?.map((t) => <span key={t.id} className="title-pill">{t.label}</span>)}</div>
            <Coin value={r.value} size={24} className="tv-value" />
          </div>
        ))}
        {!rows.length && <p className="tv-empty">עוד אין שחקנים</p>}
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
        <Building2 size={36} className="accent" />
        {leader.profile.cityName || `העיר של ${leader.player.name}`}
        <span className="tv-sub">המובילה בטבלה · <Coin value={leader.value} size={22} /></span>
      </h1>
      <div className={`tv-city city theme-${leader.profile.theme}`} style={{ '--particle': PARTICLE[leader.profile.particle] || PARTICLE.mint }} dir="ltr">
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

function TodaySlide({ state }) {
  const { questions } = state;
  return (
    <div className="tv-slide">
      <h1 className="tv-title"><Sun size={36} className="accent" /> התחזיות של היום</h1>
      {!questions.length && <p className="tv-empty">עוד אין שאלות להיום ☕</p>}
      <div className="tv-questions">
        {questions.map((q, i) => (
          <div className="tv-question" key={q.id}>
            <span className="q-num">{i + 1}</span>
            <div className="tv-q-text">{q.text}</div>
            {q.resolved ? (
              <span className="tv-answer">🎯 {q.answer.toLocaleString()} {q.unit}</span>
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

// A featured announcement from the admin, big and celebratory.
function AnnouncementSlide({ announcement }) {
  return (
    <div className="tv-slide tv-announce-slide">
      <div className="tv-confetti" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => <i key={i} style={{ '--x': `${(i * 29) % 100}%`, '--d': `${2.5 + (i % 5) * 0.6}s`, '--delay': `${(i % 9) * 0.3}s` }} />)}
      </div>
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

// Read-only office screen. Opened once with #/tv?k=CODE, then remembers the code.
export default function TvApp() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const load = () => tvApi.get('/state').then((s) => { setState(s); setError(''); }).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => s + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  if (error && !state) {
    return (
      <div className="center-page tv">
        <Tv size={48} className="muted" />
        <h1>צריך קישור טלוויזיה</h1>
        <p className="muted">את הקישור מעתיקים בפאנל המנהל, בלשונית "טלוויזיה ושלטים".</p>
      </div>
    );
  }
  if (!state) return <div className="center-page tv muted">טוען...</div>;

  // An open incident takes over every other slide. Featured announcements get a slide
  // between the regular ones, taking turns when there are several.
  const featured = state.announcements.filter((a) => a.featured);
  const regular = featured.length ? ['board', 'announce', 'city', 'announce', 'today', 'announce'] : ['board', 'city', 'today'];
  const slides = state.incidents.length ? ['incident', 'board', 'incident', 'city'] : regular;
  const current = slides[slide % slides.length];
  const announceTurn = Math.floor(slide / slides.length) * slides.filter((s) => s === 'announce').length
    + slides.slice(0, slide % slides.length).filter((s) => s === 'announce').length;
  const ticker = [
    ...state.announcements.map((a) => ({ id: a.id, announce: true, text: a.text })),
    ...state.billboards.map((b) => ({ id: b.id, billboard: true, text: b.text, name: b.name, photo: b.photo })),
    ...state.feed.map((e) => ({ id: e.id, text: e.text })),
  ];

  return (
    <div className="tv">
      <header className="tv-top">
        <div className="brand">
          <span className="logo"><Building2 size={22} /></span>
          <h1>ארכיטקטורה חיה</h1>
        </div>
        {state.mining.open && (
          <span className="tv-mine">
            <Pickaxe size={20} /> המכרה פתוח עד {state.mining.closesAt}
            {state.mining.firstMiner && <> · כורה ראשון: <b>{state.mining.firstMiner.name}</b> ({state.mining.firstMiner.time})</>}
          </span>
        )}
        <Clock24 />
      </header>

      <main className="tv-main" key={`${current}-${slide}`}>
        {current === 'board' && <BoardSlide board={state.board} />}
        {current === 'city' && <CitySlide state={state} />}
        {current === 'today' && <TodaySlide state={state} />}
        {current === 'incident' && <IncidentSlide incidents={state.incidents} />}
        {current === 'announce' && featured.length > 0 && <AnnouncementSlide announcement={featured[announceTurn % featured.length]} />}
      </main>

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
    </div>
  );
}
