import { useCallback, useEffect, useState } from 'react';
import { Box, Clock, Coffee, Sparkles, Sun, Target } from 'lucide-react';
import { playerApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin } from '../icons.jsx';

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
function Distribution({ q, meId }) {
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
            {typeof g.points === 'number' && <span className="pts">+{g.points + (g.bonus || 0)}</span>}
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

  const guess = (q, value) => playerApi.post('/guesses', { questionId: q.id, value })
    .then(() => { notify('🎯 הניחוש ננעל! בהצלחה'); load(); })
    .catch((e) => notify(`❌ ${e.message}`));

  if (!data) return <div className="muted pad">טוען...</div>;

  const myTotal = data.questions.reduce((s, q) => s + (q.myGuess?.points ?? 0) + (q.myGuess?.bonus ?? 0), 0) + (data.dayBonus || 0);
  const anyResolved = data.questions.some((q) => q.resolved);
  const open = data.questions.filter((q) => !q.locked);
  const nextLock = open.length ? open.map((q) => q.lockTime).sort()[0] : null;
  const answered = data.questions.filter((q) => q.myGuess).length;

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <div>
          <h2 className="title-with-icon"><Sun size={20} className="accent" /> התחזיות של היום</h2>
          {data.questions.length > 0 && <span className="muted small">ענית על {answered} מתוך {data.questions.length}</span>}
        </div>
        {nextLock && <span className="lock-pill"><Clock size={13} /> ננעל ב-{nextLock}</span>}
      </div>

      {anyResolved && (
        <div className="card day-summary">
          <Sparkles size={18} className="warn" /> הרווחת היום <Coin value={myTotal} size={16} />
          {data.dayBonus > 0 && <span className="muted small">(כולל בונוס יום מושלם 🎯)</span>}
        </div>
      )}

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
              {q.componentId && <span className="tag"><Box size={11} /> {nodeName(q.componentId)}</span>}
            </div>
          </div>

          {!q.myGuess && !q.locked && <GuessForm q={q} onSubmit={(v) => guess(q, v).then(onChange)} />}
          {!q.myGuess && q.locked && <p className="muted">⏰ פספסת את השאלה הזו</p>}
          {q.myGuess && (
            <p className="my-guess">
              הניחוש שלך: <b>{q.myGuess.value.toLocaleString()}</b> {q.unit}
              {typeof q.myGuess.points === 'number' && (
                <span className="pts big">+<Coin value={q.myGuess.points + (q.myGuess.bonus || 0)} size={14} /></span>
              )}
            </p>
          )}

          {!q.locked && <p className="muted small">{q.guessCount} אנשים כבר ניחשו. הניחושים ייחשפו ב-{q.lockTime}</p>}
          {q.locked && q.guesses?.length > 0 && <Distribution q={q} meId={meId} />}
          {q.locked && !q.resolved && <p className="muted small">⏳ מחכים לתשובה האמיתית בסוף היום...</p>}
        </div>
      ))}
    </div>
  );
}
