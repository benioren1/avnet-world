import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, History, Undo2 } from 'lucide-react';
import { adminApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';

const AMOUNTS = [50, 100, 200, 500];
const REASONS = [
  'טיפל בתקלה בפרודקשן',
  'פתר באג קשה',
  'עזר לחבר צוות',
  'שיפר ביצועים',
  'כתב תיעוד',
];

const formatWhen = (iso) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

// Lets the admin reward real work (incidents, fixes) with game coins.
export default function BonusPanel({ players }) {
  const [playerId, setPlayerId] = useState('');
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(null); // { text, kind: 'ok' | 'error' }

  const active = players.filter((p) => p.active !== false);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const loadHistory = useCallback(() => adminApi.get('/bonuses').then(setHistory), []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const give = async (e) => {
    e.preventDefault();
    if (!playerId) return setMsg({ text: 'בחר למי הבונוס', kind: 'error' });
    if (!reason.trim()) return setMsg({ text: 'כתוב על מה הבונוס', kind: 'error' });
    try {
      await adminApi.post(`/players/${playerId}/bonus`, { amount: Number(amount), reason: reason.trim() });
      setMsg({ text: `🏅 ${byId[playerId].name} קיבל/ה ${Number(amount).toLocaleString()} דינרים. זה יופיע לכל הצוות בפיד`, kind: 'ok' });
      setReason('');
      setPlayerId('');
      loadHistory();
    } catch (err) {
      setMsg({ text: err.message, kind: 'error' });
    }
  };

  const cancel = async (b) => {
    if (!window.confirm(`לבטל את הבונוס של ${byId[b.playerId]?.name} (${b.points} דינרים)? הסכום יירד מהיתרה שלו.`)) return;
    try {
      const res = await adminApi.del(`/bonuses/${b.id}`);
      setMsg({
        text: res.negative ? `הבונוס בוטל. שים לב: ${byId[b.playerId]?.name} כבר הוציא את הדינרים והיתרה שלו במינוס` : 'הבונוס בוטל',
        kind: res.negative ? 'error' : 'ok',
      });
      loadHistory();
    } catch (err) {
      setMsg({ text: err.message, kind: 'error' });
    }
  };

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <h2 className="title-with-icon"><Gift size={20} className="accent" /> בונוסים</h2>
      </div>
      <p className="muted">מישהו טיפל בתקלה או פתר משהו? תן לו בונוס בדינרים. הוא יוכל לקנות בהם רכיבים, וכל הצוות יראה בפיד על מה קיבל אותו.</p>

      <form className="card bonus-form" onSubmit={give}>
        <div className="field-label">למי?</div>
        <div className="bonus-players">
          {active.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`bonus-player${playerId === p.id ? ' selected' : ''}`}
              onClick={() => setPlayerId(p.id)}
            >
              <Avatar name={p.name} photo={p.photo} size={40} />
              <span>{p.name}</span>
            </button>
          ))}
          {!active.length && <span className="muted">עוד אין שחקנים. הוסף אותם בלשונית "שחקנים".</span>}
        </div>

        <div className="field-label">כמה?</div>
        <div className="row wrap">
          {AMOUNTS.map((a) => (
            <button type="button" key={a} className={`chip-btn${Number(amount) === a ? ' selected' : ''}`} onClick={() => setAmount(a)}>
              <Coin value={a} size={13} />
            </button>
          ))}
          <input
            className="amount-input"
            type="number"
            min="1"
            max="10000"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="סכום אחר"
          />
        </div>

        <div className="field-label">על מה?</div>
        <div className="row wrap">
          {REASONS.map((r) => (
            <button type="button" key={r} className={`chip-btn${reason === r ? ' selected' : ''}`} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
        <input placeholder="למשל: טיפל בנפילת קולט ה-FTP בלילה" value={reason} onChange={(e) => setReason(e.target.value)} />

        <div className="bonus-submit">
          {msg && <span className={msg.kind === 'error' ? 'msg-error' : 'msg-ok'}>{msg.text}</span>}
          <button className="primary" type="submit"><Gift size={16} /> תן בונוס</button>
        </div>
      </form>

      <div className="card">
        <h3 className="title-with-icon"><History size={16} /> בונוסים שניתנו</h3>
        {!history.length && <p className="muted">עוד לא ניתנו בונוסים.</p>}
        <div className="bonus-history">
          {history.map((b) => {
            const p = byId[b.playerId];
            return (
              <div className="bonus-row" key={b.id}>
                <Avatar name={p?.name} photo={p?.photo} size={30} />
                <div className="bonus-row-main">
                  <b>{p?.name || 'שחקן שנמחק'}</b>
                  <span className="muted small">{b.reason} · {formatWhen(b.at)}</span>
                </div>
                <Coin value={b.points} size={14} />
                <button className="ghost icon-btn" title="בטל בונוס" aria-label="בטל בונוס" onClick={() => cancel(b)}>
                  <Undo2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
