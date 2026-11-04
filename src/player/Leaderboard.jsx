import { useEffect, useState } from 'react';
import { Activity, Heart, Laugh, Star, Trophy, X } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דק'`;
  if (min < 60 * 24) return `לפני ${Math.round(min / 60)} שע'`;
  return `לפני ${Math.round(min / 1440)} ימים`;
}

// Picking a prank for a teammate. The feed shows it anonymously.
function PrankDialog({ target, me, onClose, onDone, notify }) {
  const { catalog } = me;
  const left = catalog.maxPranksPerDay - me.pranksToday;
  const send = async (p) => {
    try {
      await playerApi.post('/pranks', { targetId: target.id, type: p.id });
      notify(`${p.emoji} נשלח! ${target.name} לא יודע/ת שזה אתה 🤫`);
      onDone();
      onClose();
    } catch (e) {
      notify(`❌ ${e.message}`);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2 className="title-with-icon"><Laugh size={20} className="warn" /> מתיחה ל{target.name}</h2>
          <button className="ghost icon-btn" onClick={onClose} aria-label="סגור"><X size={16} /></button>
        </div>
        <p className="muted small">למשך {catalog.prankHours} שעות. בפיד זה יופיע בלי השם שלך. נשארו לך {left} מתיחות היום.</p>
        <div className="prank-list">
          {catalog.pranks.map((p) => (
            <button key={p.id} className="prank-option" disabled={left <= 0 || me.wallet.balance < p.price} onClick={() => send(p)}>
              <span className="prank-emoji">{p.emoji}</span>
              <span>{p.label}</span>
              <Coin value={p.price} size={12} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard({ board, me, onVisit, onChange, notify }) {
  const [feed, setFeed] = useState([]);
  const [prankTarget, setPrankTarget] = useState(null);
  useEffect(() => { playerApi.get('/feed').then(setFeed).catch(() => {}); }, []);

  const meId = me.player.id;
  const builders = board.rows.filter((r) => r.value > 0);
  const podium = builders.slice(0, 3);
  const todayTop = [...board.rows].sort((a, b) => b.todayPoints - a.todayPoints)[0];
  const pranksOn = me.rules.pranksEnabled;

  return (
    <div className="board-layout">
      <div className="page-panel">
        <h2 className="title-with-icon"><Trophy size={20} className="warn" /> טבלת האדריכלים</h2>

        {me.vote.open && (
          <div className="card vote-banner">
            <Heart size={18} className="pink" /> היום מצביעים על <b>העיר היפה של השבוע</b>! בקר בעיר שאהבת ולחץ "הצבע".
            {me.vote.myVote && <span className="muted small"> (כבר הצבעת, אפשר לשנות)</span>}
          </div>
        )}

        {podium.length > 0 ? (
          <div className="podium">
            {[podium[1], podium[0], podium[2]].map((r, i) => r && (
              <div key={r.id} className={`podium-spot p${[2, 1, 3][i]}`} onClick={() => onVisit(r.id)}>
                <Avatar name={r.name} photo={r.photo} size={[64, 84, 56][i]} crown={i === 1} frame={r.frame} prank={r.prank} />
                <b>{r.name}</b>
                <Coin value={r.value} />
                <div className="podium-block">{MEDALS[[1, 0, 2][i]]}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card empty-state">
            <Trophy size={32} className="muted" />
            <p>עוד אף אחד לא בנה. מי יהיה הראשון? 🏗️</p>
          </div>
        )}

        {todayTop?.todayPoints > 0 && (
          <div className="card today-star">
            <Star size={16} className="warn" /> החזאי של היום: <Avatar name={todayTop.name} photo={todayTop.photo} size={24} /> <b>{todayTop.name}</b> עם {todayTop.todayPoints} נקודות
          </div>
        )}

        <div className="table-scroll">
          <table className="board">
            <thead>
              <tr><th>#</th><th>שחקן</th><th>שווי העיר</th><th>כיסוי</th><th>דינרים</th><th>דיוק ממוצע</th><th>היום</th><th /></tr>
            </thead>
            <tbody>
              {board.rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={r.id === meId ? 'me' : ''}
                  onClick={() => onVisit(r.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onVisit(r.id)}
                  tabIndex={0}
                  title="לחץ כדי לבקר בעיר"
                >
                  <td className="rank">{r.value > 0 ? MEDALS[i] || i + 1 : i + 1}</td>
                  <td>
                    <span className="who">
                      <Avatar name={r.name} photo={r.photo} size={32} crown={i === 0 && r.value > 0} frame={r.frame} prank={r.prank} />
                      <span>
                        {r.name}{r.id === meId && ' (אני)'}
                        {r.cityName && <span className="muted small city-name">{r.cityName}</span>}
                        {r.titles?.length > 0 && <span className="row-titles">{r.titles.map((t) => <span key={t.id} className="title-pill">{t.label}</span>)}</span>}
                      </span>
                    </span>
                  </td>
                  <td><Coin value={r.value} /></td>
                  <td>
                    <div className="mini-progress"><div style={{ width: `${Math.round(r.coverage * 100)}%` }} /></div>
                    <span className="small muted">{r.ownedCount}/{board.totalComponents}</span>
                  </td>
                  <td>{r.balance.toLocaleString()}</td>
                  <td>{r.accuracy === null ? '—' : `${Math.round(r.accuracy)}%`}</td>
                  <td>{r.todayPoints ? `+${r.todayPoints}` : '—'}</td>
                  <td>
                    {pranksOn && r.id !== meId && (
                      <button
                        className="ghost icon-btn"
                        title={`מתיחה ל${r.name}`}
                        aria-label={`מתיחה ל${r.name}`}
                        onClick={(e) => { e.stopPropagation(); setPrankTarget(r); }}
                      >
                        <Laugh size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">הדירוג לפי שווי העיר: מה ששילמת על רכיבים ושדרוגים. עיצוב לא נספר. לחץ על שחקן כדי לבקר בעיר שלו 👀</p>
      </div>

      <aside className="feed">
        <h3 className="title-with-icon"><Activity size={16} className="accent" /> מה קורה</h3>
        {feed.map((e) => (
          <div className={`feed-item feed-${e.type}`} key={e.id}>
            <span>{e.text}</span>
            <span className="muted small">{timeAgo(e.at)}</span>
          </div>
        ))}
        {!feed.length && <p className="muted small">עוד שקט פה...</p>}
      </aside>

      {prankTarget && (
        <PrankDialog target={prankTarget} me={me} onClose={() => setPrankTarget(null)} onDone={onChange} notify={notify} />
      )}
    </div>
  );
}
