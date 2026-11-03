import { useEffect, useState } from 'react';
import { playerApi } from '../api.js';
import { Activity, Star, Trophy } from 'lucide-react';
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

export default function Leaderboard({ board, meId, onVisit }) {
  const [feed, setFeed] = useState([]);
  useEffect(() => { playerApi.get('/feed').then(setFeed).catch(() => {}); }, []);

  const podium = board.rows.slice(0, 3);
  const todayTop = [...board.rows].sort((a, b) => b.todayPoints - a.todayPoints)[0];

  return (
    <div className="board-layout">
      <div className="page-panel">
        <h2 className="title-with-icon"><Trophy size={20} className="warn" /> טבלת האדריכלים</h2>

        {podium.length > 0 && (
          <div className="podium">
            {[podium[1], podium[0], podium[2]].map((r, i) => r && (
              <div key={r.id} className={`podium-spot p${[2, 1, 3][i]}`} onClick={() => onVisit(r.id)}>
                <Avatar name={r.name} photo={r.photo} size={[64, 84, 56][i]} crown={i === 1} />
                <b>{r.name}</b>
                <Coin value={r.value} />
                <div className="podium-block">{MEDALS[[1, 0, 2][i]]}</div>
              </div>
            ))}
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
              <tr><th>#</th><th>שחקן</th><th>שווי העיר</th><th>כיסוי</th><th>יתרה</th><th>דיוק ממוצע</th><th>היום</th></tr>
            </thead>
            <tbody>
              {board.rows.map((r, i) => (
                <tr key={r.id} className={r.id === meId ? 'me' : ''} onClick={() => onVisit(r.id)} title="לחץ כדי לבקר בעיר">
                  <td className="rank">{MEDALS[i] || i + 1}</td>
                  <td><span className="who"><Avatar name={r.name} photo={r.photo} size={32} crown={i === 0} /> {r.name}{r.id === meId && ' (אני)'}</span></td>
                  <td><Coin value={r.value} /></td>
                  <td>
                    <div className="mini-progress"><div style={{ width: `${Math.round(r.coverage * 100)}%` }} /></div>
                    <span className="small muted">{r.ownedCount}/{board.totalComponents}</span>
                  </td>
                  <td>{r.balance.toLocaleString()}</td>
                  <td>{r.accuracy === null ? '—' : `${Math.round(r.accuracy)}%`}</td>
                  <td>{r.todayPoints ? `+${r.todayPoints}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">הדירוג לפי שווי העיר (סכום המחירים של הרכיבים שקנית). לחץ על שחקן כדי לבקר בעיר שלו 👀</p>
      </div>

      <aside className="feed">
        <h3 className="title-with-icon"><Activity size={16} className="accent" /> מה קורה</h3>
        {feed.map((e) => (
          <div className="feed-item" key={e.id}>
            <span>{e.text}</span>
            <span className="muted small">{timeAgo(e.at)}</span>
          </div>
        ))}
        {!feed.length && <p className="muted small">עוד שקט פה...</p>}
      </aside>
    </div>
  );
}
