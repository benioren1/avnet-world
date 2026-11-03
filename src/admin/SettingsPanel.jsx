import { Settings } from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '../api.js';

export default function SettingsPanel({ settings, store, onChange }) {
  const [lockTime, setLockTime] = useState(settings.lockTime);
  const [msg, setMsg] = useState('');

  const save = () => adminApi.put('/settings', { lockTime })
    .then(() => { setMsg('✓ נשמר'); onChange(); })
    .catch((e) => setMsg(`❌ ${e.message}`));

  return (
    <div className="page-panel narrow">
      <h2 className="title-with-icon"><Settings size={20} className="accent" /> הגדרות</h2>
      <div className="card form-card">
        <label>
          שעת נעילת ניחושים
          <span className="muted">אחרי השעה הזו אי אפשר לנחש, וכולם רואים את הניחושים של כולם.</span>
          <div className="row">
            <input type="time" value={lockTime} onChange={(e) => setLockTime(e.target.value)} />
            <button className="primary" onClick={save}>שמור</button>
            {msg && <span className="flash">{msg}</span>}
          </div>
        </label>
      </div>
      <div className="card form-card">
        <b>מסד נתונים</b>
        <span className="muted">
          {store === 'mongo'
            ? '🍃 MongoDB (מוגדר דרך MONGO_URL)'
            : '📄 קובץ מקומי data/db.json. כדי לעבור ל-Mongo מגדירים את משתנה הסביבה MONGO_URL ומפעילים מחדש את השרת.'}
        </span>
      </div>
    </div>
  );
}
