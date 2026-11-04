// Thin fetch wrapper. Tokens arrive once in the link (#/admin?key=..., #/play?t=...)
// and are then kept in localStorage so the link can be bookmarked without them.

const KEYS = { admin: 'admin-token', player: 'player-token', tv: 'tv-token' };
const HEADERS = { admin: 'x-admin-token', player: 'x-player-token', tv: 'x-tv-token' };

export function readToken(kind) {
  try { return localStorage.getItem(KEYS[kind]) || ''; } catch { return ''; }
}

export function storeToken(kind, token) {
  try { localStorage.setItem(KEYS[kind], token); } catch { /* private mode */ }
}

export function clearToken(kind) {
  try { localStorage.removeItem(KEYS[kind]); } catch { /* ignore */ }
}

async function request(kind, method, url, body) {
  const headers = { 'content-type': 'application/json' };
  headers[HEADERS[kind]] = readToken(kind);
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `שגיאה ${res.status}`), { status: res.status });
  return data;
}

const client = (kind, prefix) => ({
  get: (u) => request(kind, 'GET', prefix + u),
  post: (u, b = {}) => request(kind, 'POST', prefix + u, b),
  put: (u, b) => request(kind, 'PUT', prefix + u, b),
  patch: (u, b) => request(kind, 'PATCH', prefix + u, b),
  del: (u) => request(kind, 'DELETE', prefix + u),
});

export const adminApi = client('admin', '/api/admin');
export const playerApi = client('player', '/api');
export const tvApi = client('tv', '/api/tv');

// Shrinks an uploaded photo to a small square JPEG data URL before sending it.
export function resizePhoto(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const s = Math.min(img.width, img.height);
      canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
