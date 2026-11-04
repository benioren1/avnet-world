import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Panel,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, CheckCircle2, FolderOpen, Map as MapIcon, Palette, Plus, Redo2, Save, Table2, Trash2, Undo2, Wand2,
} from 'lucide-react';
import { Coin } from '../icons.jsx';
import { adminApi } from '../api.js';

import ComponentNode, { EditorContext } from '../ComponentNode.jsx';
import Inspector from './Inspector.jsx';
import ComponentsTable from './ComponentsTable.jsx';
import DomainsPanel from './DomainsPanel.jsx';
import { useHistory } from './useHistory.js';
import { autoLayout, NODE_HEIGHT, NODE_WIDTH } from '../layout.js';
import { makeNode, newId, sampleArchitecture, totalValue } from '../model.js';

const nodeTypes = { component: ComponentNode };
const defaultEdgeOptions = { type: 'smoothstep', markerEnd: { type: 'arrowclosed' } };

function withLayout(arch) {
  return { ...arch, nodes: autoLayout(arch.nodes, arch.edges) };
}

// Strip React Flow runtime fields (selected, measured, ...) before saving.
function serialize({ domains, nodes, edges }) {
  return {
    version: 1,
    domains,
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target, label, type, markerEnd }) => ({ id, source, target, label, type, markerEnd })),
  };
}

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

