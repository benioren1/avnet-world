import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './admin/AdminApp.jsx';
import PlayerApp from './player/PlayerApp.jsx';
import TvApp from './tv/TvApp.jsx';
import { storeToken } from './api.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import './styles.css';
import './app.css';
import './season2.css';

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

function Root() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (route === '/admin') return <AdminApp />;
  if (route === '/tv') return <TvApp />;
  return <PlayerApp key={route} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
