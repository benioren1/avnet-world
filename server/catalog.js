// Everything a player can spend dinars on besides components.
// Shared with the client through GET /api/cosmetics, so prices live in one place.

export const THEMES = [
  { id: 'blueprint', label: 'שרטוט', price: 0 },
  { id: 'neon', label: 'ניאון', price: 1500 },
  { id: 'retro', label: 'רטרו', price: 2000 },
  { id: 'space', label: 'תחנת חלל', price: 2500 },
  { id: 'kingdom', label: 'ממלכה', price: 3000 },
  { id: 'ocean', label: 'מתחת למים', price: 4000 },
];

export const PARTICLES = [
  { id: 'mint', label: 'מנטה', price: 0, color: '#2dd4a0' },
  { id: 'gold', label: 'זהב', price: 150, color: '#fbbf24' },
  { id: 'pink', label: 'ורוד', price: 150, color: '#f472b6' },
  { id: 'cyan', label: 'טורקיז', price: 150, color: '#22d3ee' },
  { id: 'violet', label: 'סגול', price: 150, color: '#a78bfa' },
];

export const CELEBRATIONS = [
  { id: 'pulse', label: 'פעימה', price: 0 },
  { id: 'confetti', label: 'קונפטי', price: 300 },
  { id: 'fireworks', label: 'זיקוקים', price: 300 },
  { id: 'lightning', label: 'ברק', price: 300 },
];

export const FRAMES = [
  { id: 'none', label: 'בלי מסגרת', price: 0 },
  { id: 'neon', label: 'ניאון', price: 400 },
  { id: 'fire', label: 'אש', price: 600 },
  { id: 'gold', label: 'זהב', price: 800 },
];

export const NAMING_PRICE = 200;

export const DECORATIONS = [
  { id: 'tree', label: 'עץ', emoji: '🌳', price: 100 },
  { id: 'flag', label: 'דגל', emoji: '🚩', price: 120 },
  { id: 'lamp', label: 'פנס', emoji: '🏮', price: 150 },
  { id: 'rocket', label: 'טיל', emoji: '🚀', price: 300 },
  { id: 'statue', label: 'פסל שלך', emoji: '🗿', price: 600 },
];

export const PRANKS = [
  { id: 'hat', label: 'כובע', emoji: '🎩', price: 100, verb: 'שם/ה כובע ל' },
  { id: 'mustache', label: 'שפם', emoji: '🥸', price: 100, verb: 'הדביק/ה שפם ל' },
  { id: 'rain', label: 'גשם על העיר', emoji: '🌧️', price: 150, verb: 'הוריד/ה גשם על העיר של' },
  { id: 'snail', label: 'חילזון בחיבורים', emoji: '🐌', price: 120, verb: 'שחרר/ה חילזונות בעיר של' },
];

export const PRANK_REMOVE_PRICE = 80;
export const UMBRELLA_PRICE = 60;
export const PRANK_HOURS = 24;
export const MAX_PRANKS_PER_DAY = 2;

export const BILLBOARD_PRICE = 300;
export const BILLBOARD_MAX_CHARS = 80;

// Upgrade cost is a multiple of what the player paid for the component.
export const UPGRADE_COST_MULT = { 2: 1, 3: 2 };
export const LEVEL_INCOME_MULT = { 1: 1, 2: 1.5, 3: 2 };

// Unlockable items keyed by "group:id", e.g. "theme:neon".
export const UNLOCKABLES = Object.fromEntries([
  ...THEMES.map((t) => [`theme:${t.id}`, t]),
  ...PARTICLES.map((t) => [`particle:${t.id}`, t]),
  ...CELEBRATIONS.map((t) => [`celebration:${t.id}`, t]),
  ...FRAMES.map((t) => [`frame:${t.id}`, t]),
  ['naming', { id: 'naming', label: 'שם ומוטו לעיר', price: NAMING_PRICE }],
]);

export const DEFAULT_PROFILE = { theme: 'blueprint', particle: 'mint', celebration: 'pulse', frame: 'none', cityName: '', motto: '' };

export function catalog() {
  return {
    themes: THEMES, particles: PARTICLES, celebrations: CELEBRATIONS, frames: FRAMES,
    decorations: DECORATIONS, pranks: PRANKS, namingPrice: NAMING_PRICE,
    prankRemovePrice: PRANK_REMOVE_PRICE, umbrellaPrice: UMBRELLA_PRICE, prankHours: PRANK_HOURS,
    maxPranksPerDay: MAX_PRANKS_PER_DAY, billboardPrice: BILLBOARD_PRICE, billboardMaxChars: BILLBOARD_MAX_CHARS,
    upgradeCostMult: UPGRADE_COST_MULT, levelIncomeMult: LEVEL_INCOME_MULT,
  };
}
