import { Palette } from 'lucide-react';
import { DOMAIN_COLORS, newId } from '../model.js';

export default function DomainsPanel({ domains, nodes, onChange, onBeginEdit, onRemove }) {
  const count = (id) => nodes.filter((n) => n.data.domainId === id).length;
  const update = (id, patch) => onChange(domains.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = () => {
    onBeginEdit();
    onChange([...domains, { id: newId('d'), name: 'תחום חדש', color: DOMAIN_COLORS[domains.length % DOMAIN_COLORS.length] }]);
  };

  return (
    <div className="page-panel">
      <div className="panel-head">
        <h2 className="title-with-icon"><Palette size={20} className="accent" /> תחומים</h2>
        <button className="primary" onClick={add}>+ תחום</button>
      </div>
      <p className="muted">תחומים הם ה"שכונות" של הארכיטקטורה. כל רכיב שייך לתחום אחד והצבע שלו קובע את צבע הרכיב במפה.</p>
      <div className="domain-list">
        {domains.map((d) => (
          <div className="domain-row" key={d.id}>
            <input type="color" value={d.color} onFocus={onBeginEdit} onChange={(e) => update(d.id, { color: e.target.value })} />
            <input value={d.name} onFocus={onBeginEdit} onChange={(e) => update(d.id, { name: e.target.value })} />
            <span className="muted">{count(d.id)} רכיבים</span>
            <button className="danger ghost" onClick={() => onRemove(d.id)} title="מחק תחום (הרכיבים נשארים)">🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}
