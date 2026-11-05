import { useEffect, useId, useRef, useState } from 'react';
import { play } from './sound.js';

// Press and hold to lock: a ring fills for `duration` ms, then onHold() fires.
// Mouse, touch and keyboard (hold Space or Enter) all work. A quick click only shows a hint,
// so a guess is never locked by accident. Assistive-tech clicks (no pointer, no key) lock at once.
export default function HoldButton({ onHold, children, className = '', disabled = false, duration = 550, hint = 'לחץ והחזק כדי לנעול' }) {
  const [holding, setHolding] = useState(false);
  const [nudge, setNudge] = useState(false);
  const timer = useRef(0);
  const started = useRef(0);
  const via = useRef(''); // 'pointer' | 'key' while a hold is running
  const hintId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = (source) => {
    if (disabled || via.current) return;
    via.current = source;
    started.current = Date.now();
    setHolding(true);
    setNudge(false);
    timer.current = setTimeout(() => {
      via.current = '';
      setHolding(false);
      play('lock');
      onHold();
    }, duration);
  };

  const stop = () => {
    if (!via.current) return;
    clearTimeout(timer.current);
    const short = Date.now() - started.current < duration;
    via.current = '';
    setHolding(false);
    if (short) {
      setNudge(true);
      setTimeout(() => setNudge(false), 1600);
    }
  };

  return (
    <span className="fx-hold-wrap">
      <button
        type="button"
        className={`fx-hold ${className}${holding ? ' holding' : ''}`}
        style={{ '--hold-ms': `${duration}ms` }}
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ }
          start('pointer');
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return;
          e.preventDefault();
          if (!e.repeat) start('key');
        }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } }}
        onBlur={stop}
        onClick={(e) => {
          // A click with no pointer press and no key hold comes from a screen reader or switch device.
          if (e.detail === 0 && !via.current && Date.now() - started.current > duration + 100) { play('lock'); onHold(); }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="fx-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="fx-ring-bg" />
          <circle cx="18" cy="18" r="15" className="fx-ring-fill" pathLength="100" />
        </svg>
        <span className="fx-hold-label">{children}</span>
      </button>
      <span id={hintId} className={`fx-hold-hint${nudge ? ' show' : ''}`} role={nudge ? 'status' : undefined}>
        {nudge ? `✋ ${hint}` : hint}
      </span>
    </span>
  );
}