function Editor({ initial, onPersist, purchaseCounts = {} }) {
  const [domains, setDomains] = useState(initial.domains);
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [view, setView] = useState('map');
  const [selection, setSelection] = useState({ nodeId: null, edgeId: null });
  const [highlightDomain, setHighlightDomain] = useState(null);
  const [toast, setToast] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const wrapperRef = useRef(null);
  const fileRef = useRef(null);
  const { screenToFlowPosition, setCenter, fitView, getNode } = useReactFlow();

  const stateRef = useRef();
  stateRef.current = { domains, nodes, edges };
  const getCurrent = useCallback(() => serialize(stateRef.current), []);
  const history = useHistory(getCurrent);
  const { snapshot } = history;

  const restore = useCallback((arch) => {
    setDomains(arch.domains);
    setNodes(arch.nodes);
    setEdges(arch.edges);
    setSelection({ nodeId: null, edgeId: null });
  }, []);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(''), 5000);
  }, []);

  // Removing a component that players bought refunds them on save, and undo can't give it back.
  // Counts are fetched fresh: players may have bought it after this panel was opened.
  const confirmRemoval = useCallback(async (ids) => {
    if (!ids.length) return true;
    const counts = await adminApi.get('/purchase-counts').catch(() => purchaseCounts);
    const bought = ids.filter((id) => counts[id]);
    if (!bought.length) return true;
    const names = bought.map((id) => {
      const n = stateRef.current.nodes.find((x) => x.id === id);
      return `• ${n?.data.name || id}: ${counts[id]} שחקנים`;
    }).join('\n');
    return window.confirm(
      `שחקנים כבר קנו את הרכיבים האלה:\n${names}\n\n`
      + 'אם תמחק, הרכיב ייעלם מהעיר שלהם והכסף יחזור אליהם. אי אפשר לבטל את זה. להמשיך?',
    );
  }, [purchaseCounts]);

  // Ids of current components that a replacement architecture would drop.
  const missingFrom = (nextNodes) => {
    const keep = new Set(nextNodes.map((n) => n.id));
    return stateRef.current.nodes.filter((n) => !keep.has(n.id)).map((n) => n.id);
  };

  // Autosave to the server shortly after every change (skipping the initial load).
  const firstRender = useRef(true);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return undefined; }
    const t = setTimeout(() => {
      onPersist(serialize({ domains, nodes, edges }))
        .then((res) => {
          setSavedAt(new Date());
          setSaveError('');
          if (res?.refunded) notify(`💰 ${res.refunded} רכישות בוטלו והכסף הוחזר לשחקנים`);
        })
        .catch((e) => setSaveError(e.message));
    }, 700);
    return () => clearTimeout(t);
  }, [domains, nodes, edges, onPersist]);

  const undo = useCallback(() => { const s = history.undo(); if (s) restore(s); }, [history, restore]);
  const redo = useCallback(() => { const s = history.redo(); if (s) restore(s); }, [history, restore]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---- graph edits ----
  const onNodesChange = useCallback((changes) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onBeforeDelete = useCallback(async ({ nodes: doomed }) => {
    if (!(await confirmRemoval(doomed.map((n) => n.id)))) return false;
    snapshot();
    return true;
  }, [snapshot, confirmRemoval]);

  const onConnect = useCallback((conn) => {
    if (conn.source === conn.target) return;
    snapshot();
    setEdges((es) => addEdge({ ...conn, id: newId('e'), label: '', ...defaultEdgeOptions }, es));
  }, [snapshot]);

  const onSelectionChange = useCallback(({ nodes: sn, edges: se }) => {
    setSelection({
      nodeId: sn.length === 1 ? sn[0].id : null,
      edgeId: !sn.length && se.length === 1 ? se[0].id : null,
    });
  }, []);

  const addComponentAt = useCallback((pos) => {
    snapshot();
    const node = makeNode(
      { name: 'רכיב חדש', domainId: highlightDomain || '', price: 100 },
      { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    );
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
    setSelection({ nodeId: node.id, edgeId: null });
  }, [snapshot, highlightDomain]);

  const addAtCenter = () => {
    const r = wrapperRef.current.getBoundingClientRect();
    addComponentAt(screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }));
  };

  const onPaneClick = useCallback((e) => {
    if (e.detail === 2) addComponentAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [addComponentAt, screenToFlowPosition]);

  const updateNodeData = useCallback((id, patch) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const updateEdge = useCallback((id, patch) => {
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const deleteNode = useCallback(async (id) => {
    if (!(await confirmRemoval([id]))) return;
    snapshot();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelection({ nodeId: null, edgeId: null });
  }, [snapshot]);

  const deleteSelected = () => {
    if (selection.nodeId) deleteNode(selection.nodeId);
    else if (selection.edgeId) {
      snapshot();
      setEdges((es) => es.filter((e) => e.id !== selection.edgeId));
      setSelection({ nodeId: null, edgeId: null });
    }
  };

  const bulkPrice = (ids, percent) => {
    snapshot();
    const set = new Set(ids);
    const factor = 1 + percent / 100;
    setNodes((ns) => ns.map((n) => (set.has(n.id)
      ? { ...n, data: { ...n.data, price: Math.max(0, Math.round((Number(n.data.price) || 0) * factor)) } }
      : n)));
    notify(`המחיר עודכן ב-${percent}% ל-${ids.length} רכיבים`);
  };

  const focusNode = (id) => {
    setView('map');
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    setSelection({ nodeId: id, edgeId: null });
    setTimeout(() => {
      const n = getNode(id);
      if (n) setCenter(n.position.x + NODE_WIDTH / 2, n.position.y + NODE_HEIGHT / 2, { zoom: 1.3, duration: 600 });
    }, 60);
  };

  const runLayout = () => {
    snapshot();
    setNodes((ns) => autoLayout(ns, edges));
    setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 60);
  };

  const removeDomain = (id) => {
    snapshot();
    setDomains((ds) => ds.filter((d) => d.id !== id));
    setNodes((ns) => ns.map((n) => (n.data.domainId === id ? { ...n, data: { ...n.data, domainId: '' } } : n)));
    if (highlightDomain === id) setHighlightDomain(null);
  };

  // ---- import / export ----
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const arch = JSON.parse(await file.text());
      if (!Array.isArray(arch.nodes)) throw new Error('קובץ לא תקין');
      if (!(await confirmRemoval(missingFrom(arch.nodes)))) return;
      snapshot();
      restore({ domains: arch.domains || [], nodes: arch.nodes, edges: arch.edges || [] });
      setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 80);
      notify(`נטען קובץ עם ${arch.nodes.length} רכיבים. אפשר לבטל עם Ctrl+Z`);
    } catch (err) {
      notify(`❌ הייבוא נכשל: ${err.message}`);
    }
  };

  const exportJson = () => download(`architecture-${today()}.json`, JSON.stringify(getCurrent(), null, 2), 'application/json');

  const loadSample = async () => {
    const sample = withLayout(sampleArchitecture());
    if (!(await confirmRemoval(missingFrom(sample.nodes)))) return;
    snapshot();
    restore(sample);
    setTimeout(() => fitView({ duration: 500 }), 80);
    notify('נטענה ארכיטקטורת דוגמה. אפשר לבטל עם Ctrl+Z');
  };

  const clearAll = async () => {
    if (!window.confirm('למחוק את כל הרכיבים והחיבורים? (אפשר לבטל עם Ctrl+Z)')) return;
    if (!(await confirmRemoval(missingFrom([])))) return;
    snapshot();
    restore({ domains, nodes: [], edges: [] });
  };

  const domainsById = useMemo(() => Object.fromEntries(domains.map((d) => [d.id, d])), [domains]);
  const ctx = useMemo(() => ({ domainsById, highlightDomain, owned: null }), [domainsById, highlightDomain]);
  const selectedNode = nodes.find((n) => n.id === selection.nodeId);
  const selectedEdge = edges.find((e) => e.id === selection.edgeId);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="editor">
        <header className="subbar">
          <nav className="tabs">
            <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><MapIcon size={15} /> מפה</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><Table2 size={15} /> רכיבים ומחירים</button>
            <button className={view === 'domains' ? 'active' : ''} onClick={() => setView('domains')}><Palette size={15} /> תחומים</button>
          </nav>

          <div className="stats">
            <div><b>{nodes.length}</b><span>רכיבים</span></div>
            <div><b>{edges.length}</b><span>חיבורים</span></div>
            <div><b>{domains.length}</b><span>תחומים</span></div>
            <div><b><Coin value={totalValue(nodes)} size={14} /></b><span>שווי כולל</span></div>
          </div>
        </header>

        <div className="toolbar">
          <button className="primary" onClick={addAtCenter}><Plus size={16} /> רכיב</button>
          <button onClick={runLayout} title="מסדר את כל הרכיבים לפי זרימת הנתונים"><Wand2 size={15} /> סידור אוטומטי</button>
          <span className="sep" />
          <button className="icon-btn" onClick={undo} disabled={!history.canUndo} title="בטל (Ctrl+Z)"><Undo2 size={16} /></button>
          <button className="icon-btn" onClick={redo} disabled={!history.canRedo} title="חזור (Ctrl+Y)"><Redo2 size={16} /></button>
          <span className="sep" />
          <button onClick={exportJson} title="שומר עותק של כל הארכיטקטורה לקובץ"><Save size={15} /> גיבוי לקובץ</button>
          <button onClick={() => fileRef.current.click()} title="טוען ארכיטקטורה מקובץ גיבוי (מחליף את הנוכחית)"><FolderOpen size={15} /> טעינה מגיבוי</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={onImportFile} />
          <span className="sep" />
          <button className="ghost" onClick={loadSample}>דוגמה</button>
          <button className="ghost danger" onClick={clearAll}><Trash2 size={15} /> נקה הכל</button>
          <span className={`saved${saveError ? ' error' : ''}`}>
            {saveError
              ? <><AlertTriangle size={13} /> השמירה נכשלה: {saveError}</>
              : savedAt ? <><CheckCircle2 size={13} /> נשמר {savedAt.toLocaleTimeString('he-IL')}</> : ''}
          </span>
        </div>

        <main className="main">
          <div className="canvas" ref={wrapperRef} dir="ltr" style={{ display: view === 'map' ? 'block' : 'none' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onNodeDragStart={snapshot}
              onSelectionChange={onSelectionChange}
              onPaneClick={onPaneClick}
              zoomOnDoubleClick={false}
              deleteKeyCode={['Delete', 'Backspace']}
              multiSelectionKeyCode="Shift"
              snapToGrid
              snapGrid={[10, 10]}
              minZoom={0.05}
              fitView
              fitViewOptions={{ padding: 0.15 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => domainsById[n.data?.domainId]?.color || '#8892a6'}
                maskColor="var(--minimap-mask)"
              />
              <Panel position="top-left">
                <div className="legend" dir="rtl">
                  {domains.map((d) => (
                    <button
                      key={d.id}
                      className={`chip${highlightDomain === d.id ? ' on' : ''}`}
                      style={{ '--c': d.color }}
                      onClick={() => setHighlightDomain(highlightDomain === d.id ? null : d.id)}
                      title="הדגש תחום"
                    >
                      <span className="dot" /> {d.name}
                    </button>
                  ))}
                </div>
              </Panel>
              {!nodes.length && (
                <Panel position="top-center">
                  <div className="empty-hint" dir="rtl">המפה ריקה. דאבל-קליק על הרקע מוסיף רכיב.</div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {view === 'map' && (
            <Inspector
              node={selectedNode}
              edge={selectedEdge}
              nodes={nodes}
              edges={edges}
              domains={domains}
              onNodeChange={updateNodeData}
              onEdgeChange={updateEdge}
              onDelete={deleteSelected}
              onBeginEdit={snapshot}
              onFocusNode={focusNode}
            />
          )}

          {view === 'table' && (
            <ComponentsTable
              nodes={nodes}
              edges={edges}
              domains={domains}
              onNodeChange={updateNodeData}
              onBulkPrice={bulkPrice}
              onBeginEdit={snapshot}
              onFocusNode={focusNode}
              onDelete={deleteNode}
            />
          )}

          {view === 'domains' && (
            <DomainsPanel
              domains={domains}
              nodes={nodes}
              onChange={setDomains}
              onBeginEdit={snapshot}
              onRemove={removeDomain}
            />
          )}
        </main>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </EditorContext.Provider>
  );
}

export default function ArchitectureEditor({ initial, onPersist, purchaseCounts }) {
  return (
    <ReactFlowProvider>
      <Editor initial={initial} onPersist={onPersist} purchaseCounts={purchaseCounts} />
    </ReactFlowProvider>
  );
}
