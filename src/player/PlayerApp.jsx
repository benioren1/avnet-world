import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Lock, ShieldCheck, ShoppingBag, Sun, Trophy } from 'lucide-react';
import { playerApi, readToken } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';
import TodayPanel from './TodayPanel.jsx';
import CityMap from './CityMap.jsx';
import Shop from './Shop.jsx';
import Leaderboard from './Leaderboard.jsx';

const TABS = [
  ['today', 'היום', Sun],
  ['city', 'העיר שלי', Building2],
  ['shop', 'חנות', ShoppingBag],
  ['board', 'טבלה', Trophy],
];

export default function PlayerApp() {
  const [me, setMe] = useState(null);
  const [architecture, setArchitecture] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('today');
  const [visiting, setVisiting] = useState(null); // { player, owned, value } when viewing someone else's city
  const [justBought, setJustBought] = useState(null);
  const [toast, setToast] = useState('');

  const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const refresh = useCallback(async () => {
    const [m, a, b] = await Promise.all([playerApi.get('/me'), playerApi.get('/architecture'), playerApi.get('/leaderboard')]);
    setMe(m);
    setArchitecture(a);
    setBoard(b);
  }, []);

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);

  const owned = useMemo(() => new Set(me?.wallet.owned || []), [me]);
  const visitingOwned = useMemo(() => new Set(visiting?.owned || []), [visiting]);

  const buy = async (componentId) => {
    try {
      const res = await playerApi.post('/buy', { componentId });
      setMe((m) => ({ ...m, wallet: res.wallet }));
      setJustBought(componentId);
      setTimeout(() => setJustBought(null), 1600);
      const name = architecture.nodes.find((n) => n.id === componentId)?.data.name;
      notify(`🏗️ "${name}" נוסף לעיר שלך!`);
      playerApi.get('/leaderboard').then(setBoard);
    } catch (e) {
      notify(`❌ ${e.message}`);
    }
  };

  const visit = async (playerId) => {
    if (playerId === me.player.id) { setVisiting(null); setTab('city'); return; }
    setVisiting(await playerApi.get(`/players/${playerId}/owned`));
    setTab('city');
  };

  if (error) {
    return (
      <div className="center-page">
        <div className="logo big-logo"><Lock size={26} /></div>
        <h1>צריך קישור אישי</h1>
        <p className="muted">כדי לשחק צריך להיכנס דרך הקישור האישי שקיבלת מראש הצוות.</p>
      </div>
    );
  }
  if (!me || !architecture || !board) return <div className="center-page muted">טוען...</div>;

  const myRank = board.rows.findIndex((r) => r.id === me.player.id) + 1;

  return (
    <div className="app player">
      <header className="topbar">
        <div className="brand">
          <Avatar name={me.player.name} photo={me.player.photo} size={42} crown={myRank === 1} />
          <div>
            <h1>{me.player.name}</h1>
            {myRank > 0 && <span className="rank-pill"><Trophy size={11} /> מקום {myRank} מתוך {board.rows.length}</span>}
          </div>
        </div>
        <nav className="tabs main-tabs">
          {TABS.map(([key, label, Icon]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); if (key === 'city') setVisiting(null); }}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="stats">
          <div><b><Coin value={me.wallet.balance} size={15} /></b><span>יתרה</span></div>
          <div><b>{owned.size}<small className="muted">/{architecture.nodes.length}</small></b><span>רכיבים</span></div>
        </div>
        {/* Only a browser that holds the admin key sees this; the server still checks the key on every admin call. */}
        {readToken('admin') && <a className="switch-link" href="#/admin"><ShieldCheck size={15} /> ניהול</a>}
      </header>

      <main className="player-main">
        {tab === 'today' && <TodayPanel architecture={architecture} meId={me.player.id} onChange={refresh} notify={notify} />}
        {tab === 'city' && (
          <CityMap
            architecture={architecture}
            owned={visiting ? visitingOwned : owned}
            value={visiting ? visiting.value : me.wallet.value}
            visiting={visiting?.player}
            balance={me.wallet.balance}
            justBought={visiting ? null : justBought}
            onBuy={buy}
            onBack={() => setVisiting(null)}
          />
        )}
        {tab === 'shop' && <Shop architecture={architecture} owned={owned} balance={me.wallet.balance} onBuy={buy} />}
        {tab === 'board' && <Leaderboard board={board} meId={me.player.id} onVisit={visit} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
