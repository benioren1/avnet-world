import { MousePointerClick, Plug } from 'lucide-react';
import { COMPONENT_TYPES } from '../model.js';

// Side panel for editing the selected component or connection.
// onBeginEdit is called on focus so a whole field edit is one undo step.
export default function Inspector({ node, edge, nodes, edges, domains, onNodeChange, onEdgeChange, onDelete, onBeginEdit, onFocusNode }) {
  if (edge) {
    const name = (id) => nodes.find((n) => n.id === id)?.data.name || id;
    return (
      <aside className="inspector">
        <h2 className="title-with-icon"><Plug size={18} className="accent" /> חיבור</h2>
        <p className="muted">{name(edge.source)} ← {name(edge.target)}</p>
        <label>
          מה עובר בחיבור
          <input
            value={edge.label || ''}
            placeholder="למשל: תוצרים, טוקנים, מטריקות"
            onFocus={onBeginEdit}
            onChange={(e) => onEdgeChange(edge.id, { label: e.target.value })}
          />
        </label>
        <button className="danger" onClick={onDelete}>🗑️ מחק חיבור</button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="inspector empty">
        <h2 className="title-with-icon"><MousePointerClick size={18} className="accent" /> עריכה</h2>
        <p className="muted">בחר רכיב או חיבור כדי לערוך אותו.</p>
        <ul className="tips">
          <li><b>דאבל-קליק</b> על רקע המפה מוסיף רכיב</li>
          <li><b>גרירה</b> מהעיגול הימני של רכיב לעיגול השמאלי של אחר יוצרת חיבור</li>
          <li><b>Delete</b> מוחק את מה שנבחר</li>
          <li><b>Ctrl+Z / Ctrl+Y</b> ביטול וחזרה</li>
          <li><b>Shift + גרירה</b> בוחר כמה רכיבים</li>
        </ul>
      </aside>
    );
  }

  const d = node.data;
  const set = (patch) => onNodeChange(node.id, patch);
  const incoming = edges.filter((e) => e.target === node.id).length;
  const outgoing = edges.filter((e) => e.source === node.id).length;

  return (
    <aside className="inspector">
      <h2>{(COMPONENT_TYPES[d.type] || COMPONENT_TYPES.other).icon} {d.name || 'רכיב חדש'}</h2>
      <label>
        שם
        <input value={d.name} onFocus={onBeginEdit} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row">
        <label>
          סוג
          <select value={d.type} onFocus={onBeginEdit} onChange={(e) => set({ type: e.target.value })}>
            {Object.entries(COMPONENT_TYPES).map(([key, t]) => (
              <option key={key} value={key}>{t.icon} {t.label}</option>
            ))}
          </select>
        </label>
        <label>
          תחום
          <select value={d.domainId} onFocus={onBeginEdit} onChange={(e) => set({ domainId: e.target.value })}>
            <option value="">ללא</option>
            {domains.map((dm) => <option key={dm.id} value={dm.id}>{dm.name}</option>)}
          </select>
        </label>
      </div>
      <label>
        מחיר בחנות 🪙
        <input
          type="number"
          min="0"
          step="10"
          value={d.price}
          onFocus={onBeginEdit}
          onChange={(e) => set({ price: e.target.value === '' ? '' : Number(e.target.value) })}
        />
      </label>
      <label>
        בעלים
        <input value={d.owner} placeholder="מי אחראי על הרכיב" onFocus={onBeginEdit} onChange={(e) => set({ owner: e.target.value })} />
      </label>
      <label>
        תיאור
        <textarea rows={3} value={d.description} onFocus={onBeginEdit} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <p className="muted">⬅️ {incoming} חיבורים נכנסים · ➡️ {outgoing} יוצאים</p>
      <div className="row">
        <button onClick={() => onFocusNode(node.id)}>🎯 מרכז במפה</button>
        <button className="danger" onClick={onDelete}>🗑️ מחק רכיב</button>
      </div>
    </aside>
  );
}
