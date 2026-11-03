import { Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { COMPONENT_TYPES, totalValue } from '../model.js';

const SORTS = {
  name: (a, b) => a.data.name.localeCompare(b.data.name, 'he'),
  price: (a, b) => (Number(b.data.price) || 0) - (Number(a.data.price) || 0),
  links: null, // filled in per render, needs edge counts
};

// Table view for managing hundreds of components: search, filter, inline prices, bulk price change.
export default function ComponentsTable({ nodes, edges, domains, onNodeChange, onBulkPrice, onBeginEdit, onFocusNode, onDelete }) {
  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [issueFilter, setIssueFilter] = useState('');
  const [sort, setSort] = useState('name');
  const [percent, setPercent] = useState(10);

  const domainsById = useMemo(() => Object.fromEntries(domains.map((d) => [d.id, d])), [domains]);
  const links = useMemo(() => {
    const m = {};
    edges.forEach((e) => { m[e.source] = (m[e.source] || 0) + 1; m[e.target] = (m[e.target] || 0) + 1; });
    return m;
  }, [edges]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = nodes.filter((n) => {
      const d = n.data;
      if (domainFilter && d.domainId !== domainFilter) return false;
      if (issueFilter === 'noPrice' && Number(d.price) > 0) return false;
      if (issueFilter === 'noLinks' && links[n.id]) return false;
      if (issueFilter === 'noOwner' && d.owner) return false;
      if (!q) return true;
      return [d.name, d.owner, d.description, n.id].some((v) => String(v || '').toLowerCase().includes(q));
    });
    const cmp = sort === 'links' ? (a, b) => (links[b.id] || 0) - (links[a.id] || 0) : SORTS[sort];
    return filtered.sort(cmp);
  }, [nodes, query, domainFilter, issueFilter, sort, links]);

  const applyBulk = () => {
    if (!rows.length) return;
    onBulkPrice(rows.map((r) => r.id), percent);
  };

  return (
    <div className="page-panel table-panel">
      <div className="panel-head">
        <h2 className="title-with-icon"><Table2 size={20} className="accent" /> רכיבים ומחירים</h2>
        <span className="muted">{rows.length} מתוך {nodes.length} · שווי מסונן 🪙 {totalValue(rows).toLocaleString()}</span>
      </div>

      <div className="filters">
        <input className="search" placeholder="🔍 חיפוש לפי שם, בעלים, תיאור..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
          <option value="">כל התחומים</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={issueFilter} onChange={(e) => setIssueFilter(e.target.value)}>
          <option value="">הכל</option>
          <option value="noPrice">⚠️ בלי מחיר</option>
          <option value="noLinks">⚠️ בלי חיבורים</option>
          <option value="noOwner">⚠️ בלי בעלים</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">מיון: שם</option>
          <option value="price">מיון: מחיר</option>
          <option value="links">מיון: חיבורים</option>
        </select>
      </div>

      <div className="bulk">
        <span>שינוי מחיר לכל הרכיבים המסוננים:</span>
        <input type="number" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
        <span>%</span>
        <button onClick={applyBulk}>החל על {rows.length} רכיבים</button>
        <span className="muted">(מספר שלילי מוזיל)</span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>רכיב</th><th>סוג</th><th>תחום</th><th>מחיר 🪙</th><th>בעלים</th><th>חיבורים</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const d = n.data;
              const dom = domainsById[d.domainId];
              const set = (patch) => onNodeChange(n.id, patch);
              return (
                <tr key={n.id}>
                  <td><input value={d.name} onFocus={onBeginEdit} onChange={(e) => set({ name: e.target.value })} /></td>
                  <td>
                    <select value={d.type} onFocus={onBeginEdit} onChange={(e) => set({ type: e.target.value })}>
                      {Object.entries(COMPONENT_TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className="dot" style={{ background: dom?.color || '#8892a6' }} />
                    <select value={d.domainId} onFocus={onBeginEdit} onChange={(e) => set({ domainId: e.target.value })}>
                      <option value="">ללא</option>
                      {domains.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      className="price"
                      type="number"
                      min="0"
                      step="10"
                      value={d.price}
                      onFocus={onBeginEdit}
                      onChange={(e) => set({ price: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td><input value={d.owner} placeholder="—" onFocus={onBeginEdit} onChange={(e) => set({ owner: e.target.value })} /></td>
                  <td className="center">{links[n.id] || <span className="warn">0</span>}</td>
                  <td className="actions">
                    <button className="ghost" title="הצג במפה" onClick={() => onFocusNode(n.id)}>🎯</button>
                    <button className="ghost danger" title="מחק" onClick={() => onDelete(n.id)}>🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="muted center pad">אין רכיבים שמתאימים לסינון.</p>}
      </div>
    </div>
  );
}
