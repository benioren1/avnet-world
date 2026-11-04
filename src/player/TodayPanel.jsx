import { useCallback, useEffect, useRef, useState } from 'react';
import { Bird, Box, Clock, Coffee, HelpCircle, Sparkles, Sun } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';
import HoldButton from '../fx/HoldButton.jsx';
import PerfectDay, { markSeen, readSeen } from '../fx/Celebration.jsx';
import { CountUp, reducedMotion } from '../fx/motion.jsx';
import { play } from '../fx/sound.js';
import '../fx/fx.css';

// "Moment of truth" timeline for one question, in ms from its start slot.
const T = { pin: 750, closest: 1350, count: 1500, countFor: 900, breakdown: 2500, end: 3100 };
const SLOT = 1700; // the next question that resolved at the same time starts this much later
const ms = (v) => `${v}ms`;

// "84 accuracy + 20 closest + 10 beat the crowd + 10 early", so nobody wonders why they got 124.
// `at` (ms) = this breakdown is part of a reveal and opens at that time.
function Breakdown({ g, kind, earlyBonus, at }) {
  if (typeof g.points !== 'number') return null;
  const cls = `breakdown${at !== undefined ? ' fx-breakdown-in' : ''}`;
  const style = at !== undefined ? { '--d': ms(at) } : undefined;
  if (kind === 'yesno') {
    return (
      <span className={cls} style={style}>
        <span>{g.points ? `✅ ${g.points} צדקת` : '❌ לא הפעם'}</span>
        {g.beatCrowd && <span>+30 נגד הזרם 🧠</span>}
        {g.early && earlyBonus > 0 && <span>+{earlyBonus} מוקדם 🐦</span>}
      </span>
    );
  }
  return (
    <span className={cls} style={style}>
      <span>🎯 {g.points} דיוק</span>
      {g.closest && <span className="fx-gold-chip">+20 הכי קרוב</span>}
      {g.beatCrowd && <span>+10 ניצחת את הקהל</span>}
      {g.early && earlyBonus > 0 && <span>+{earlyBonus} מוקדם 🐦</span>}
    </span>
  );
}

const YESNO = { 1: 'כן', 0: 'לא' };
const showValue = (kind, v) => (kind === 'yesno' ? YESNO[v] : Number(v).toLocaleString());
const LOCK_NOTE = '🔒 לוחצים ומחזיקים כדי לנעול. אחרי הנעילה אי אפשר לשנות.';

function YesNoForm({ onSubmit }) {
  return (
    <>
      <div className="guess-form yesno-form">
        <HoldButton className="yes-btn" onHold={() => onSubmit(1)} hint="החזק כדי לנעול כן">✅ כן</HoldButton>
        <HoldButton className="no-btn" onHold={() => onSubmit(0)} hint="החזק כדי לנעול לא">❌ לא</HoldButton>
      </div>
      <p className="muted small fx-lock-note">{LOCK_NOTE}</p>
    </>
  );
}

