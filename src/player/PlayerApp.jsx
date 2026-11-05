import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, Coins, Lock, Palette, ShieldCheck, ShoppingBag, Sun, Swords, Trophy } from 'lucide-react';
import { playerApi, readToken } from '../api.js';
import Avatar from '../Avatar.jsx';
import TodayPanel from './TodayPanel.jsx';
import CityMap from './CityMap.jsx';
import Shop from './Shop.jsx';
import Leaderboard from './Leaderboard.jsx';
import Studio from './Studio.jsx';
import MineButton from './MineButton.jsx';
import DuelsPanel from './DuelsPanel.jsx';
import { FxProvider, useFx } from '../fx/GameFx.jsx';
import { RollingNumber } from '../fx/motion.jsx';
import SoundToggle from '../fx/SoundToggle.jsx';

const TABS = [
  ['today', 'היום', Sun],
  ['duels', 'התערבויות', Swords],
  ['city', 'העיר שלי', Building2],
  ['shop', 'חנות', ShoppingBag],
  ['studio', 'סטודיו', Palette],
  ['board', 'טבלה', Trophy],
];

const REFRESH_MS = 60 * 1000;

// The in-game confirm sheet and coin effects wrap the whole player screen.
export default function PlayerApp() {
  return <FxProvider><PlayerScreen /></FxProvider>;
}

