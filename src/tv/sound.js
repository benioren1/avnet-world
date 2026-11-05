import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Small synthesized sound effects for the TV (no audio files, works offline).
// Browsers only allow sound after someone clicks the page once, so it starts muted
// and remembers the choice on that TV.
const KEY = 'tv-sound';

function readPref() {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
function writePref(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked: fine */ }
}

const SOUNDS = {
  // [frequency Hz, start s, length s, wave]
  chime: [[880, 0, 0.25, 'sine'], [1320, 0.12, 0.35, 'sine']],
  fanfare: [[523, 0, 0.18, 'triangle'], [659, 0.16, 0.18, 'triangle'], [784, 0.32, 0.18, 'triangle'], [1047, 0.5, 0.6, 'triangle']],
  whoosh: [[300, 0, 0.3, 'sawtooth'], [600, 0.1, 0.3, 'sawtooth']],
  alarm: [[880, 0, 0.25, 'square'], [660, 0.3, 0.25, 'square'], [880, 0.6, 0.25, 'square'], [660, 0.9, 0.25, 'square']],
  // A short tick for each 3-2-1 beat, and a deep gong for the reveal.
  tick: [[1000, 0, 0.09, 'square'], [500, 0, 0.12, 'sine']],
  gong: [[98, 0, 2.2, 'sine'], [196, 0, 1.6, 'sine'], [147, 0.02, 1.8, 'triangle'], [392, 0, 0.5, 'triangle']],
};

export function useSound() {
  const [on, setOn] = useState(readPref);
  // After the TV browser restarts, "on" is remembered but the browser keeps audio blocked
  // until someone clicks the page once; `blocked` lets the button say so.
  const [blocked, setBlocked] = useState(false);
  const ctx = useRef(null);
  useEffect(() => () => { ctx.current?.close().catch(() => {}); }, []);

  const audio = () => {
    if (!ctx.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx.current = new Ctx();
    }
    if (ctx.current.state === 'suspended') {
      ctx.current.resume().then(() => setBlocked(false)).catch(() => {});
      if (ctx.current.state === 'suspended') setBlocked(true);
    }
    return ctx.current;
  };

  const play = useCallback((name) => {
    if (!on || !SOUNDS[name]) return;
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    for (const [freq, start, len, wave] of SOUNDS[name]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(wave === 'sine' ? 0.3 : 0.12, t0 + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + len + 0.05);
    }
  }, [on]);

  const toggle = useCallback(() => {
    if (blocked) { audio(); return; } // the click itself unblocks it; keep it on
    setOn((v) => {
      writePref(!v);
      if (!v) audio(); // the click unlocks audio in the browser
      return !v;
    });
  }, [blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable object, so effects that depend on it don't re-run (and replay sounds) every render.
  return useMemo(() => ({ on, blocked: on && blocked, play, toggle }), [on, blocked, play, toggle]);
}