// Yes/no results: who said yes and who said no, side by side.
function YesNoSplit({ q, meId, earlyBonus, at }) {
  const revealing = at !== undefined;
  return (
    <div className={`yesno-split${revealing ? ' fx-reveal' : ''}`} style={revealing ? { '--d': ms(at + T.pin) } : undefined}>
      {[1, 0].map((side) => {
        const group = q.guesses.filter((g) => g.value === side);
        const right = q.answer === side;
        return (
          <div key={side} className={`yesno-col${q.answer !== undefined ? (right ? ' right' : ' wrong') : ''}`}>
            <div className="yesno-col-head">
              {side ? '✅ כן' : '❌ לא'} <span className="muted small">({group.length})</span>
              {q.answer !== undefined && right && <span className="fx-answer-stamp">🎯 התשובה</span>}
            </div>
            <div className="guess-chips">
              {group.map((g, i) => (
                <span className={`guess-chip${g.playerId === meId ? ' me' : ''}`} key={g.playerId} style={revealing ? { '--d': ms(at + i * 70) } : undefined}>
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
    <>
      {/* Enter in the box does not lock: locking is always a deliberate press-and-hold. */}
      <form className="guess-form" onSubmit={(e) => e.preventDefault()}>
        <input type="number" min="0" placeholder="הניחוש שלך" value={value} onChange={(e) => setValue(e.target.value)} />
        <span className="muted">{q.unit}</span>
        <HoldButton className="primary" disabled={value === ''} onHold={() => onSubmit(value)} hint="החזק כדי לנעול את הניחוש">
          נעל ניחוש
        </HoldButton>
      </form>
      <p className="muted small fx-lock-note">{LOCK_NOTE}</p>
    </>
  );
}

// Shows everyone's guesses on a number line, with the real answer once published.
// `at` (ms) = play the reveal: avatars slide in, the answer pin drops, the closest one flashes gold.
function Distribution({ q, meId, earlyBonus, at }) {
  const revealing = at !== undefined;
  const values = q.guesses.map((g) => g.value).concat(q.answer ?? []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pos = (v) => (max === min ? 50 : 4 + ((v - min) / (max - min)) * 92);
  const ranked = [...q.guesses].sort((a, b) => ((b.points ?? 0) + (b.bonus ?? 0)) - ((a.points ?? 0) + (a.bonus ?? 0)));

  return (
    <div className="distribution">
      <div className={`number-line${revealing ? ' fx-reveal' : ''}`} dir="ltr">
        {q.guesses.map((g, i) => (
          <span
            key={g.playerId}
            className={`marker${g.playerId === meId ? ' me' : ''}${q.resolved && g.closest ? ' fx-closest' : ''}`}
            style={{ left: `${pos(g.value)}%`, ...(revealing && { '--d': ms(at + i * 60), '--d2': ms(at + T.closest) }) }}
            title={`${g.name}: ${g.value}`}
          >
            <Avatar name={g.name} photo={g.photo} size={28} />
          </span>
        ))}
        {q.answer !== undefined && (
          <span className="answer-marker" style={{ left: `${pos(q.answer)}%`, ...(revealing && { '--d': ms(at + T.pin) }) }}>
            <span>🎯 {q.answer.toLocaleString()}</span>
          </span>
        )}
      </div>
      <div className={`guess-chips${revealing ? ' fx-reveal' : ''}`}>
        {ranked.map((g, i) => (
          <span
            className={`guess-chip${g.playerId === meId ? ' me' : ''}${q.resolved && g.closest ? ' fx-closest' : ''}`}
            key={g.playerId}
            style={revealing ? { '--d': ms(at + T.pin + 200 + i * 50), '--d2': ms(at + T.closest) } : undefined}
          >
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

const pointsOf = (g, earlyBonus) => g.points + (g.bonus || 0) + (g.early ? earlyBonus : 0);

// refreshKey changes on every auto-refresh: reload the data, but keep the component (and any
// half-typed guess) mounted.
export default function TodayPanel({ architecture, meId, onChange, notify, refreshKey, celebration }) {
  const [data, setData] = useState(null);
  const [reveal, setReveal] = useState({}); // questionId -> start time (ms after the reveal began)
  const [justLocked, setJustLocked] = useState(null); // question id that shows the "locked" stamp
  const [perfect, setPerfect] = useState(null); // { bonus } while the perfect-day moment shows
  const timers = useRef([]);
  const nodeName = (id) => architecture.nodes.find((n) => n.id === id)?.data.name;

  const load = useCallback(() => playerApi.get('/today').then(setData), []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, wait) => timers.current.push(setTimeout(fn, wait));

  // The first time this browser sees a question with its real answer, play the moment of truth once.
  useEffect(() => {
    if (!data) return;
    const seen = readSeen();
    const fresh = data.questions.filter((q) => q.resolved && !seen.has(q.id) && !(q.id in reveal));
    if (!fresh.length) return;
    markSeen(fresh.map((q) => q.id));
    const quiet = reducedMotion();
    const slots = {};
    fresh.forEach((q, k) => {
      const at = k * SLOT;
      slots[q.id] = at;
      const mine = q.myGuess;
      later(() => play('reveal'), at + T.pin - 350);
      if (mine?.closest && q.kind !== 'yesno') later(() => play('closest'), at + T.closest);
      if (typeof mine?.points === 'number' && pointsOf(mine, data.earlyBonus) > 0) later(() => play('coin'), at + T.count + T.countFor);
    });
    setReveal((r) => ({ ...r, ...slots }));

    // Perfect day: every question of the day has its answer and the server gave the perfect bonus
    // (dayBonus also holds early-bird bonuses, so take those out first).
    const allDone = data.questions.length > 0 && data.questions.every((q) => q.resolved);
    const early = data.questions.reduce((s, q) => s + (q.myGuess?.early ? data.earlyBonus : 0), 0);
    const perfectBonus = (data.dayBonus || 0) - early;
    if (allDone && perfectBonus > 0) {
      later(() => setPerfect({ bonus: perfectBonus }), quiet ? 300 : (fresh.length - 1) * SLOT + T.end);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // On any error (e.g. the question just locked) reload, so the form doesn't stay on screen.
  const guess = (q, value) => playerApi.post('/guesses', { questionId: q.id, value })
    .then((res) => {
      setJustLocked(q.id);
      later(() => setJustLocked((id) => (id === q.id ? null : id)), 2600);
      notify(res.early ? `🎯 הניחוש ננעל! +${res.earlyBonus} ציפור מוקדמת 🐦` : '🎯 הניחוש ננעל! בהצלחה');
    })
    .catch((e) => notify(`❌ ${e.message}`))
    .finally(load);

  if (!data) return <div className="muted pad">טוען...</div>;

  const myTotal = data.questions.reduce((s, q) => s + (q.myGuess?.points ?? 0) + (q.myGuess?.bonus ?? 0), 0) + (data.dayBonus || 0);
  const anyResolved = data.questions.some((q) => q.resolved);
  const open = data.questions.filter((q) => !q.locked);
  const nextLock = open.length ? open.map((q) => q.lockTime).sort()[0] : null;
  const answered = data.questions.filter((q) => q.myGuess).length;
  const earlyOpen = data.earlyBonus > 0 && data.now < data.earlyTime && open.some((q) => !q.myGuess);
  const revealSlots = Object.values(reveal);
  const revealEnd = revealSlots.length ? Math.max(...revealSlots) + T.count + T.countFor : 0;

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
        <div className={`card day-summary${revealSlots.length ? ' fx-summary-in' : ''}`}>
          <Sparkles size={18} className="warn" /> הרווחת היום מתחזיות{' '}
          <span className="coin"><Coin size={16} />{revealSlots.length ? <CountUp to={myTotal} delay={T.count} duration={Math.max(900, revealEnd - T.count)} /> : myTotal.toLocaleString()}</span>
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

      {data.questions.map((q, i) => {
        const at = reveal[q.id];
        const revealing = at !== undefined;
        const mine = q.myGuess;
        const scored = typeof mine?.points === 'number';
        const total = scored ? pointsOf(mine, data.earlyBonus) : 0;
        return (
          <div className={`card question-card fx-card${q.resolved ? ' resolved' : ''}${!mine && !q.locked ? ' open' : ''}${revealing ? ' fx-revealing' : ''}`} key={q.id}>
            {justLocked === q.id && <span className="fx-stamp" aria-hidden="true">🔒 ננעל</span>}
            <div className="q-top">
              <span className="q-num">{i + 1}</span>
              <div>
                <div className="q-text">{q.text}</div>
                {q.kind === 'yesno' && <span className="tag">✅ כן/לא</span>}
                {q.componentId && <span className="tag"><Box size={11} /> {nodeName(q.componentId)}</span>}
              </div>
            </div>

            {!mine && !q.locked && (q.kind === 'yesno'
              ? <YesNoForm onSubmit={(v) => guess(q, v).then(onChange)} />
              : <GuessForm q={q} onSubmit={(v) => guess(q, v).then(onChange)} />)}
            {!mine && q.locked && <p className="muted">⏰ פספסת את השאלה הזו</p>}
            {mine && (
              <div className={`my-guess${justLocked === q.id ? ' fx-just-locked' : ''}`}>
                {q.kind === 'yesno' ? 'ענית: ' : 'הניחוש שלך: '}<b>{showValue(q.kind, mine.value)}</b> {q.unit}
                {mine.early && !scored && <span className="early-chip">🐦 +{data.earlyBonus}</span>}
                {scored && (
                  <>
                    <span
                      className={`pts big${revealing ? ' fx-pts-in' : ''}${mine.closest && q.kind !== 'yesno' ? ' fx-closest-pts' : ''}`}
                      style={revealing ? { '--d': ms(at + T.count), '--d2': ms(at + T.closest) } : undefined}
                    >
                      +<span className="coin"><Coin size={14} />{revealing ? <CountUp to={total} delay={at + T.count} duration={T.countFor} ticks /> : total.toLocaleString()}</span>
                    </span>
                    <Breakdown g={mine} kind={q.kind} earlyBonus={data.earlyBonus} at={revealing ? at + T.breakdown : undefined} />
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
              ? <YesNoSplit q={q} meId={meId} earlyBonus={data.earlyBonus} at={at} />
              : <Distribution q={q} meId={meId} earlyBonus={data.earlyBonus} at={at} />)}
            {q.locked && !q.resolved && <p className="muted small">⏳ מחכים לתשובה האמיתית בסוף היום...</p>}
          </div>
        );
      })}

      {perfect && <PerfectDay kind={celebration} bonus={perfect.bonus} onDone={() => setPerfect(null)} />}
    </div>
  );
}
