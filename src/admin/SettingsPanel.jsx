import { useState } from 'react';
import { Bird, Coins, Heart, Pickaxe, Save, Settings, Siren, Sun } from 'lucide-react';
import { adminApi } from '../api.js';

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function Field({ label, hint, children }) {
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}

export default function SettingsPanel({ settings, store, onChange }) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState(null);
  const set = (key) => (e) => setS({ ...s, [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };
  const save = () => adminApi.put('/settings', s)
    .then((next) => { setS(next); flash('ok', '✓ ההגדרות נשמרו'); onChange(); })
    .catch((e) => flash('error', e.message));

  const toggleDay = (d) => setS({ ...s, workDays: s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d].sort() });

  // Once a day: paying now means tonight's automatic payout won't run (and things bought later today earn nothing today).
  const payNow = () => window.confirm('לחלק עכשיו את ההכנסה של היום? החלוקה האוטומטית של הערב לא תרוץ, ומה שיקנו מעכשיו ועד הערב לא יכניס היום.') && adminApi.post('/payout')
    .then((r) => flash('ok', r.already ? 'ההכנסה של היום כבר חולקה' : `💸 חולקו ${r.total.toLocaleString()} דינרים`))
    .catch((e) => flash('error', e.message));
  const closeVote = () => window.confirm('לסגור את ההצבעה של השבוע ולהכריז על המנצח?') && adminApi.post('/vote/close')
    .then((r) => flash('ok', r.already ? 'ההצבעה של השבוע כבר נסגרה' : r.winner ? (r.tie ? `🏆 תיקו! ${r.winner} עם ${r.count} קולות כל אחד` : `🏆 ${r.winner} זכה עם ${r.count} קולות`) : 'לא היו קולות השבוע'))
    .catch((e) => flash('error', e.message));

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <h2 className="title-with-icon"><Settings size={20} className="accent" /> הגדרות</h2>
        <div className="row">
          {msg && <span className={msg.kind === 'error' ? 'msg-error' : 'msg-ok'}>{msg.text}</span>}
          <button className="primary" onClick={save}><Save size={15} /> שמור הכל</button>
        </div>
      </div>

      <section className="card settings-grid">
        <h3 className="title-with-icon"><Sun size={16} /> תחזיות</h3>
        <Field label="שעת נעילת ניחושים" hint="אחרי השעה הזו אי אפשר לנחש, וכולם רואים את הניחושים של כולם. חל על שאלות חדשות.">
          <input type="time" value={s.lockTime} onChange={set('lockTime')} />
        </Field>
        <Field label={<><Bird size={14} /> ציפור מוקדמת: עד שעה</>} hint="ניחוש לפני השעה הזו מקבל בונוס">
          <input type="time" value={s.earlyTime} onChange={set('earlyTime')} />
        </Field>
        <Field label="בונוס לכל ניחוש מוקדם">
          <input type="number" min="0" value={s.earlyBonus} onChange={set('earlyBonus')} />
        </Field>
      </section>

      <section className="card settings-grid">
        <h3 className="title-with-icon"><Pickaxe size={16} /> כרייה בבוקר</h3>
        <Field label="המכרה נפתח"><input type="time" value={s.mineOpen} onChange={set('mineOpen')} /></Field>
        <Field label="המכרה נסגר"><input type="time" value={s.mineClose} onChange={set('mineClose')} /></Field>
        <Field label="סכום בסיס" hint="כל יום ברצף מוסיף 5, עד פי 2 מהבסיס. כורה ראשון +20, ובסיכוי של 5% גוש זהב של 250">
          <input type="number" min="0" value={s.mineBase} onChange={set('mineBase')} />
        </Field>
        <Field label="ימי עבודה" hint="בימים האלה המכרה פתוח וההכנסה היומית מחולקת">
          <div className="day-picker">
            {DAYS.map((d, i) => (
              <button type="button" key={d} className={`chip-btn${s.workDays.includes(i) ? ' selected' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
            ))}
          </div>
        </Field>
      </section>

      <section className="card settings-grid">
        <h3 className="title-with-icon"><Coins size={16} /> הכנסה מרכיבים</h3>
        <Field label="אחוז הכנסה יומי" hint="כל רכיב מכניס כל ערב את האחוז הזה ממה ששולם עליו (רמה 2: פי 1.5, רמה 3: פי 2)">
          <input type="number" min="0" max="50" step="0.5" value={Math.round(s.incomeRate * 1000) / 10} onChange={(e) => setS({ ...s, incomeRate: Number(e.target.value) / 100 })} />
        </Field>
        <Field label="שעת חלוקה"><input type="time" value={s.payoutTime} onChange={set('payoutTime')} /></Field>
        <div className="setting">
          <span className="setting-label">חלוקה ידנית</span>
          <button onClick={payNow}>💸 חלק את ההכנסה של היום עכשיו</button>
          <span className="muted small">פעם אחת ביום בלבד. אם כבר חולק, לא יקרה כלום.</span>
        </div>
      </section>

      <section className="card settings-grid">
        <h3 className="title-with-icon"><Siren size={16} /> תקלות</h3>
        <Field label="בונוס ברירת מחדל למי שטיפל">
          <input type="number" min="0" value={s.incidentBonus} onChange={set('incidentBonus')} />
        </Field>
      </section>

      <section className="card settings-grid">
        <h3 className="title-with-icon"><Heart size={16} /> העיר היפה של השבוע</h3>
        <Field label="יום ההצבעה" hint="ההצבעה נסגרת אוטומטית בשעת החלוקה של אותו יום">
          <select value={s.voteDay} onChange={(e) => setS({ ...s, voteDay: Number(e.target.value) })}>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="פרס לזוכה"><input type="number" min="0" value={s.voteBonus} onChange={set('voteBonus')} /></Field>
        <div className="setting">
          <span className="setting-label">סגירה ידנית</span>
          <button onClick={closeVote}>🏆 סגור את ההצבעה של השבוע עכשיו</button>
        </div>
      </section>

      <div className="card form-card">
        <b>מסד נתונים</b>
        <span className="muted">
          {store === 'mongo'
            ? '🍃 MongoDB (מוגדר דרך MONGO_URL)'
            : '📄 קובץ מקומי data/db.json. כדי לעבור ל-Mongo מגדירים את MONGO_URL בקובץ .env ומפעילים מחדש את השרת.'}
        </span>
      </div>
    </div>
  );
}
