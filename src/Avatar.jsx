const COLORS = ['#4f8cff', '#a66cff', '#ff9f43', '#2ecc8f', '#ff6b81', '#00c2d1', '#f6c945', '#e056fd'];

function colorFor(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

// frame: cosmetic border bought in the studio ('none' | 'neon' | 'fire' | 'gold').
export default function Avatar({ name, photo, size = 36, crown = false, frame = 'none' }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span
      className={`avatar${frame && frame !== 'none' ? ` frame-${frame}` : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4, '--av': colorFor(name) }}
    >
      {photo ? <img src={photo} alt={name} /> : initials}
      {crown && <span className="crown" style={{ fontSize: size * 0.5 }}>👑</span>}
    </span>
  );
}
