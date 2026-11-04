import { useState } from 'react';
import { Check, Lock, RotateCcw, Swords, X } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';
import { useFx } from '../fx/GameFx.jsx';

const YESNO = { 1: 'כן', 0: 'לא' };
const showValue = (kind, v) => (kind === 'yesno' ? YESNO[v] : Number(v).toLocaleString());
const STAKES = [20, 50, 100, 200];
const IDEAS = [
  { kind: 'number', text: 'כמה תקלות יהיו היום?' },
  { kind: 'number', text: 'כמה דקות ייקח ה-build הבא?' },
  { kind: 'number', text: 'כמה PR-ים ימוזגו היום?' },
  { kind: 'yesno', text: 'הדיפלוי היום יעבור בלי תקלה?' },
  { kind: 'yesno', text: 'הבאג הפתוח ייסגר היום?' },
];

// One bet, from the point of view of the player looking at it.
function DuelCard({ d, meId, onAct }) {
  const them = d.iAmChallenger ? d.target : d.by;
  const won = d.status === 'resolved' && d.winner === meId;
  const lost = d.status === 'resolved' && d.winner && d.winner !== meId;
  const status = {
    pending: d.iAmChallenger ? `⏳ מחכה ש${them.name} יקבל/תקבל` : '',
    active: '⚔️ בתוקף. ראש הצוות מכריע בסוף היום',
    resolved: won ? `🏆 ניצחת! +${d.stake * 2} דינרים` : lost ? `😅 ${them.name} ניצח/ה הפעם` : '🤝 תיקו, הכסף חזר',
    declined: `${them.name} סירב/ה. הכסף חזר אליך`,
    expired: 'לא התקבלה בזמן. הכסף חזר',
    cancelled: 'בוטלה. הכסף חזר',
  }[d.status];

  return (
    <div className={`card duel-card${won ? ' won' : ''}${lost ? ' lost' : ''}`}>
      <div className="duel-question">"{d.question}"</div>
      <div className="duel-sides">
        <span className="duel-side">
          <Avatar name="אני" size={28} /> אתה: <b>{d.myGuess === null || d.myGuess === undefined ? '—' : showValue(d.kind, d.myGuess)}</b>
        </span>
        <span className="vs">מול</span>
        <span className="duel-side">
          <Avatar name={them.name} photo={them.photo} size={28} /> {them.name}:
          <b>{d.theirGuess === null || d.theirGuess === undefined ? <Lock size={13} /> : showValue(d.kind, d.theirGuess)}</b>
        </span>
      </div>
      <div className="duel-foot">
        <span className="muted small">{status}</span>
        {d.status === 'resolved' && d.answer !== null && <span className="small">התשובה: <b>{showValue(d.kind, d.answer)}</b></span>}
        <Coin value={d.stake * 2} size={13} />
        {d.status === 'pending' && d.iAmChallenger && (
          <button className="ghost" onClick={() => onAct(playerApi.post(`/duels/${d.id}/withdraw`), 'ההתערבות בוטלה והכסף חזר')}>בטל</button>
        )}
      </div>
    </div>
  );
}

