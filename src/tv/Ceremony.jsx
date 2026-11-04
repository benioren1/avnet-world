import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import './ceremony.css';

// The results ceremony: for each question, the question, 3-2-1, then the real
// answer and the three closest guesses.
const ASK_MS = 2000;
const COUNT_MS = 3000; // 3, 2, 1
const REVEAL_MS = 6000;
const QUESTION_MS = ASK_MS + COUNT_MS + REVEAL_MS;
export const ceremonyLength = (resolvedCount) => Math.max(1, resolvedCount) * QUESTION_MS;

const fmt = (kind, v, unit = '') => (kind === 'yesno' ? (v ? 'כן' : 'לא') : `${Number(v).toLocaleString()} ${unit}`.trim());
const MEDALS = ['🥇', '🥈', '🥉'];

function useElapsed() {
  const start = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - start.current), 100);
    return () => clearInterval(t);
  }, []);
  return elapsed;
}

// The three best guesses: closest number, or (yes/no) the first three who were right.
function topThree(q) {
  const guesses = q.guesses || [];
  if (q.kind === 'yesno') return guesses.filter((g) => g.value === q.answer).slice(0, 3);
  return [...guesses].sort((a, b) => Math.abs(a.value - q.answer) - Math.abs(b.value - q.answer)).slice(0, 3);
}

function QuestionAct({ q, index, total, t, sound }) {
  const stage = t < ASK_MS ? 'ask' : t < ASK_MS + COUNT_MS ? 'count' : 'reveal';
  const count = 3 - Math.floor((t - ASK_MS) / 1000);
  const played = useRef(new Set());
  useEffect(() => {
    const key = stage === 'count' ? `count-${count}` : stage;
    if (played.current.has(key)) return;
    played.current.add(key);
    if (stage === 'count') sound.play('tick');
    if (stage === 'reveal') sound.play('gong');
  }, [stage, count, sound]);

  const top = topThree(q);
  return (
    <div className="cer-act">
      <div className="cer-progress">שאלה {index + 1} מתוך {total}</div>
      <h2 className={`cer-question${stage === 'ask' ? '' : ' small'}`}>{q.text}</h2>

      {stage === 'count' && <div className="cer-count" key={count}>{count}</div>}

      {stage === 'reveal' && (
        <>
          <div className="cer-final">{fmt(q.kind, q.answer, q.unit)}</div>
          {top.length ? (
            <div className="cer-top">
              {top.map((g, i) => (
                <div key={g.id} className={`cer-top-face place-${i + 1}`} style={{ '--i': i }}>
                  <span className="cer-medal">{MEDALS[i]}</span>
                  <Avatar name={g.name} photo={g.photo} size={i === 0 ? 120 : 90} crown={i === 0} />
                  <b>{g.name}</b>
                  {q.kind !== 'yesno' && <span>ניחש/ה {Number(g.value).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          ) : <div className="cer-none">אף אחד לא צדק הפעם 😅</div>}
        </>
      )}
    </div>
  );
}

export default function Ceremony({ questions, sound }) {
  const resolved = useMemo(() => questions.filter((q) => q.resolved), [questions]);
  const elapsed = useElapsed();
  if (!resolved.length) return null;
  const i = Math.min(resolved.length - 1, Math.floor(elapsed / QUESTION_MS));
  return (
    <div className="tv-slide ceremony">
      <div className="cer-badge"><Sparkles size={22} /> טקס התוצאות</div>
      <QuestionAct key={resolved[i].id} q={resolved[i]} index={i} total={resolved.length} t={elapsed - i * QUESTION_MS} sound={sound} />
    </div>
  );
}
