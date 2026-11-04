import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Laugh, RefreshCw, Tv, X } from 'lucide-react';
import { adminApi } from '../api.js';
import Avatar from '../Avatar.jsx';

const tvLink = (token) => `${window.location.origin}${window.location.pathname}#/tv?k=${token}`;
const formatWhen = (iso) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const PRANK_EMOJI = { hat: '🎩', mustache: '🥸', rain: '🌧️', snail: '🐌' };

export default function TvPanel({ tvToken, onChange }) {
  const [token, setToken] = useState(tvToken);
  const [billboards, setBillboards] = useState([]);
  const [pranks, setPranks] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => Promise.all([
    adminApi.get('/billboards').then(setBillboards),
    adminApi.get('/pranks').then(setPranks),
  ]), []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const decide = (b, action) => adminApi.post(`/billboards/${b.id}/${action}`)
    .then(() => { flash(action === 'approve' ? '✅ השלט יוצג היום בטלוויזיה' : '↩️ השלט נדחה והכסף הוחזר'); load(); onChange(); })
    .catch((e) => flash(`❌ ${e.message}`));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tvLink(token));
      flash('🔗 הקישור הועתק');
    } catch {
      window.prompt('העתק את הקישור:', tvLink(token));
    }
  };

  const reset = () => {
    if (!window.confirm('ליצור קישור טלוויזיה חדש? המסך הנוכחי יפסיק לעבוד עד שתפתח בו את הקישור החדש.')) return;
    adminApi.post('/tv/reset').then((r) => { setToken(r.tvToken); flash('🔄 נוצר קישור חדש'); }).catch((e) => flash(`❌ ${e.message}`));
  };

  const pending = billboards.filter((b) => b.status === 'pending');
  const decided = billboards.filter((b) => b.status !== 'pending').slice(0, 10);

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <h2 className="title-with-icon"><Tv size={20} className="accent" /> טלוויזיה ושלטים</h2>
        {msg && <span className="flash">{msg}</span>}
      </div>

      <div className="card">
        <h3>📺 מסך הטלוויזיה במשרד</h3>
        <p className="muted small">פותחים את הקישור פעם אחת בדפדפן של המחשב שמחובר לטלוויזיה (במסך מלא, F11). הקישור מאפשר רק לצפות, בלי לנחש, לקנות או לנהל.</p>
        <div className="row wrap">
          <button className="primary" onClick={copy}><Copy size={15} /> העתק קישור</button>
          <button onClick={() => window.open(tvLink(token), '_blank')}><ExternalLink size={15} /> פתח לבדיקה</button>
          <button className="ghost" onClick={reset}><RefreshCw size={15} /> קישור חדש</button>
        </div>
      </div>

      <div className="card">
        <h3>שלטים שמחכים לאישור {pending.length > 0 && <span className="count-pill">{pending.length}</span>}</h3>
        {!pending.length && <p className="muted small">אין שלטים שמחכים לך.</p>}
        {pending.map((b) => (
          <div className="bonus-row" key={b.id}>
            <Avatar name={b.playerName} photo={b.playerPhoto} size={32} />
            <div className="bonus-row-main">
              <b>"{b.text}"</b>
              <span className="muted small">{b.playerName} · {formatWhen(b.at)}</span>
            </div>
            <button className="primary" onClick={() => decide(b, 'approve')}><Check size={15} /> אשר</button>
            <button className="ghost danger" onClick={() => decide(b, 'reject')}><X size={15} /> דחה</button>
          </div>
        ))}
        {decided.length > 0 && (
          <details className="decided">
            <summary className="muted small">שלטים קודמים</summary>
            {decided.map((b) => (
              <div className="bonus-row" key={b.id}>
                <span className="small">{b.status === 'approved' ? '✅' : '↩️'}</span>
                <div className="bonus-row-main"><span>"{b.text}"</span><span className="muted small">{b.playerName}</span></div>
              </div>
            ))}
          </details>
        )}
      </div>

      <div className="card">
        <h3 className="title-with-icon"><Laugh size={16} /> יומן מתיחות</h3>
        <p className="muted small">בפיד המתיחות אנונימיות. רק אתה רואה כאן מי עשה מה. אפשר לכבות מתיחות לגמרי בהגדרות.</p>
        {!pranks.length && <p className="muted small">עוד לא היו מתיחות.</p>}
        {pranks.map((p) => (
          <div className="bonus-row" key={p.id}>
            <span>{PRANK_EMOJI[p.type]}</span>
            <div className="bonus-row-main">
              <span><b>{p.byName}</b> ← {p.targetName}</span>
              <span className="muted small">{formatWhen(p.at)}{p.removed ? ' · הוסר' : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
