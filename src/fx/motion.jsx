import { useEffect, useRef, useState } from 'react';
import { play } from './sound.js';

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const ease = (t) => 1 - (1 - t) ** 3;

// Counts a number from `from` to `to` after `delay` ms. With reduced motion it shows `to` at once.
export function CountUp({ from = 0, to, delay = 0, duration = 900, ticks = false, onDone }) {
  const [shown, setShown] = useState(reducedMotion() ? to : from);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reducedMotion() || from === to) { setShown(to); done.current?.(); return undefined; }
    let raf = 0;
    let last = from;
    const start = performance.now() + delay;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const v = Math.round(from + (to - from) * ease(t));
      if (ticks && v !== last && t < 1 && Math.abs(v - last) >= Math.max(1, Math.abs(to - from) / 12)) { play('tick'); last = v; }
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
      else done.current?.();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay, duration, ticks]);
  return <>{Number(shown).toLocaleString()}</>;
}

// A number that rolls from its previous value to the new one whenever it changes
// (the header balance going down after a buy, up after mining). The first value is shown as is.
export function RollingNumber({ value, duration = 900 }) {
  const prev = useRef(value);
  const [range, setRange] = useState({ from: value, to: value, key: 0 });
  useEffect(() => {
    if (prev.current !== value) {
      setRange((r) => ({ from: prev.current, to: value, key: r.key + 1 }));
      prev.current = value;
    }
  }, [value]);
  const dir = range.to < range.from ? 'down' : range.to > range.from ? 'up' : '';
  return (
    <span key={range.key} className={`fx-roll${range.key ? ` fx-roll-${dir}` : ''}`}>
      <CountUp from={range.from} to={range.to} duration={duration} />
    </span>
  );
}
