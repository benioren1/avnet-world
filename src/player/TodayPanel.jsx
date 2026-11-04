import { useCallback, useEffect, useState } from 'react';
import { Bird, Box, Clock, Coffee, HelpCircle, Sparkles, Sun, Target } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';

// "84 accuracy + 20 closest + 10 beat the crowd + 10 early", so nobody wonders why they got 124.
function Breakdown({ g, kind, earlyBonus }) {
  if (typeof g.points !== 'number') return null;
  if (kind === 'yesno') {
    return (
      <span className="breakdown">
        <span>{g.points ? `✅ ${g.points} צדקת` : '❌ לא הפעם'}</span>
        {g.beatCrowd && <span>+30 נגד הזרם 🧠</span>}
        {g.early && earlyBonus > 0 && <span>+{earlyBonus} מוקדם 🐦</span>}
      </span>
    );
  }
  return (
    <span className="breakdown">
      <span>🎯 {g.points} דיוק</span>
      {g.closest && <span>+20 הכי קרוב</span>}
      {g.beatCrowd && <span>+10 ניצחת את הקהל</span>}
      {g.early && earlyBonus > 0 && <span>+{earlyBonus} מוקדם 🐦</span>}
    </span>
  );
}

const YESNO = { 1: 'כן', 0: 'לא' };
const showValue = (kind, v) => (kind === 'yesno' ? YESNO[v] : Number(v).toLocaleString());

function YesNoForm({ onSubmit }) {
  const pick = (v) => window.confirm(`לנעול "${YESNO[v]}"? אי אפשר לשנות אחר כך.`) && onSubmit(v);
  return (
    <div className="guess-form yesno-form">
      <button className="yes-btn" onClick={() => pick(1)}>✅ כן</button>
      <button className="no-btn" onClick={() => pick(0)}>❌ לא</button>
    </div>
  );
}

