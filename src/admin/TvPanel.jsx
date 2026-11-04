import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Lightbulb, Megaphone, RefreshCw, Star, Trash2, Tv, X } from 'lucide-react';
import { adminApi } from '../api.js';
import Avatar from '../Avatar.jsx';

const tvLink = (token) => `${window.location.origin}${window.location.pathname}#/tv?k=${token}`;
const formatWhen = (iso) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const ANNOUNCEMENT_MAX = 120;
const IDEAS = ['🎉 ברכות ל', '🏆 כל הכבוד ל', '🎂 יום הולדת שמח ל', '📢 תזכורת: '];

// Messages the admin writes for the office TV: they run in the ticker, and "featured"
// ones also get a big slide on the main screen.
function Announcements() {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [featured, setFeatured] = useState(true);
  const [duration, setDuration] = useState('today');
  const [error, setError] = useState('');

  const load = useCallback(() => adminApi.get('/announcements').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const add = (e) => {
    e.preventDefault();
    adminApi.post('/announcements', { text, featured, duration })
      .then(() => { setText(''); setError(''); load(); })
      .catch((err) => setError(err.message));
  };
  const toggle = (a) => adminApi.patch(`/announcements/${a.id}`, { featured: !a.featured }).then(load);
  const remove = (a) => adminApi.del(`/announcements/${a.id}`).then(load);

  const active = list.filter((a) => a.active);
  const expired = list.filter((a) => !a.active).slice(0, 5);

  return (
    <div className="card">
      <h3 className="title-with-icon"><Megaphone size={16} /> הודעות על המסך</h3>
      <p className="muted small">משפטים שלך שרצים בפס התחתון של הטלוויזיה. הודעה "מודגשת" מקבלת גם מסך גדול משלה בין המסכים המתחלפים, עם חגיגה.</p>
      <form className="announce-form" onSubmit={add}>
        <div className="row wrap">
          {IDEAS.map((idea) => (
            <button type="button" key={idea} className="chip-btn" onClick={() => setText(idea)}>{idea.trim()}</button>
          ))}
        </div>
        <input
          maxLength={ANNOUNCEMENT_MAX}
          placeholder="למשל: 🎉 ברכות לחני שמצאה היום באג מטורף ברכיב הקליטה!"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row wrap announce-options">
          <label className="check">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            <Star size={14} /> להדגיש גם במסך הראשי
          </label>
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="today">רק היום</option>
            <option value="forever">עד שאמחק</option>
          </select>
          <span className="muted small">{text.length}/{ANNOUNCEMENT_MAX}</span>
          <button className="primary" type="submit" disabled={!text.trim()}><Megaphone size={15} /> הצג על המסך</button>
        </div>
        {error && <span className="msg-error">{error}</span>}
      </form>

      {active.map((a) => (
        <div className="bonus-row" key={a.id}>
          <span>{a.featured ? '⭐' : '📢'}</span>
          <div className="bonus-row-main">
            <b>{a.text}</b>
            <span className="muted small">{a.until ? 'רק היום' : 'עד שתמחק'}{a.featured ? ' · מודגשת במסך הראשי' : ' · רק בפס התחתון'}</span>
          </div>
          <button className="ghost" onClick={() => toggle(a)} title={a.featured ? 'הפסק להדגיש' : 'הדגש במסך הראשי'}>
            <Star size={15} fill={a.featured ? 'currentColor' : 'none'} />
          </button>
          <button className="ghost danger icon-btn" onClick={() => remove(a)} aria-label="מחק הודעה"><Trash2 size={15} /></button>
        </div>
      ))}
      {expired.length > 0 && (
        <details className="decided">
          <summary className="muted small">הודעות שנגמרו</summary>
          {expired.map((a) => (
            <div className="bonus-row" key={a.id}>
              <span className="muted">{a.text}</span>
              <button className="ghost danger icon-btn" onClick={() => remove(a)} aria-label="מחק הודעה"><Trash2 size={14} /></button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

const FACT_MAX = 140;
const FACT_IDEAS = [
  'יש לנו שני אנשים שקוראים להם יעקב בצוות',
  'הקוד הכי ישן במערכת נכתב ב-',
  'הצוות שותה ביום בערך ___ כוסות קפה',
  'מי שהכי הרבה זמן בצוות הוא ',
];

// "Did you know?" facts about the team. The TV shows them as big slides, between
// facts the game finds by itself (most popular component, bullseye guesses...).
function Facts() {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => adminApi.get('/facts').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const add = (e) => {
    e.preventDefault();
    adminApi.post('/facts', { text })
      .then(() => { setText(''); setError(''); load(); })
      .catch((err) => setError(err.message));
  };
  const remove = (f) => adminApi.del(`/facts/${f.id}`).then(load);

  return (
    <div className="card">
      <h3 className="title-with-icon"><Lightbulb size={16} /> הידעת? עובדות על הצוות</h3>
      <p className="muted small">עובדות משעשעות על הצוות שיקפצו בטלוויזיה כמסך "הידעת?" גדול. המשחק גם מוסיף עובדות משלו מתוך הנתונים (הרכיב הכי פופולרי, ניחושים בול, שמות כפולים בצוות ועוד).</p>
      <form className="announce-form" onSubmit={add}>
        <div className="row wrap">
          {FACT_IDEAS.map((idea) => (
            <button type="button" key={idea} className="chip-btn" onClick={() => setText(idea)}>{idea.length > 26 ? `${idea.slice(0, 26)}...` : idea}</button>
          ))}
        </div>
        <input maxLength={FACT_MAX} placeholder="למשל: יש לנו שני אנשים שקוראים להם יעקב בצוות" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row wrap announce-options">
          <span className="muted small">{text.length}/{FACT_MAX}</span>
          <button className="primary" type="submit" disabled={!text.trim()}><Lightbulb size={15} /> הוסף לטלוויזיה</button>
        </div>
        {error && <span className="msg-error">{error}</span>}
      </form>
      {list.map((f) => (
        <div className="bonus-row" key={f.id}>
          <span>💡</span>
          <div className="bonus-row-main"><b>{f.text}</b></div>
          <button className="ghost danger icon-btn" onClick={() => remove(f)} aria-label="מחק עובדה"><Trash2 size={15} /></button>
        </div>
      ))}
      {!list.length && <p className="muted small">עוד לא הוספת עובדות.</p>}
    </div>
  );
}

export default function TvPanel({ tvToken, onChange }) {
  const [token, setToken] = useState(tvToken);
  const [billboards, setBillboards] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => adminApi.get('/billboards').then(setBillboards), []);
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

      <Announcements />

      <Facts />

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
    </div>
  );
}
