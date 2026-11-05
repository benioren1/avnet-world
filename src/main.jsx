import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { storeToken } from './api.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
// The map library's default styles must come BEFORE ours (styles.css re-colors its controls and minimap).
// Imported here, it stays first; left to the screen files, it would load after ours and win.
import '@xyflow/react/dist/style.css';
import './styles.css';
import './app.css';
import './season2.css';

// Each screen is its own file: a player never downloads the admin's architecture editor,
// and the office TV never downloads the player's shop or the admin panels.
// If a screen file cannot be loaded (the game was updated while this page was open), reload once.
const RELOADED = 'aw-screen-reloaded';
function screen(load) {
  return lazy(() => load().then(
    (mod) => { try { sessionStorage.removeItem(RELOADED); } catch { /* storage blocked */ } return mod; },
    (err) => {
      try {
        if (sessionStorage.getItem(RELOADED)) throw err;
        sessionStorage.setItem(RELOADED, '1');
      } catch { throw err; }
      window.location.reload();
      return new Promise(() => {});
    },
  ));
}
const AdminApp = screen(() => import('./admin/AdminApp.jsx'));
const PlayerApp = screen(() => import('./player/PlayerApp.jsx'));
const TvApp = screen(() => import('./tv/TvApp.jsx'));

// Hash routes: #/admin?key=TOKEN and #/play?t=TOKEN.
// The token is stored, then removed from the address bar.
function parseRoute() {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  if (path === '/admin' && params.get('key')) {
    storeToken('admin', params.get('key'));
    window.history.replaceState(null, '', '#/admin');
  }
  if (path === '/play' && params.get('t')) {
    storeToken('player', params.get('t'));
    window.history.replaceState(null, '', '#/play');
  }
  if (path === '/tv' && params.get('k')) {
    storeToken('tv', params.get('k'));
    const only = params.get('only'); // pins one TV slide, kept in the address
    window.history.replaceState(null, '', only ? `#/tv?only=${encodeURIComponent(only)}` : '#/tv');
  }
  return path || '/play';
}

// Shown while a screen's file downloads. It waits a moment before appearing, so a fast load
// shows nothing at all instead of a flash, and it does not move when reduced motion is asked for.
const loadingCss = `
.aw-loading { position: fixed; inset: 0; display: grid; place-items: center; animation: aw-in .3s .25s both; }
.aw-loading > div { display: flex; gap: 10px; }
.aw-loading span { width: 12px; height: 12px; border-radius: 50%; background: var(--accent, #5b8cff);
  animation: aw-dot 1s ease-in-out infinite; }
.aw-loading span:nth-child(2) { animation-delay: .15s; }
.aw-loading span:nth-child(3) { animation-delay: .3s; }
@keyframes aw-in { from { opacity: 0; } }
@keyframes aw-dot { 0%, 100% { opacity: .25; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .aw-loading { animation: none; }
  .aw-loading span { animation: none; opacity: .6; }
}`;

function Loading() {
  return (
    <div className="aw-loading" role="status" aria-label="טוען">
      <style>{loadingCss}</style>
      <div><span /><span /><span /></div>
    </div>
  );
}

function Root() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  let page;
  if (route === '/admin') page = <AdminApp />;
  else if (route === '/tv') page = <TvApp />;
  else page = <PlayerApp key={route} />;
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
