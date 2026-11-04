import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight, ArrowUpCircle, Building2, Check, Flame, Hammer, Heart, Lock, MousePointerClick, Plug, User, X,
} from 'lucide-react';
import ComponentNode, { DecorationNode, EditorContext } from '../ComponentNode.jsx';
import FlowEdge from '../FlowEdge.jsx';
import Avatar from '../Avatar.jsx';
import { Coin, TypeIcon } from '../icons.jsx';

const nodeTypes = { component: ComponentNode, decoration: DecorationNode };
const edgeTypes = { flow: FlowEdge };
const LEVEL_LABEL = { 1: 'רגיל', 2: 'משודרג ⭐', 3: 'אגדי ⭐⭐' };

// city: { player, owned (Set), value, levels, profile, decorations, prank, burning (Set) }
// mine: extra data when this is the viewer's own city ({ paid }), null when visiting.
function CityCanvas({
  architecture, city, mine, catalog, balance, incidents, vote, justBought, placing,
  onBuy, onUpgrade, onBack, onVote, onPlace, onMoveDecoration, onCancelPlacing,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const { screenToFlowPosition } = useReactFlow();
  const { owned, levels, burning, profile } = city; // levels/burning are read by the nodes via context
  const domainsById = useMemo(() => Object.fromEntries(architecture.domains.map((d) => [d.id, d])), [architecture]);
  const decoMeta = useMemo(() => Object.fromEntries(catalog.decorations.map((d) => [d.id, d])), [catalog]);
  const particle = catalog.particles.find((p) => p.id === profile.particle)?.color || '#2dd4a0';

  // Component nodes come from the shared architecture; decorations from this city.
  const baseNodes = useMemo(() => [
    ...architecture.nodes.map((n) => ({ ...n, draggable: false })),
    ...city.decorations.map((d) => ({
      id: `deco-${d.id}`,
      type: 'decoration',
      position: { x: d.x, y: d.y },
      draggable: Boolean(mine),
      selectable: false,
      zIndex: -1,
      data: { type: d.type, emoji: decoMeta[d.type]?.emoji, label: decoMeta[d.type]?.label, photo: city.player.photo },
    })),
  ], [architecture, city, mine, decoMeta]);

  // Local copy so decorations can be dragged smoothly; saved on drop.
  const [nodes, setNodes] = useState(baseNodes);
  useEffect(() => setNodes(baseNodes), [baseNodes]);
  const shownNodes = useMemo(() => nodes.map((n) => (n.type === 'component' ? { ...n, selected: n.id === selectedId } : n)), [nodes, selectedId]);

  // A connection lights up only when both ends are owned and neither is burning.
  const edges = useMemo(() => architecture.edges.map((e) => {
    const lit = owned.has(e.source) && owned.has(e.target) && !burning.has(e.source) && !burning.has(e.target);
    return lit
      ? { ...e, type: 'flow', className: 'lit', data: { snail: city.prank === 'snail' } }
      : { ...e, type: 'smoothstep', className: 'dark', label: '' };
  }), [architecture, owned, burning, city.prank]);

  const total = architecture.nodes.length;
  const coverage = total ? Math.round((owned.size / total) * 100) : 0;
  const litLinks = edges.filter((e) => e.type === 'flow').length;
  const selected = architecture.nodes.find((n) => n.id === selectedId);
  const price = Number(selected?.data.price) || 0;
  const level = selected ? levels[selected.id] || 1 : 1;
  const upgradeCost = selected && mine?.paid[selected.id] ? mine.paid[selected.id] * (catalog.upgradeCostMult[level + 1] || 0) : 0;
  const incidentOf = (id) => incidents.find((i) => i.componentIds.includes(id));
  const visiting = !mine;

  const neighbors = (id) => architecture.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => architecture.nodes.find((n) => n.id === (e.source === id ? e.target : e.source)))
    .filter(Boolean);

  const onPaneClick = (e) => {
    if (placing) {
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPlace(placing, Math.round(p.x - 20), Math.round(p.y - 20));
    } else {
      setSelectedId(null);
    }
  };

  return (
    <div className={`city theme-${profile.theme}`} style={{ '--particle': particle }}>
      <div className="city-bar">
        <div className="city-title">
          {visiting ? (
            <>
              <button className="ghost" onClick={onBack}><ArrowRight size={16} /> העיר שלי</button>
              <Avatar name={city.player.name} photo={city.player.photo} size={30} frame={profile.frame} />
              <div>
                <b>{profile.cityName || `העיר של ${city.player.name}`}</b>
                {profile.motto && <div className="motto">"{profile.motto}"</div>}
              </div>
            </>
          ) : (
            <>
              <Building2 size={18} className="accent" />
              <div>
                <b>{profile.cityName || 'העיר שלי'}</b>
                {profile.motto && <div className="motto">"{profile.motto}"</div>}
              </div>
            </>
          )}
        </div>

        {visiting && vote?.open && (
          vote.myVote === city.player.id
            ? <span className="vote-done"><Heart size={15} fill="currentColor" /> הצבעת לעיר הזו</span>
            : <button className="vote-btn" onClick={() => onVote(city.player.id)}><Heart size={15} /> הצבע לעיר היפה של השבוע</button>
        )}

        <div className="city-stats">
          <div className="ring" style={{ '--p': coverage }} title={`${coverage}% מהמערכת`}><span>{coverage}%</span></div>
          <div className="city-stat"><b>{owned.size}<small>/{total}</small></b><span>רכיבים</span></div>
          <div className="city-stat"><b>{litLinks}</b><span>חיבורים פעילים</span></div>
          <div className="city-stat"><b><Coin value={city.value} size={14} /></b><span>שווי העיר</span></div>
        </div>
      </div>

      {placing && (
        <div className="placing-bar">
          <MousePointerClick size={16} /> לחץ על המקום במפה שבו תרצה להציב: {decoMeta[placing]?.emoji} {decoMeta[placing]?.label}
          <button className="ghost" onClick={onCancelPlacing}><X size={14} /> ביטול</button>
        </div>
      )}

      <div className="city-body">
        <div className={`canvas${placing ? ' placing' : ''}`} dir="ltr">
          <ReactFlow
            nodes={shownNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(changes) => setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type === 'position' || c.type === 'dimensions'), ns))}
            onNodeDragStop={(_, n) => n.type === 'decoration' && onMoveDecoration(n.id.slice(5), Math.round(n.position.x), Math.round(n.position.y))}
            nodesConnectable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            onNodeClick={(_, n) => n.type === 'component' && setSelectedId(n.id)}
            onPaneClick={onPaneClick}
            minZoom={0.05}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.type === 'decoration' ? 'transparent' : owned.has(n.id) ? domainsById[n.data?.domainId]?.color || '#8892a6' : '#243150')}
              maskColor="var(--minimap-mask)"
            />
          </ReactFlow>
          {city.prank === 'rain' && (
            <div className="rain" aria-hidden="true">
              {Array.from({ length: 60 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${0.6 + (i % 7) * 0.12}s`, '--delay': `${(i % 10) * 0.15}s` }} />)}
            </div>
          )}
          {owned.size === 0 && (
            <div className="city-empty" dir="rtl">
              <Building2 size={20} />
              {visiting
                ? `${city.player.name} עוד לא קנה/תה רכיבים`
                : 'העיר שלך עוד ריקה. נחש טוב בתחזיות, אסוף דינרים ולחץ על רכיב כדי לקנות אותו'}
            </div>
          )}
        </div>

        {selected && (
          <aside className="inspector component-card" style={{ '--domain': domainsById[selected.data.domainId]?.color || '#8892a6' }}>
            <button className="ghost icon-btn card-close" onClick={() => setSelectedId(null)} aria-label="סגור"><X size={16} /></button>
            <div className="card-hero">
              <div className="comp-icon big"><TypeIcon type={selected.data.type} size={26} /></div>
              <div>
                <h2>{selected.data.name}</h2>
                <span className="domain-pill">{domainsById[selected.data.domainId]?.name || 'ללא תחום'}</span>
              </div>
            </div>

            {incidentOf(selected.id) && (
              <div className="incident-note"><Flame size={15} /> תקלה פעילה: {incidentOf(selected.id).description}. הרכיב לא מכניס עד שהיא תטופל.</div>
            )}

            {selected.data.description && <p className="card-desc">{selected.data.description}</p>}
            {selected.data.owner && <p className="muted card-row"><User size={14} /> אחראי: {selected.data.owner}</p>}

            <div>
              <div className="card-label"><Plug size={14} /> מחובר ל</div>
              <ul className="neighbors">
                {neighbors(selected.id).map((n) => (
                  <li key={n.id} onClick={() => setSelectedId(n.id)}>
                    {owned.has(n.id) ? <Check size={14} className="ok" /> : <Lock size={14} className="muted" />}
                    {n.data.name}
                  </li>
                ))}
                {!neighbors(selected.id).length && <li className="muted">אין חיבורים</li>}
              </ul>
            </div>

            {owned.has(selected.id) ? (
              <>
                <div className="owned-badge"><Check size={16} /> {visiting ? `בבעלות ${city.player.name}` : 'הרכיב שלך'} · {LEVEL_LABEL[level]}</div>
                {mine && level < 3 && (
                  <>
                    <button className="upgrade-btn" disabled={balance < upgradeCost} onClick={() => onUpgrade(selected.id, upgradeCost, level + 1)}>
                      <ArrowUpCircle size={16} /> שדרג לרמה {level + 1} ב-<Coin value={upgradeCost} size={13} />
                    </button>
                    <p className="muted small center">
                      רמה {level + 1} מכניסה פי {catalog.levelIncomeMult[level + 1]} כל ערב, ונראית {level === 1 ? 'זוהרת' : 'אגדית'} במפה
                    </p>
                  </>
                )}
              </>
            ) : mine && (
              <>
                <button className="primary big-btn" disabled={balance < price} onClick={() => onBuy(selected.id)}>
                  <Hammer size={16} /> קנה ב-<Coin value={price} size={14} />
                </button>
                {balance < price && (
                  <p className="muted small center">חסרים לך {(price - balance).toLocaleString()} דינרים</p>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default function CityMap(props) {
  return (
    <EditorContextProvider {...props}>
      <ReactFlowProvider>
        <CityCanvas {...props} />
      </ReactFlowProvider>
    </EditorContextProvider>
  );
}

// The node renderer reads ownership, levels and fire from context.
function EditorContextProvider({ architecture, city, justBought, children }) {
  const domainsById = useMemo(() => Object.fromEntries(architecture.domains.map((d) => [d.id, d])), [architecture]);
  const value = useMemo(() => ({
    domainsById, highlightDomain: null, owned: city.owned, levels: city.levels, burning: city.burning,
    justBought, celebration: city.profile.celebration,
  }), [domainsById, city, justBought]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