function PlayerScreen() {
  const { confirm, flyCoins } = useFx();
  const [me, setMe] = useState(null);
  const [architecture, setArchitecture] = useState(null);
  const [board, setBoard] = useState(null);
  const [duels, setDuels] = useState(null);
  const [error, setError] = useState(null); // { status, message }
  const [tab, setTab] = useState('today');
  const [visiting, setVisiting] = useState(null); // city of another player
  const [placing, setPlacing] = useState(null); // decoration type waiting for a click on the map
  const [justBought, setJustBought] = useState(null);
  const [tick, setTick] = useState(0); // bumps child panels to reload on auto-refresh
  const [toast, setToast] = useState('');

  const toastTimer = useRef(null);
  const notify = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current); // a second toast gets its full time on screen
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const refresh = useCallback(async () => {
    const [m, a, b, du] = await Promise.all([
      playerApi.get('/me'), playerApi.get('/architecture'), playerApi.get('/leaderboard'), playerApi.get('/duels'),
    ]);
    setMe(m);
    setArchitecture(a);
    setBoard(b);
    setDuels(du);
    setTick((t) => t + 1);
    setError(null);
  }, []);

  // Only a rejected link (401: deleted or deactivated player) means "you need a personal link".
  // Anything else (server restarting, network blink) shows a retry and keeps polling.
  const onLoadError = useCallback((e) => setError({ status: e.status, message: e.message }), []);
  useEffect(() => { refresh().catch(onLoadError); }, [refresh, onLoadError]);

  // Tabs stay open all day: refresh every minute and whenever the player comes back to the tab,
  // so locks, published results, new questions and incidents show up on their own.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== 'visible') return;
      refresh().catch((e) => { if (e.status === 401 || !me) onLoadError(e); }); // with data on screen, a blip keeps it
    };
    const timer = setInterval(again, REFRESH_MS);
    document.addEventListener('visibilitychange', again);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', again); };
  }, [refresh, onLoadError, me]);

  const myCity = useMemo(() => me && ({
    player: me.player,
    owned: new Set(me.wallet.owned),
    value: me.wallet.value,
    levels: me.wallet.levels,
    profile: me.profile,
    decorations: me.decorations,
    burning: new Set(me.incidents.flatMap((i) => i.componentIds)),
  }), [me]);

  const visitingCity = useMemo(() => visiting && ({
    ...visiting,
    owned: new Set(visiting.owned),
    burning: new Set(visiting.burning),
  }), [visiting]);

  const act = async (promise, ok) => {
    try {
      const res = await promise;
      if (ok) notify(typeof ok === 'function' ? ok(res) : ok);
      await refresh();
      return res;
    } catch (e) {
      notify(`❌ ${e.message}`);
      return null;
    }
  };

  const celebrate = (id) => {
    setJustBought(id);
    setTimeout(() => setJustBought(null), 1800);
  };

  const buy = async (componentId) => {
    const node = architecture.nodes.find((n) => n.id === componentId);
    const price = Number(node?.data.price) || 0;
    if (!(await confirm({ icon: '🏗️', title: `לקנות את "${node?.data.name}"?`, price, balance: me.wallet.balance, okLabel: 'קנה' }))) return;
    const res = await act(playerApi.post('/buy', { componentId }), `🏗️ "${node?.data.name}" נוסף לעיר שלך!`);
    if (res) { flyCoins(); celebrate(componentId); }
  };

  const upgrade = async (componentId, cost, level) => {
    const name = architecture.nodes.find((n) => n.id === componentId)?.data.name;
    if (!(await confirm({ icon: '⬆️', title: `לשדרג את "${name}" לרמה ${level}?`, price: cost, balance: me.wallet.balance, okLabel: 'שדרג' }))) return;
    const res = await act(playerApi.post('/upgrade', { componentId }), `⬆️ "${name}" עלה לרמה ${level}!`);
    if (res) { flyCoins(); celebrate(componentId); }
  };

  const visit = async (playerId) => {
    setPlacing(null);
    if (playerId === me.player.id) { setVisiting(null); setTab('city'); return; }
    try {
      setVisiting(await playerApi.get(`/players/${playerId}/owned`));
      setTab('city');
    } catch (e) {
      notify(`❌ ${e.message}`);
    }
  };

  const startPlacing = (type) => {
    setVisiting(null);
    setPlacing(type);
    setTab('city');
  };

  const place = async (type, x, y) => {
    const deco = me.catalog.decorations.find((d) => d.id === type);
    setPlacing(null);
    await act(playerApi.post('/decorations', { type, x, y }), `${deco?.emoji} ${deco?.label} הוצב בעיר`);
  };

  const moveDecoration = (id, x, y) => playerApi.patch(`/decorations/${id}`, { x, y }).catch((e) => notify(`❌ ${e.message}`));

  if (error?.status === 401 || (error && !readToken('player'))) {
    return (
      <div className="center-page">
        <div className="logo big-logo"><Lock size={26} /></div>
        <h1>צריך קישור אישי</h1>
        <p className="muted">כדי לשחק צריך להיכנס דרך הקישור האישי שקיבלת מראש הצוות.</p>
      </div>
    );
  }
  if (error && !me) {
    return (
      <div className="center-page">
        <h1>אין חיבור לשרת כרגע</h1>
        <p className="muted">כנראה השרת מתעדכן. המסך ינסה שוב לבד, או לחץ:</p>
        <button className="primary" onClick={() => refresh().catch(onLoadError)}>נסה שוב</button>
      </div>
    );
  }
  if (!me || !architecture || !board || !duels) return <div className="center-page muted">טוען...</div>;
  const invitations = duels.today.filter((d) => !d.iAmChallenger && d.status === 'pending').length;

  const myRank = board.rows.findIndex((r) => r.id === me.player.id) + 1;
  const viewingOther = tab === 'city' && visiting;

  return (
    <div className="app player">
      <header className="topbar">
        <div className="brand">
          <Avatar name={me.player.name} photo={me.player.photo} size={42} crown={myRank === 1} frame={me.profile.frame} />
          <div>
            <h1>{me.player.name}</h1>
            <div className="brand-sub">
              {myRank > 0 && <span className="rank-pill"><Trophy size={11} /> מקום {myRank} מתוך {board.rows.length}</span>}
              {me.titles.map((t) => <span key={t.id} className="title-pill">{t.label}</span>)}
            </div>
          </div>
        </div>
        <nav className="tabs main-tabs">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key && !(key === 'city' && viewingOther) ? 'active' : ''}
              onClick={() => { setTab(key); setPlacing(null); if (key === 'city') setVisiting(null); }}
            >
              <Icon size={16} /> {label}
              {key === 'duels' && invitations > 0 && <span className="tab-badge">{invitations}</span>}
            </button>
          ))}
        </nav>
        <MineButton mining={me.mining} onMined={refresh} notify={notify} />
        <div className="stats">
          <div>
            <b><span className="coin fx-balance" data-fx-balance><Coins size={15} strokeWidth={2} /><RollingNumber value={me.wallet.balance} /></span></b>
            <span>דינרים</span>
          </div>
          <div><b>{me.wallet.owned.length}<small className="muted">/{architecture.nodes.length}</small></b><span>רכיבים</span></div>
        </div>
        {/* Only a browser that holds the admin key sees this; the server still checks the key on every admin call. */}
        <SoundToggle />
        {readToken('admin') && <a className="switch-link" href="#/admin"><ShieldCheck size={15} /> ניהול</a>}
      </header>

      {me.incidents.length > 0 && (
        <div className="incident-banner">
          <AlertTriangle size={18} />
          <b>תקלה פעילה:</b>
          {me.incidents.map((i) => <span key={i.id}>{i.componentNames.join(', ')}: {i.description}</span>)}
          <span className="muted-light">רכיבים בתקלה לא מכניסים עד שהיא מטופלת 🔥</span>
        </div>
      )}

      <main className="player-main">
        {tab === 'today' && <TodayPanel refreshKey={tick} architecture={architecture} meId={me.player.id} onChange={refresh} notify={notify} celebration={me.profile.celebration} />}
        {tab === 'city' && (
          <CityMap
            architecture={architecture}
            city={visitingCity || myCity}
            mine={visiting ? null : { paid: me.wallet.paid }}
            catalog={me.catalog}
            balance={me.wallet.balance}
            incidents={me.incidents}
            vote={me.vote}
            justBought={visiting ? null : justBought}
            placing={visiting ? null : placing}
            onBuy={buy}
            onUpgrade={upgrade}
            onBack={() => setVisiting(null)}
            onVote={(targetId) => act(playerApi.post('/vote', { targetId }), '❤️ ההצבעה נשמרה').then(() => setVisiting((v) => v && { ...v }))}
            onPlace={place}
            onMoveDecoration={moveDecoration}
            onCancelPlacing={() => setPlacing(null)}
          />
        )}
        {tab === 'shop' && <Shop architecture={architecture} owned={myCity.owned} balance={me.wallet.balance} onBuy={buy} />}
        {tab === 'studio' && <Studio me={me} onChange={refresh} notify={notify} onPlace={startPlacing} />}
        {tab === 'duels' && <DuelsPanel me={me} board={board} duels={duels} onChange={refresh} notify={notify} />}
        {tab === 'board' && <Leaderboard refreshKey={tick} board={board} me={me} onVisit={visit} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
