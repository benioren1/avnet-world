import { Users } from 'lucide-react';
import { useState } from 'react';
import { adminApi, readToken, resizePhoto, storeToken } from '../api.js';
import Avatar from '../Avatar.jsx';

const playerLink = (token) => `${window.location.origin}${window.location.pathname}#/play?t=${token}`;

function PhotoPicker({ onPick, children }) {
  return (
    <label className="photo-picker" title="העלה תמונה">
      {children}
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(await resizePhoto(file));
        }}
      />
    </label>
  );
}

export default function PlayersPanel({ players, onChange }) {
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const run = (p) => p.then(onChange).catch((e) => flash(`❌ ${e.message}`));

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(adminApi.post('/players', { name, photo }).then(() => { setName(''); setPhoto(''); }));
  };

  const copyLink = async (p) => {
    try {
      await navigator.clipboard.writeText(playerLink(p.token));
      flash(`🔗 הקישור של ${p.name} הועתק`);
    } catch {
      window.prompt('העתק את הקישור:', playerLink(p.token));
    }
  };

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <h2 className="title-with-icon"><Users size={20} className="accent" /> שחקנים <span className="count-pill">{players.length}</span></h2>
        {msg && <span className="flash">{msg}</span>}
      </div>
      <p className="muted">לכל שחקן יש קישור אישי. שלח לכל אחד את הקישור שלו, והוא נכנס דרכו בלי סיסמה. אם קישור דלף, 🔄 מבטל את הישן. גם אתה רוצה לשחק? הוסף את עצמך ולחץ "🙋 זה אני".</p>

      <form className="card add-player" onSubmit={add}>
        <PhotoPicker onPick={setPhoto}>
          <Avatar name={name || '+'} photo={photo} size={48} />
        </PhotoPicker>
        <input placeholder="שם השחקן" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" type="submit">+ הוסף שחקן</button>
      </form>

      <div className="player-list">
        {players.map((p) => (
          <div className={`card player-row${p.active === false ? ' inactive' : ''}`} key={p.id}>
            <PhotoPicker onPick={(ph) => run(adminApi.patch(`/players/${p.id}`, { photo: ph }))}>
              <Avatar name={p.name} photo={p.photo} size={48} />
            </PhotoPicker>
            <input
              defaultValue={p.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && run(adminApi.patch(`/players/${p.id}`, { name: e.target.value.trim() }))}
            />
            <button onClick={() => copyLink(p)}>🔗 העתק קישור</button>
            {readToken('player') === p.token ? (
              <span className="me-badge">🙋 זה אתה</span>
            ) : (
              <button
                className="ghost"
                title="מחבר את הדפדפן הזה כשחקן הזה, כדי שתוכל לשחק בעצמך"
                onClick={() => { storeToken('player', p.token); flash(`🙋 הדפדפן הזה מחובר עכשיו כ-${p.name}`); onChange(); }}
              >
                🙋 זה אני
              </button>
            )}
            <button
              className="ghost"
              title="מבטל את הקישור הישן ויוצר חדש"
              onClick={() => window.confirm(`ליצור קישור חדש ל-${p.name}? הקישור הישן יפסיק לעבוד.`) && run(adminApi.patch(`/players/${p.id}`, { resetToken: true }))}
            >
              🔄
            </button>
            <button className="ghost" onClick={() => run(adminApi.patch(`/players/${p.id}`, { active: p.active === false }))}>
              {p.active === false ? '▶️ הפעל' : '⏸️ השבת'}
            </button>
            <button
              className="ghost danger"
              onClick={() => window.confirm(`למחוק את ${p.name} וכל ההיסטוריה שלו?`) && run(adminApi.del(`/players/${p.id}`))}
            >
              🗑️
            </button>
          </div>
        ))}
        {!players.length && <p className="muted center pad">עוד אין שחקנים. הוסף את הראשון למעלה ☝️</p>}
      </div>
    </div>
  );
}
