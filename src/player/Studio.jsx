import { useCallback, useEffect, useState } from 'react';
import { Check, Palette, PartyPopper, Sparkles, Tag, Trees, Tv } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';

const STATUS = { pending: '⏳ ממתין לאישור', approved: '✅ מוצג היום בטלוויזיה', rejected: '↩️ נדחה, הכסף הוחזר' };

// One row of unlockable options (themes, particle colors, celebrations, frames).
function OptionGrid({ group, items, profile, unlocked, balance, onBuy, onEquip, render }) {
  return (
    <div className="option-grid">
      {items.map((item) => {
        const key = `${group}:${item.id}`;
        const has = !item.price || unlocked.includes(key);
        const active = profile[group] === item.id;
        return (
          <div key={item.id} className={`option${active ? ' active' : ''}`}>
            {render(item)}
            <div className="option-name">{item.label}</div>
            {active ? (
              <span className="option-state"><Check size={13} /> בשימוש</span>
            ) : has ? (
              <button onClick={() => onEquip(group, item.id)}>בחר</button>
            ) : (
              <button className="primary" disabled={balance < item.price} onClick={() => onBuy(key, item)}>
                <Coin value={item.price} size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Studio({ me, onChange, notify, onPlace }) {
  const { profile, unlocked, catalog, wallet } = me;
  const balance = wallet.balance;
  const [names, setNames] = useState({ cityName: profile.cityName, motto: profile.motto });
  const [billboard, setBillboard] = useState('');
  const [myBillboards, setMyBillboards] = useState([]);

  const loadBillboards = useCallback(() => playerApi.get('/billboards/mine').then(setMyBillboards).catch(() => {}), []);
  useEffect(() => { loadBillboards(); }, [loadBillboards]);
  useEffect(() => setNames({ cityName: profile.cityName, motto: profile.motto }), [profile.cityName, profile.motto]);

  const act = async (promise, ok) => {
    try {
      await promise;
      if (ok) notify(ok);
      await onChange();
    } catch (e) {
      notify(`❌ ${e.message}`);
    }
  };

  const buy = (key, item) => {
    if (!window.confirm(`לקנות "${item.label}" ב-${item.price.toLocaleString()} דינרים? תישאר עם ${(balance - item.price).toLocaleString()}`)) return;
    act(playerApi.post('/cosmetics/buy', { key }), `✨ "${item.label}" שלך!`);
  };
  const equip = (group, id) => act(playerApi.post('/profile', { [group]: id }));

  const sendBillboard = (e) => {
    e.preventDefault();
    if (!billboard.trim()) return;
    if (!window.confirm(`לשלוח את השלט לאישור ב-${catalog.billboardPrice} דינרים? אם הוא לא יאושר, הכסף יחזור אליך.`)) return;
    act(playerApi.post('/billboards', { text: billboard }).then(() => { setBillboard(''); loadBillboards(); }), '📺 השלט נשלח לאישור');
  };

  return (
    <div className="page-panel narrow studio">
      <div className="panel-head">
        <h2 className="title-with-icon"><Palette size={20} className="accent" /> סטודיו</h2>
        <span className="balance-pill">יתרה <Coin value={balance} size={16} /></span>
      </div>
      <p className="muted">כאן מעצבים את העיר. העיצוב לא משנה את המקום בטבלה, אבל כל מי שמבקר אצלך רואה אותו, ובימי חמישי מצביעים על העיר היפה של השבוע 🏆</p>

      <section className="card">
        <h3 className="title-with-icon"><Sparkles size={16} /> ערכת נושא לעיר</h3>
        <OptionGrid
          group="theme" items={catalog.themes} profile={profile} unlocked={unlocked} balance={balance} onBuy={buy} onEquip={equip}
          render={(t) => <div className={`theme-swatch swatch-${t.id}`} />}
        />
      </section>

      <section className="card">
        <h3 className="title-with-icon"><Sparkles size={16} /> צבע הנתונים שזורמים בחיבורים</h3>
        <OptionGrid
          group="particle" items={catalog.particles} profile={profile} unlocked={unlocked} balance={balance} onBuy={buy} onEquip={equip}
          render={(p) => <div className="particle-swatch" style={{ '--c': p.color }}><i /><i /><i /></div>}
        />
      </section>

      <section className="card">
        <h3 className="title-with-icon"><PartyPopper size={16} /> חגיגה כשקונים רכיב</h3>
        <OptionGrid
          group="celebration" items={catalog.celebrations} profile={profile} unlocked={unlocked} balance={balance} onBuy={buy} onEquip={equip}
          render={(c) => <div className="celebration-swatch">{{ pulse: '💫', confetti: '🎊', fireworks: '🎆', lightning: '⚡' }[c.id]}</div>}
        />
      </section>

      <section className="card">
        <h3 className="title-with-icon"><Sparkles size={16} /> מסגרת לתמונה בטבלה</h3>
        <OptionGrid
          group="frame" items={catalog.frames} profile={profile} unlocked={unlocked} balance={balance} onBuy={buy} onEquip={equip}
          render={(f) => <Avatar name={me.player.name} photo={me.player.photo} size={44} frame={f.id} />}
        />
      </section>

      <section className="card">
        <h3 className="title-with-icon"><Tag size={16} /> שם ומוטו לעיר</h3>
        {unlocked.includes('naming') ? (
          <form className="naming" onSubmit={(e) => { e.preventDefault(); act(playerApi.post('/profile', names), '🏷️ נשמר'); }}>
            <input maxLength={30} placeholder="שם העיר, למשל: נמל המידע של דני" value={names.cityName} onChange={(e) => setNames({ ...names, cityName: e.target.value })} />
            <input maxLength={60} placeholder="מוטו, למשל: אנחנו לא נופלים בשישי" value={names.motto} onChange={(e) => setNames({ ...names, motto: e.target.value })} />
            <button className="primary" type="submit">שמור</button>
          </form>
        ) : (
          <div className="row">
            <span className="muted">שם משלך לעיר ומוטו שכל מי שמבקר רואה.</span>
            <button className="primary" disabled={balance < catalog.namingPrice} onClick={() => buy('naming', { label: 'שם ומוטו לעיר', price: catalog.namingPrice })}>
              <Coin value={catalog.namingPrice} size={12} />
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="title-with-icon"><Trees size={16} /> קישוטים על המפה</h3>
        <p className="muted small">בוחרים קישוט, לוחצים על המקום במפה, והוא שם. אפשר לגרור קישוטים שכבר הצבת. יש לך {me.decorations.length} קישוטים.</p>
        <div className="option-grid">
          {catalog.decorations.map((d) => (
            <div key={d.id} className="option">
              <div className="deco-swatch">
                {d.id === 'statue' && me.player.photo ? <span className="statue"><img src={me.player.photo} alt="" /><span className="plinth" /></span> : d.emoji}
              </div>
              <div className="option-name">{d.label}</div>
              <button className="primary" disabled={balance < d.price} onClick={() => onPlace(d.id)}>
                <Coin value={d.price} size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="title-with-icon"><Tv size={16} /> שלט על מסך הטלוויזיה</h3>
        <p className="muted small">ההודעה שלך תרוץ יום שלם על המסך במשרד, עם התמונה שלך. ראש הצוות מאשר כל שלט לפני שהוא עולה.</p>
        <form className="billboard-form" onSubmit={sendBillboard}>
          <input
            maxLength={catalog.billboardMaxChars}
            placeholder="למשל: מזל טוב לרוני על החתונה! 💍"
            value={billboard}
            onChange={(e) => setBillboard(e.target.value)}
          />
          <span className="muted small">{billboard.length}/{catalog.billboardMaxChars}</span>
          <button className="primary" type="submit" disabled={!billboard.trim() || balance < catalog.billboardPrice}>
            שלח ב-<Coin value={catalog.billboardPrice} size={12} />
          </button>
        </form>
        {myBillboards.map((b) => (
          <div className="billboard-row" key={b.id}>
            <span>"{b.text}"</span>
            <span className="muted small">{STATUS[b.status]}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
