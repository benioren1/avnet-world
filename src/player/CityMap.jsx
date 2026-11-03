import { useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRight, Building2, Check, Hammer, Lock, Plug, User } from 'lucide-react';
import ComponentNode, { EditorContext } from '../ComponentNode.jsx';
import FlowEdge from '../FlowEdge.jsx';
import Avatar from '../Avatar.jsx';
import { Coin, TypeIcon } from '../icons.jsx';

const nodeTypes = { component: ComponentNode };
const edgeTypes = { flow: FlowEdge };

// One shared map for everyone; each player sees their own purchases lit up.
// value: the city's worth as the server computes it (what was actually paid).
export default function CityMap({ architecture, owned, value, visiting, balance, justBought, onBuy, onBack }) {
  const [selectedId, setSelectedId] = useState(null);
  const domainsById = useMemo(() => Object.fromEntries(architecture.domains.map((d) => [d.id, d])), [architecture]);
  const ctx = useMemo(() => ({ domainsById, highlightDomain: null, owned, justBought }), [domainsById, owned, justBought]);

  // A connection lights up (with flowing data) only when both of its ends are owned.
  const edges = useMemo(() => architecture.edges.map((e) => {
    const lit = owned.has(e.source) && owned.has(e.target);
    return lit
      ? { ...e, type: 'flow', className: 'lit' }
      : { ...e, type: 'smoothstep', className: 'dark', label: '' };
  }), [architecture, owned]);

  const nodes = useMemo(() => architecture.nodes.map((n) => ({ ...n, draggable: false, selected: n.id === selectedId })), [architecture, selectedId]);

  const total = architecture.nodes.length;
  const coverage = total ? Math.round((owned.size / total) * 100) : 0;
  const litLinks = edges.filter((e) => e.type === 'flow').length;
  const selected = architecture.nodes.find((n) => n.id === selectedId);
  const price = Number(selected?.data.price) || 0;

  const neighbors = (id) => architecture.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => architecture.nodes.find((n) => n.id === (e.source === id ? e.target : e.source)))
    .filter(Boolean);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="city">
        <div className="city-bar">
          <div className="city-title">
            {visiting ? (
              <>
                <button className="ghost" onClick={onBack}><ArrowRight size={16} /> העיר שלי</button>
                <Avatar name={visiting.name} photo={visiting.photo} size={30} />
                <b>העיר של {visiting.name}</b>
              </>
            ) : (
              <><Building2 size={18} className="accent" /><b>העיר שלי</b></>
            )}
          </div>

          <div className="city-stats">
            <div className="ring" style={{ '--p': coverage }} title={`${coverage}% מהמערכת`}>
              <span>{coverage}%</span>
            </div>
            <div className="city-stat"><b>{owned.size}<small>/{total}</small></b><span>רכיבים</span></div>
            <div className="city-stat"><b>{litLinks}</b><span>חיבורים פעילים</span></div>
            <div className="city-stat"><b><Coin value={value} size={14} /></b><span>שווי העיר</span></div>
          </div>
        </div>

        <div className="city-body">
          <div className="canvas" dir="ltr">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesConnectable={false}
                nodesDraggable={false}
                edgesFocusable={false}
                deleteKeyCode={null}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                minZoom={0.05}
                fitView
                fitViewOptions={{ padding: 0.15 }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid)" />
                <Controls showInteractive={false} />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) => (owned.has(n.id) ? domainsById[n.data?.domainId]?.color || '#8892a6' : '#243150')}
                  maskColor="var(--minimap-mask)"
                />
              </ReactFlow>
            </ReactFlowProvider>
            {owned.size === 0 && !visiting && (
              <div className="city-empty" dir="rtl">
                <Building2 size={20} />
                העיר שלך עוד ריקה. נחש טוב בתחזיות, אסוף מטבעות ולחץ על רכיב כדי לקנות אותו
              </div>
            )}
          </div>

          {selected && (
            <aside className="inspector component-card" style={{ '--domain': domainsById[selected.data.domainId]?.color || '#8892a6' }}>
              <div className="card-hero">
                <div className="comp-icon big"><TypeIcon type={selected.data.type} size={26} /></div>
                <div>
                  <h2>{selected.data.name}</h2>
                  <span className="domain-pill">{domainsById[selected.data.domainId]?.name || 'ללא תחום'}</span>
                </div>
              </div>

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
                <div className="owned-badge"><Check size={16} /> {visiting ? `בבעלות ${visiting.name}` : 'הרכיב שלך'}</div>
              ) : !visiting && (
                <>
                  <button className="primary big-btn" disabled={balance < price} onClick={() => onBuy(selected.id)}>
                    <Hammer size={16} /> קנה ב-<Coin value={price} size={14} />
                  </button>
                  {balance < price && (
                    <p className="muted small center">חסרים לך {(price - balance).toLocaleString()} מטבעות. נחש טוב מחר 😉</p>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </EditorContext.Provider>
  );
}
