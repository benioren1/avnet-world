import { useCallback, useEffect, useRef, useState } from 'react';
import { playerApi } from '../api.js';

// Timeline of a purchase on the map (ms). The CSS in cityFx.css uses the same numbers.
export const FX = {
  land: 950, // scaffold appears, the card rises and lands with a flash
  edgeStart: 1050, // first new connection starts to light
  edgeStep: 500, // next connection, one after another
  edgeDraw: 700, // drawing one connection
  visitStep: 280, // stagger between components on a visited city
};

const litEdge = (e, owned, burning) =>
  owned.has(e.source) && owned.has(e.target) && !burning.has(e.source) && !burning.has(e.target);

const localDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
};

// Purchase events in the feed read: ... "<component name>" ב-<price> דינרים
const BOUGHT_NAME = /"(.+)" ב-\d/;

// Short-lived animation state of the city map.
// nodes: { componentId: { kind: 'build' | 'upgrade' | 'visit', level, delay, key } }
// edges: { edgeId: { delay, reverse, light, key } }
// focus: { id, key } of a component the camera should glide to.
export default function useCityFx({ architecture, city, mine, justBought }) {
  const [fx, setFx] = useState({ nodes: {}, edges: {}, focus: null });
  const seq = useRef(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Adds entries now and drops exactly those entries again after their animation ends.
  const play = useCallback((nodes, edges, nodeMs, edgeMs, focus = null) => {
    const key = ++seq.current;
    const tag = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, key }]));
    setFx((prev) => ({
      nodes: { ...prev.nodes, ...tag(nodes) },
      edges: { ...prev.edges, ...tag(edges) },
      focus: focus ? { id: focus, key } : prev.focus,
    }));
    const drop = (part, ids) => setFx((prev) => {
      const next = { ...prev[part] };
      ids.forEach((id) => { if (next[id]?.key === key) delete next[id]; });
      return { ...prev, [part]: next };
    });
    timers.current.push(
      setTimeout(() => drop('nodes', Object.keys(nodes)), nodeMs),
      setTimeout(() => drop('edges', Object.keys(edges)), edgeMs),
    );
  }, []);

  // A purchase or an upgrade in my own city. Bought components are level 1, upgrades 2 or 3.
  const level = justBought ? city.levels[justBought] || 1 : 0;
  useEffect(() => {
    if (!justBought || !mine) return;
    if (level > 1) {
      play({ [justBought]: { kind: 'upgrade', level, delay: 0 } }, {}, 1800, 0, justBought);
      return;
    }
    const fresh = architecture.edges
      .filter((e) => (e.source === justBought || e.target === justBought) && litEdge(e, city.owned, city.burning));
    const edges = Object.fromEntries(fresh.map((e, i) => [e.id, {
      delay: FX.edgeStart + i * FX.edgeStep, reverse: e.target === justBought, light: false,
    }]));
    play(
      { [justBought]: { kind: 'build', level: 1, delay: 0 } },
      edges,
      2400,
      FX.edgeStart + fresh.length * FX.edgeStep + FX.edgeDraw + 900,
      justBought,
    );
    // Only a new purchase/upgrade starts this; later refreshes of the city must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justBought, level, mine, play]);

  // Visiting someone: what they bought today plays once, lighter (no camera move, no hiding).
  // The visit data has no purchase dates, so "today" comes from the purchase events in the feed
  // (author + component name), counted by the viewer's own calendar day.
  const visitedId = mine ? null : city.player.id;
  useEffect(() => {
    if (!visitedId) return undefined;
    let alive = true;
    playerApi.get('/feed').then((events) => {
      if (!alive) return;
      const today = localDay(Date.now());
      const byName = Object.fromEntries(architecture.nodes.map((n) => [n.data.name, n.id]));
      const ids = [...new Set(events
        .filter((ev) => ev.type === 'purchase' && ev.playerId === visitedId && localDay(ev.at) === today)
        .reverse() // oldest purchase builds first
        .map((ev) => byName[ev.text.match(BOUGHT_NAME)?.[1]])
        .filter((id) => id && city.owned.has(id)))];
      if (!ids.length) return;
      const nodes = Object.fromEntries(ids.map((id, i) => [id, { kind: 'visit', level: 1, delay: 300 + i * FX.visitStep }]));
      const edges = {};
      architecture.edges.forEach((e) => {
        const from = ids.indexOf(e.source) >= 0 ? e.source : ids.indexOf(e.target) >= 0 ? e.target : null;
        if (!from || edges[e.id] || !litEdge(e, city.owned, city.burning)) return;
        edges[e.id] = { delay: nodes[from].delay + 700, reverse: e.target === from, light: true };
      });
      const last = 300 + ids.length * FX.visitStep;
      play(nodes, edges, last + 1600, last + 700 + FX.edgeDraw + 800);
    }).catch(() => {});
    return () => { alive = false; };
    // Once per visit: the city object is rebuilt on refresh, the visited player is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitedId, play]);

  return fx;
}
