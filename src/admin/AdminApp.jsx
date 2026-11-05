import { useCallback, useEffect, useState } from 'react';
import { adminApi, clearToken, readToken, storeToken } from '../api.js';
import ArchitectureEditor from './ArchitectureEditor.jsx';
import PlayersPanel from './PlayersPanel.jsx';
import QuestionsPanel from './QuestionsPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import Avatar from '../Avatar.jsx';
import { Building2, Gamepad2, Gift, LogOut, Network, Settings, ShieldCheck, Siren, Sun, Tv, Users } from 'lucide-react';
import BonusPanel from './BonusPanel.jsx';
import IncidentsPanel from './IncidentsPanel.jsx';
import TvPanel from './TvPanel.jsx';
import { useBusy } from '../useBusy.js';

const SECTIONS = [
  ['questions', 'שאלות ותשובות', Sun],
  ['incidents', 'תקלות', Siren],
  ['architecture', 'ארכיטקטורה', Network],
  ['players', 'שחקנים', Users],
  ['bonus', 'בונוסים', Gift],
  ['tv', 'טלוויזיה ושלטים', Tv],
  ['settings', 'הגדרות', Settings],
];

// Small red counters on tabs that need the admin's attention.
const badgeFor = (key, state) => ({ incidents: state.openIncidents, tv: state.pendingBillboards }[key] || 0);

function AdminLogin({ onLogin, error }) {
  const [code, setCode] = useState('');
  return (
    <div className="center-page">
      <form
        className="card login-card"
        onSubmit={(e) => { e.preventDefault(); if (code) onLogin(code); }}
      >
        <span className="logo big-logo"><ShieldCheck size={26} /></span>
        <h1>כניסת מנהל</h1>
        <p className="muted small">ארכיטקטורה חיה</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="קוד מנהל"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="primary" type="submit">כניסה</button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  );
}

// Lets the admin pick (or create) their own player, then jumps straight into the game.
function JoinGameDialog({ players, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const play = (player) => {
    storeToken('player', player.token);
    window.location.hash = '#/play';
  };

  const [creating, guardCreate] = useBusy();
  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    guardCreate(() => adminApi.post('/players', { name: name.trim() }).then(play).catch((err) => setError(err.message)));
  };

  const active = players.filter((p) => p.active !== false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎮 מי אתה במשחק?</h2>
        {active.length > 0 && (
          <>
            <p className="muted">כבר הוספת את עצמך? בחר את השם שלך:</p>
            <div className="join-list">
              {active.map((p) => (
                <button key={p.id} onClick={() => play(p)}>
                  <Avatar name={p.name} photo={p.photo} size={28} /> {p.name}
                </button>
              ))}
            </div>
            <p className="muted">או צור שחקן חדש:</p>
          </>
        )}
        <form className="row" onSubmit={create}>
          <input autoFocus placeholder="השם שלך" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" type="submit" disabled={creating}>צור ושחק</button>
        </form>
        {error && <p className="login-error">{error}</p>}
        <button className="ghost" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [state, setState] = useState(null);
  const [needLogin, setNeedLogin] = useState(!readToken('admin'));
  const [loginError, setLoginError] = useState('');
  const [section, setSection] = useState('questions');
  const [joining, setJoining] = useState(false);

  // Only a rejected code logs the admin out. A server restart or a network blink just shows
  // a message and keeps the saved code (the admin may not even know it, having come by link).
  const [loadError, setLoadError] = useState('');
  const load = useCallback(() => {
    adminApi.get('/state')
      .then((s) => { setState(s); setNeedLogin(false); setLoginError(''); setLoadError(''); })
      .catch((e) => {
        if (e.status === 401) {
          clearToken('admin');
          setNeedLogin(true);
          setLoginError('הקוד השמור כבר לא תקף, היכנס מחדש');
        } else if (e.status === 429) {
          setNeedLogin(true);
          setLoginError(e.message);
        } else {
          setLoadError('אין חיבור לשרת כרגע. נסה שוב בעוד רגע');
        }
      });
  }, []);
  useEffect(() => { if (readToken('admin')) load(); }, [load]);

  const login = (code) => {
    storeToken('admin', code);
    adminApi.get('/state')
      .then((s) => { setState(s); setNeedLogin(false); setLoginError(''); })
      .catch((e) => { clearToken('admin'); setLoginError(e.status === 401 ? 'קוד שגוי' : e.message); });
  };

  const logout = () => {
    clearToken('admin');
    setState(null);
    setNeedLogin(true);
  };

  const persistArchitecture = useCallback(async (arch) => {
    const res = await adminApi.put('/architecture', arch);
    setState((s) => ({ ...s, architecture: arch, purchaseCounts: res.purchaseCounts }));
    return res;
  }, []);

  if (needLogin) return <AdminLogin onLogin={login} error={loginError} />;
  if (!state) {
    return loadError ? (
      <div className="center-page">
        <p className="muted">{loadError}</p>
        <button className="primary" onClick={load}>נסה שוב</button>
      </div>
    ) : <div className="center-page muted">טוען...</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo"><Building2 size={20} /></span>
          <div>
            <h1>ארכיטקטורה חיה</h1>
            <span className="badge"><ShieldCheck size={11} /> פאנל מנהל</span>
          </div>
        </div>
        <nav className="tabs main-tabs">
          {SECTIONS.map(([key, label, Icon]) => (
            <button key={key} className={section === key ? 'active' : ''} onClick={() => { setSection(key); load(); }}>
              <Icon size={16} /> {label}
              {badgeFor(key, state) > 0 && <span className="tab-badge">{badgeFor(key, state)}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-end">
          {/* Only trust a saved player link that still belongs to an existing player. */}
          {state.players.some((p) => p.token === readToken('player')) ? (
            <a className="switch-link" href="#/play"><Gamepad2 size={15} /> עבור למשחק</a>
          ) : (
            <button className="switch-link" onClick={() => setJoining(true)}><Gamepad2 size={15} /> גם אני רוצה לשחק</button>
          )}
          <button className="ghost" onClick={logout} title="מוחק את קוד המנהל מהדפדפן הזה"><LogOut size={15} /> התנתק</button>
        </div>
      </header>

      {section === 'architecture' && (
        <ArchitectureEditor initial={state.architecture} onPersist={persistArchitecture} purchaseCounts={state.purchaseCounts} />
      )}
      {section === 'players' && <PlayersPanel players={state.players} onChange={load} />}
      {section === 'questions' && <QuestionsPanel architecture={state.architecture} players={state.players} today={state.today} />}
      {section === 'bonus' && <BonusPanel players={state.players} />}
      {section === 'incidents' && <IncidentsPanel architecture={state.architecture} players={state.players} settings={state.settings} onChange={load} />}
      {section === 'tv' && <TvPanel tvToken={state.tvToken} onChange={load} />}
      {section === 'settings' &&<SettingsPanel settings={state.settings} store={state.store} onChange={load} />}
      {joining && <JoinGameDialog players={state.players} onClose={() => setJoining(false)} />}
    </div>
  );
}
