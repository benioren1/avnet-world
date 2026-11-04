import { useEffect, useRef } from 'react';
import { play } from './sound.js';

const KEY = 'aw.reveal.seen';

// Question ids whose results this browser already revealed, so the "moment of truth" plays once.
export function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}
export function markSeen(ids) {
  try {
    const all = [...readSeen(), ...ids].slice(-300); // keep it small: about three months of questions
    localStorage.setItem(KEY, JSON.stringify([...new Set(all)]));
  } catch { /* no storage: the reveal may play again next visit, which is harmless */ }
}

const EMOJI = { pulse: '💫', confetti: '🎊', fireworks: '🎆', lightning: '⚡' };

// Full-screen perfect-day moment in the player's own studio celebration style.
export default function PerfectDay({ kind = 'pulse', bonus, onDone }) {
  const style = EMOJI[kind] ? kind : 'pulse';
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    play('perfect');
    const t = setTimeout(() => done.current(), 4200);
    return () => clearTimeout(t);
  }, []);
  const pieces = style === 'confetti' ? 36 : style === 'fireworks' ? 3 : style === 'lightning' ? 5 : 4;
  return (
    <div className={`fx-perfect fx-perfect-${style}`} onClick={onDone} role="status">
      <div className="fx-perfect-fx" aria-hidden="true">
        {Array.from({ length: pieces }, (_, i) => (
          <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%` }}>
            {style === 'fireworks' && Array.from({ length: 12 }, (_, j) => <b key={j} style={{ '--j': j }} />)}
          </i>
        ))}
      </div>
      <div className="fx-perfect-card">
        <div className="fx-perfect-emoji" aria-hidden="true">{EMOJI[style]}</div>
        <h2>יום מושלם!</h2>
        <p>כל התחזיות שלך היום פגעו בטווח{bonus > 0 ? ` · +${bonus} בונוס` : ''}</p>
      </div>
    </div>
  );
}