// Yes/no results: who said yes and who said no, side by side.
function YesNoSplit({ q, meId, earlyBonus }) {
  return (
    <div className="yesno-split">
      {[1, 0].map((side) => {
        const group = q.guesses.filter((g) => g.value === side);
        const right = q.answer === side;
        return (
          <div key={side} className={`yesno-col${q.answer !== undefined ? (right ? ' right' : ' wrong') : ''}`}>
            <div className="yesno-col-head">{side ? '✅ כן' : '❌ לא'} <span className="muted small">({group.length})</span></div>
            <div className="guess-chips">
              {group.map((g) => (
                <span className={`guess-chip${g.playerId === meId ? ' me' : ''}`} key={g.playerId}>
                  <Avatar name={g.name} photo={g.photo} size={22} /> {g.name}
                  {typeof g.points === 'number' && g.points > 0 && <span className="pts">+{g.points + (g.bonus || 0) + (g.early ? earlyBonus : 0)}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HowItWorks({ data }) {
  return (
    <details className="card how-it-works">
      <summary><HelpCircle size={15} /> איך מחשבים את הנקודות?</summary>
      <ul>
        <li>מנחשים מספר אמיתי מהמערכת. ככל שקרובים יותר, מקבלים יותר: עד 2% סטייה = 100, 10% = 80, 25% = 50, 50% = 20.</li>
        <li><b>+20</b> למי שהכי קרוב בשאלה, <b>+10</b> למי שקרוב יותר מהממוצע של הצוות.</li>
        <li>בשאלות <b>כן/לא</b>: תשובה נכונה = <b>50</b>, ואם רוב הצוות טעה ואתה צדקת <b>+30</b> 🧠</li>
        <li><b>+50</b> ליום מושלם: כל השאלות בטווח של 10% (ובכן/לא, תשובה נכונה).</li>
        {data.earlyBonus > 0 && <li><b>+{data.earlyBonus}</b> על כל ניחוש לפני {data.earlyTime} 🐦</li>}
        <li>הניחושים של כולם נחשפים בשעת הנעילה, והתשובה האמיתית בסוף היום.</li>
        <li>בדינרים קונים רכיבים אמיתיים של המערכת, משדרגים אותם ומעצבים את העיר בסטודיו.</li>
      </ul>
    </details>
  );
}

function GuessForm({ q, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="guess-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== '' && window.confirm(`לנעול ניחוש ${Number(value).toLocaleString()}? אי אפשר לשנות אחר כך.`)) onSubmit(value);
      }}
    >
      <input type="number" min="0" placeholder="הניחוש שלך" value={value} onChange={(e) => setValue(e.target.value)} />
      <span className="muted">{q.unit}</span>
      <button className="primary" type="submit" disabled={value === ''}><Target size={15} /> נעל ניחוש</button>
    </form>
  );
}

// Shows everyone's guesses on a number line, with the real answer once published.
function Distribution({ q, meId, earlyBonus }) {
  const values = q.guesses.map((g) => g.value).concat(q.answer ?? []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pos = (v) => (max === min ? 50 : 4 + ((v - min) / (max - min)) * 92);
  const ranked = [...q.guesses].sort((a, b) => ((b.points ?? 0) + (b.bonus ?? 0)) - ((a.points ?? 0) + (a.bonus ?? 0)));

  return (
    <div className="distribution">
      <div className="number-line" dir="ltr">
        {q.guesses.map((g) => (
          <span key={g.playerId} className={`marker${g.playerId === meId ? ' me' : ''}`} style={{ left: `${pos(g.value)}%` }} title={`${g.name}: ${g.value}`}>
            <Avatar name={g.name} photo={g.photo} size={28} />
          </span>
        ))}
        {q.answer !== undefined && (
          <span className="answer-marker" style={{ left: `${pos(q.answer)}%` }}>
            <span>🎯 {q.answer.toLocaleString()}</span>
          </span>
        )}
      </div>
      <div className="guess-chips">
        {ranked.map((g, i) => (
          <span className={`guess-chip${g.playerId === meId ? ' me' : ''}`} key={g.playerId}>
            {q.resolved && i === 0 && '🥇 '}
            <Avatar name={g.name} photo={g.photo} size={22} />
            {g.name}: <b>{g.value.toLocaleString()}</b>
            {typeof g.points === 'number' && (
              <span className="pts" title={`${g.points} דיוק${g.closest ? ' + 20 הכי קרוב' : ''}${g.beatCrowd ? ' + 10 ניצחת את הקהל' : ''}${g.early ? ` + ${earlyBonus} מוקדם` : ''}`}>
                +{g.points + (g.bonus || 0) + (g.early ? earlyBonus : 0)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TodayPanel({ architecture, meId, onChange, notify }) {
  const [data, setData] = useState(null);
  const nodeName = (id) => architecture.nodes.find((n) => n.id === id)?.data.name;

  const load = useCallback(() => playerApi.get('/today').then(setData), []);
  useEffect(() => { load(); }, [load]);

  // On any error (e.g. the question just locked) reload, so the form doesn't stay on screen.
  const guess = (q, value) => playerApi.post('/guesses', { questionId: q.id, value })
    .then((res) => { notify(res.early ? `🎯 הניחוש ננעל! +${res.earlyBonus} ציפור מוקדמת 🐦` : '🎯 הניחוש ננעל! בהצלחה'); })
    .catch((e) => notify(`❌ ${e.message}`))
    .finally(load);

  if (!data) return <div className="muted pad">טוען...</div>;

  const myTotal = data.questions.reduce((s, q) => s + (q.myGuess?.points ?? 0) + (q.myGuess?.bonus ?? 0), 0) + (data.dayBonus || 0);
  const anyResolved = data.questions.some((q) => q.resolved);
  const open = data.questions.filter((q) => !q.locked);
  const nextLock = open.length ? open.map((q) => q.lockTime).sort()[0] : null;
  const answered = data.questions.filter((q) => q.myGuess).length;
  const earlyOpen = data.earlyBonus > 0 && data.now < data.earlyTime && open.some((q) => !q.myGuess);

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <div>
          <h2 className="title-with-icon"><Sun size={20} className="accent" /> התחזיות של היום</h2>
          {data.questions.length > 0 && <span className="muted small">ענית על {answered} מתוך {data.questions.length}</span>}
        </div>
        {nextLock && <span className="lock-pill"><Clock size={13} /> ננעל ב-{nextLock}</span>}
      </div>

      {earlyOpen && (
        <div className="card early-banner">
          <Bird size={18} /> נחש לפני <b>{data.earlyTime}</b> וקבל <b>+{data.earlyBonus}</b> על כל שאלה
        </div>
      )}

      {anyResolved && (
        <div className="card day-summary">
          <Sparkles size={18} className="warn" /> הרווחת היום מתחזיות <Coin value={myTotal} size={16} />
          {data.dayBonus > 0 && <span className="muted small">(כולל בונוסים של ציפור מוקדמת ויום מושלם)</span>}
        </div>
      )}

      <HowItWorks data={data} />

      {!data.questions.length && (
        <div className="card empty-state">
          <Coffee size={36} className="muted" />
          <p>עוד אין שאלות להיום. חזור בעוד קצת!</p>
        </div>
      )}

      {data.questions.map((q, i) => (
        <div className={`card question-card${q.resolved ? ' resolved' : ''}${!q.myGuess && !q.locked ? ' open' : ''}`} key={q.id}>
          <div className="q-top">
            <span className="q-num">{i + 1}</span>
            <div>
              <div className="q-text">{q.text}</div>
              {q.kind === 'yesno' && <span className="tag">✅ כן/לא</span>}
              {q.componentId && <span className="tag"><Box size={11} /> {nodeName(q.componentId)}</span>}
            </div>
          </div>

          {!q.myGuess && !q.locked && (q.kind === 'yesno'
            ? <YesNoForm onSubmit={(v) => guess(q, v).then(onChange)} />
            : <GuessForm q={q} onSubmit={(v) => guess(q, v).then(onChange)} />)}
          {!q.myGuess && q.locked && <p className="muted">⏰ פספסת את השאלה הזו</p>}
          {q.myGuess && (
            <div className="my-guess">
              {q.kind === 'yesno' ? 'ענית: ' : 'הניחוש שלך: '}<b>{showValue(q.kind, q.myGuess.value)}</b> {q.unit}
              {q.myGuess.early && typeof q.myGuess.points !== 'number' && <span className="early-chip">🐦 +{data.earlyBonus}</span>}
              {typeof q.myGuess.points === 'number' && (
                <>
                  <span className="pts big">+<Coin value={q.myGuess.points + (q.myGuess.bonus || 0) + (q.myGuess.early ? data.earlyBonus : 0)} size={14} /></span>
                  <Breakdown g={q.myGuess} kind={q.kind} earlyBonus={data.earlyBonus} />
                </>
              )}
            </div>
          )}

          {!q.locked && (
            <p className="muted small">
              {q.guessCount === 0 ? 'עוד אף אחד לא ניחש. תהיה הראשון!' : q.guessCount === 1 ? 'ניחש אחד עד עכשיו.' : `${q.guessCount} אנשים כבר ניחשו.`}
              {' '}הניחושים ייחשפו ב-{q.lockTime}
            </p>
          )}
          {q.locked && q.guesses?.length > 0 && (q.kind === 'yesno'
            ? <YesNoSplit q={q} meId={meId} earlyBonus={data.earlyBonus} />
            : <Distribution q={q} meId={meId} earlyBonus={data.earlyBonus} />)}
          {q.locked && !q.resolved && <p className="muted small">⏳ מחכים לתשובה האמיתית בסוף היום...</p>}
        </div>
      ))}
    </div>
  );
}
