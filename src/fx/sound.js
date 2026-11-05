// Game sounds, made in code with WebAudio: no files, no network.
// Nothing plays before the player has clicked or pressed a key (browsers block it anyway),
// and the mute choice is remembered in this browser.

const MUTE_KEY = 'aw.sound.muted';
let ctx = null;
let master = null;
let unlocked = false;
let muted = readMuted();
const listeners = new Set();

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private window: keep it for this visit */ }
  listeners.forEach((fn) => fn(muted));
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

// The first real gesture unlocks audio for the rest of the visit.
function unlock() {
  unlocked = true;
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

// One short note: oscillator -> envelope -> master.
function tone(c, { freq, to, type = 'sine', at = 0, dur = 0.15, vol = 0.5, attack = 0.005 }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A burst of filtered noise (the pickaxe hitting rock, the stamp landing).
function noise(c, { at = 0, dur = 0.08, vol = 0.4, freq = 1800, q = 1 }) {
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const SOUNDS = {
  // Hold-to-lock finished: a low thunk and a click.
  lock: (c) => {
    tone(c, { freq: 180, to: 90, type: 'triangle', dur: 0.12, vol: 0.6 });
    noise(c, { dur: 0.05, vol: 0.35, freq: 2500, q: 2 });
    tone(c, { freq: 880, type: 'square', at: 0.06, dur: 0.04, vol: 0.12 });
  },
  // A single coin.
  coin: (c) => {
    tone(c, { freq: 988, type: 'square', dur: 0.07, vol: 0.16 });
    tone(c, { freq: 1319, type: 'square', at: 0.07, dur: 0.22, vol: 0.16 });
  },
  // Count-up tick, very short and quiet.
  tick: (c) => tone(c, { freq: 1500, type: 'square', dur: 0.025, vol: 0.05 }),
  // Pickaxe on rock.
  swing: (c) => {
    noise(c, { dur: 0.09, vol: 0.5, freq: 900, q: 3 });
    tone(c, { freq: 2200, to: 1400, type: 'triangle', at: 0.01, dur: 0.12, vol: 0.12 });
  },
  // Normal mining reward: a few coins falling.
  reward: (c) => {
    [0, 0.07, 0.14].forEach((at, i) => tone(c, { freq: 988 + i * 160, type: 'square', at, dur: 0.12, vol: 0.13 }));
  },
  // Gold nugget: a bright rising arpeggio with a shimmer.
  gold: (c) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, { freq: f, type: 'triangle', at: i * 0.07, dur: 0.35, vol: 0.22 }));
    tone(c, { freq: 2637, type: 'sine', at: 0.35, dur: 0.6, vol: 0.08 });
  },
  // The answer pin drops.
  reveal: (c) => {
    tone(c, { freq: 1200, to: 300, type: 'sine', dur: 0.35, vol: 0.18 });
    tone(c, { freq: 140, to: 70, type: 'triangle', at: 0.33, dur: 0.18, vol: 0.55 });
    noise(c, { at: 0.33, dur: 0.06, vol: 0.25, freq: 600 });
  },
  // Closest guess: a golden ding.
  closest: (c) => {
    tone(c, { freq: 1568, type: 'sine', dur: 0.5, vol: 0.2 });
    tone(c, { freq: 2093, type: 'sine', at: 0.05, dur: 0.6, vol: 0.12 });
  },
  // Perfect day fanfare.
  perfect: (c) => {
    const notes = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]];
    notes.forEach(([f, at]) => {
      tone(c, { freq: f, type: 'triangle', at, dur: 0.3, vol: 0.22 });
      tone(c, { freq: f / 2, type: 'sine', at, dur: 0.3, vol: 0.12 });
    });
  },
  // Purchase: register "cha-ching".
  purchase: (c) => {
    noise(c, { dur: 0.05, vol: 0.3, freq: 3000, q: 4 });
    tone(c, { freq: 1319, type: 'square', at: 0.05, dur: 0.08, vol: 0.14 });
    tone(c, { freq: 1760, type: 'square', at: 0.13, dur: 0.3, vol: 0.14 });
  },
  // Sheet opens / small UI blip.
  blip: (c) => tone(c, { freq: 660, to: 880, type: 'sine', dur: 0.08, vol: 0.12 }),
};

export function play(name) {
  if (muted || !unlocked || !SOUNDS[name]) return;
  const c = ensureContext();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    SOUNDS[name](c);
  } catch { /* sound is a bonus; never break the game for it */ }
}

export const sfx = { play, isMuted, setMuted, onMuteChange };
export default sfx;
