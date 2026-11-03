import { useMemo, useState } from 'react';
import { Hammer, Plug, ShoppingBag } from 'lucide-react';
import { COMPONENT_TYPES } from '../model.js';
import { Coin, TypeIcon } from '../icons.jsx';

export default function Shop({ architecture, owned, balance, onBuy }) {
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const [onlyAffordable, setOnlyAffordable] = useState(false);

  const domainsById = useMemo(() => Object.fromEntries(architecture.domains.map((d) => [d.id, d])), [architecture]);

  // Components that connect to something the player already owns are marked as a natural next step.
  const connected = useMemo(() => {
    const s = new Set();
    architecture.edges.forEach((e) => {
      if (owned.has(e.source)) s.add(e.target);
      if (owned.has(e.target)) s.add(e.source);
    });
    return s;
  }, [architecture, owned]);

  const items = architecture.nodes
    .filter((n) => !owned.has(n.id))
    .filter((n) => !domain || n.data.domainId === domain)
    .filter((n) => !query || n.data.name.toLowerCase().includes(query.toLowerCase()))
    .filter((n) => !onlyAffordable || (Number(n.data.price) || 0) <= balance)
    .sort((a, b) => (connected.has(b.id) - connected.has(a.id)) || (Number(a.data.price) || 0) - (Number(b.data.price) || 0));

  return (
    <div className="page-panel">
      <div className="panel-head">
        <h2 className="title-with-icon"><ShoppingBag size={20} className="accent" /> חנות רכיבים</h2>
        <span className="balance-pill">יתרה <Coin value={balance} size={16} /></span>
      </div>
      <div className="filters">
        <input className="search" placeholder="חפש רכיב..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">כל התחומים</option>
          {architecture.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyAffordable} onChange={(e) => setOnlyAffordable(e.target.checked)} />
          רק מה שאני יכול לקנות
        </label>
      </div>

      <div className="shop-grid">
        {items.map((n) => {
          const price = Number(n.data.price) || 0;
          const dom = domainsById[n.data.domainId];
          const affordable = price <= balance;
          return (
            <div className={`card shop-item${affordable ? '' : ' expensive'}`} key={n.id} style={{ '--domain': dom?.color || '#8892a6' }}>
              <div className="shop-top">
                <span className="comp-icon"><TypeIcon type={n.data.type} /></span>
                <div>
                  <b>{n.data.name}</b>
                  <div className="muted small">{dom?.name || (COMPONENT_TYPES[n.data.type] || COMPONENT_TYPES.other).label}</div>
                </div>
              </div>
              {connected.has(n.id) && <span className="tag good"><Plug size={11} /> מתחבר לעיר שלך</span>}
              {n.data.description && <p className="small">{n.data.description}</p>}
              <div className="shop-buy">
                <Coin value={price} size={15} />
                <button className="primary" disabled={!affordable} onClick={() => onBuy(n.id)}>
                  <Hammer size={14} /> קנה
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!items.length && (
        <p className="muted center pad">
          {owned.size === architecture.nodes.length ? '🏆 קנית את כל הרכיבים! אתה אדריכל על' : 'אין רכיבים שמתאימים לסינון.'}
        </p>
      )}
    </div>
  );
}