function Invitation({ d, onAct, balance }) {
  const [guess, setGuess] = useState('');
  const { confirm, flyCoins } = useFx();
  const accept = async () => {
    if (d.kind === 'number' && guess === '') return;
    const ok = await confirm({
      icon: '🤝',
      title: `לקבל את האתגר של ${d.by.name}?`,
      body: d.kind === 'yesno' ? `אתה על "${YESNO[1 - d.theirGuess]}". המנצח לוקח ${d.stake * 2}.` : `הניחוש שלך: ${Number(guess).toLocaleString()}. המנצח לוקח ${d.stake * 2}.`,
      price: d.stake, priceLabel: 'אתה שם', balance, okLabel: 'מקבל!',
    });
    if (!ok) return;
    if (await onAct(playerApi.post(`/duels/${d.id}/accept`, { guess }), '🤝 קיבלת את האתגר! בהצלחה')) flyCoins();
  };
  return (
    <div className="card duel-invite">
      <div className="duel-invite-head">
        <Avatar name={d.by.name} photo={d.by.photo} size={40} />
        <div>
          <b>{d.by.name} מאתגר/ת אותך!</b>
          <div className="duel-question">"{d.question}"</div>
        </div>
        <span className="stake-pill">כל אחד שם <Coin value={d.stake} size={13} /></span>
      </div>
      {d.kind === 'yesno' ? (
        <p className="small">{d.by.name} אומר/ת <b>{YESNO[d.theirGuess]}</b>, אז אתה תהיה על <b>{YESNO[1 - d.theirGuess]}</b>.</p>
      ) : (
        <div className="row">
          <input type="number" min="0" placeholder="הניחוש שלך (בסוד)" value={guess} onChange={(e) => setGuess(e.target.value)} />
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={accept} disabled={d.kind === 'number' && guess === ''}><Check size={15} /> מקבל את האתגר</button>
        <button className="ghost" onClick={() => onAct(playerApi.post(`/duels/${d.id}/decline`), 'סירבת. אולי בפעם הבאה')}><X size={15} /> לא הפעם</button>
      </div>
    </div>
  );
}

export default function DuelsPanel({ me, board, duels, onChange, notify }) {
  const meId = me.player.id;
  const [form, setForm] = useState({ targetId: '', question: '', kind: 'number', stake: 50, guess: '' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const { rules, record } = duels;

  const { confirm, flyCoins } = useFx();
  // Returns true when the server said yes, so a stake can fly its coins.
  const act = async (promise, ok) => {
    try {
      await promise;
      if (ok) notify(ok);
      await onChange();
      return true;
    } catch (e) {
      notify(`❌ ${e.message}`);
      return false;
    }
  };

  const invitations = duels.today.filter((d) => !d.iAmChallenger && d.status === 'pending');
  const mine = duels.today.filter((d) => !(!d.iAmChallenger && d.status === 'pending'));
  const opponents = board.rows.filter((r) => r.id !== meId);
  const target = opponents.find((r) => r.id === form.targetId);
  const canCreate = !duels.busy && !rules.lockPassed;

  const create = async (e) => {
    e.preventDefault();
    if (!form.targetId || !form.question.trim() || form.guess === '') return notify('❌ בחר יריב, כתוב שאלה והכנס את הניחוש שלך');
    const ok = await confirm({
      icon: '⚔️', title: `לאתגר את ${target.name}?`, body: `"${form.question.trim()}" · הסכום נעול עד ההכרעה, המנצח לוקח ${form.stake * 2}.`,
      price: form.stake, priceLabel: 'אתה שם', balance: me.wallet.balance, okLabel: 'שלח אתגר',
    });
    if (!ok) return;
    if (await act(playerApi.post('/duels', form).then(() => set({ question: '', guess: '', targetId: '' })), `⚔️ האתגר נשלח ל${target.name}!`)) flyCoins();
  };

  const revenge = (d) => {
    const them = d.iAmChallenger ? d.target : d.by;
    set({ targetId: them.id });
    document.querySelector('.duel-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <div>
          <h2 className="title-with-icon"><Swords size={20} className="accent" /> התערבויות</h2>
          <span className="muted small">אתה מול עמית אחד, על שאלה שאתם ממציאים. ראש הצוות נותן את התשובה בסוף היום, והקרוב יותר לוקח את הקופה.</span>
        </div>
        <span className="record-pill" title="ניצחונות - הפסדים">⚔️ {record.wins}-{record.losses}{record.ties ? ` (${record.ties} תיקו)` : ''}</span>
      </div>

      {invitations.map((d) => <Invitation key={d.id} d={d} onAct={act} balance={me.wallet.balance} />)}
      {mine.map((d) => <DuelCard key={d.id} d={d} meId={meId} onAct={act} />)}

      {canCreate ? (
        <form className="card duel-form" onSubmit={create}>
          <h3 className="title-with-icon"><Swords size={16} /> אתגר מישהו</h3>

          <div className="field-label">מול מי?</div>
          <div className="bonus-players">
            {opponents.map((r) => (
              <button
                type="button"
                key={r.id}
                className={`bonus-player${form.targetId === r.id ? ' selected' : ''}`}
                disabled={r.balance < form.stake}
                title={r.balance < form.stake ? `ל${r.name} אין מספיק דינרים לסכום הזה` : ''}
                onClick={() => set({ targetId: r.id })}
              >
                <Avatar name={r.name} photo={r.photo} size={36} frame={r.frame} />
                <span>{r.name}</span>
              </button>
            ))}
          </div>

          <div className="field-label">על מה מתערבים?</div>
          <div className="kind-toggle">
            <button type="button" className={`chip-btn${form.kind === 'number' ? ' selected' : ''}`} onClick={() => set({ kind: 'number', guess: '' })}>🔢 מספר</button>
            <button type="button" className={`chip-btn${form.kind === 'yesno' ? ' selected' : ''}`} onClick={() => set({ kind: 'yesno', guess: '' })}>✅ כן/לא</button>
          </div>
          <div className="row wrap">
            {IDEAS.filter((i) => i.kind === form.kind).map((i) => (
              <button type="button" key={i.text} className="chip" onClick={() => set({ question: i.text })}>{i.text}</button>
            ))}
          </div>
          <input maxLength={rules.maxChars} placeholder="למשל: כמה תקלות יהיו היום?" value={form.question} onChange={(e) => set({ question: e.target.value })} />

          <div className="field-label">{form.kind === 'yesno' ? 'מה אתה אומר?' : 'הניחוש שלך (נשאר בסוד עד ההכרעה)'}</div>
          {form.kind === 'yesno' ? (
            <div className="row">
              <button type="button" className={`chip-btn${form.guess === 1 ? ' selected yes' : ''}`} onClick={() => set({ guess: 1 })}>✅ כן</button>
              <button type="button" className={`chip-btn${form.guess === 0 ? ' selected no' : ''}`} onClick={() => set({ guess: 0 })}>❌ לא</button>
              <span className="muted small">{target ? `${target.name} יהיה/תהיה על הצד השני` : 'היריב יהיה על הצד השני'}</span>
            </div>
          ) : (
            <input type="number" min="0" placeholder="הניחוש שלך" value={form.guess} onChange={(e) => set({ guess: e.target.value })} />
          )}

          <div className="field-label">כמה כל אחד שם?</div>
          <div className="row wrap">
            {STAKES.map((s) => (
              <button type="button" key={s} className={`chip-btn${form.stake === s ? ' selected' : ''}`} disabled={me.wallet.balance < s} onClick={() => set({ stake: s })}>
                <Coin value={s} size={12} />
              </button>
            ))}
            <span className="muted small">המנצח לוקח {form.stake * 2}</span>
          </div>

          <div className="bonus-submit">
            <button className="primary" type="submit"><Swords size={16} /> שלח אתגר</button>
          </div>
        </form>
      ) : (
        <div className="card muted small">
          {rules.lockPassed
            ? `פתיחת התערבויות חדשות נסגרה ב-${rules.lockTime}. חוזרים מחר בבוקר ⚔️`
            : invitations.length
              ? '☝️ יש לך הזמנה שמחכה לתשובה. אם תסרב, תוכל לאתגר מישהו אחר.'
              : 'כבר יש לך התערבות היום. אפשר אחת ביום, כדי שזה יישאר מיוחד.'}
        </div>
      )}

      {duels.history.length > 0 && (
        <div className="card">
          <h3>היסטוריה</h3>
          {duels.history.map((d) => {
            const them = d.iAmChallenger ? d.target : d.by;
            const result = d.winner === meId ? '🏆' : d.winner ? '😅' : '🤝';
            return (
              <div className="bonus-row" key={d.id}>
                <span>{result}</span>
                <Avatar name={them.name} photo={them.photo} size={28} />
                <div className="bonus-row-main">
                  <span>מול <b>{them.name}</b>: "{d.question}"</span>
                  <span className="muted small">{new Date(`${d.date}T12:00:00`).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} · התשובה {showValue(d.kind, d.answer)}</span>
                </div>
                {d.winner && d.winner !== meId && canCreate && (
                  <button className="ghost" onClick={() => revenge(d)}><RotateCcw size={14} /> אתגר בחזרה</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
