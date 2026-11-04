import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Flame, History, Siren } from 'lucide-react';
import { adminApi } from '../api.js';
import Avatar from '../Avatar.jsx';
import { Coin, TypeIcon } from '../icons.jsx';

const formatWhen = (iso) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

// Declaring an incident sets the component on fire on every player's map;
// resolving it rewards whoever handled it in real life.
export default function IncidentsPanel({ architecture, players, settings, onChange }) {
  const [list, setList] = useState([]);
  const [picked, setPicked] = useState([]);
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(null); // incident id
  const [handlerId, setHandlerId] = useState('');
  const [bonus, setBonus] = useState(settings.incidentBonus);
  const [msg, setMsg] = useState(null);

  const nodes = useMemo(() => architecture.nodes.filter((n) => !query || n.data.name.toLowerCase().includes(query.toLowerCase())), [architecture, query]);
  const load = useCallback(() => adminApi.get('/incidents').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const run = async (p, ok) => {
    try {
      await p;
      setMsg({ kind: 'ok', text: ok });
      await load();
      onChange();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const declare = (e) => {
    e.preventDefault();
    run(adminApi.post('/incidents', { componentIds: picked, description }).then(() => { setPicked([]); setDescription(''); }),
      '🚨 התקלה הוכרזה. הרכיבים בוערים אצל כל השחקנים');
  };

  const resolve = (incident) => run(
    adminApi.post(`/incidents/${incident.id}/resolve`, { handlerId: handlerId || null, bonus: Number(bonus) }).then(() => setResolving(null)),
    '✅ התקלה נסגרה',
  );

  const open = list.filter((i) => i.status === 'open');
  const closed = list.filter((i) => i.status === 'closed');
  const nameOf = Object.fromEntries(players.map((p) => [p.id, p]));

  return (
    <div className="page-panel narrow">
      <div className="panel-head">
        <h2 className="title-with-icon"><Siren size={20} className="danger-text" /> תקלות</h2>
        {msg && <span className={msg.kind === 'error' ? 'msg-error' : 'msg-ok'}>{msg.text}</span>}
      </div>
      <p className="muted">כשיש תקלה אמיתית, הכרז עליה כאן: הרכיב יעלה באש במפה של כל מי שמחזיק אותו, החיבורים שלו ייכבו והוא יפסיק להכניס. כשהתקלה טופלה, סגור אותה ובחר מי טיפל בה. הוא יקבל בונוס ואת התואר 🧯 כבאי.</p>

      {open.map((i) => (
        <div className="card incident-card" key={i.id}>
          <div className="incident-head">
            <Flame size={20} className="danger-text" />
            <b>{i.componentNames.join(', ')}</b>
            <span className="muted small">מאז {formatWhen(i.openedAt)}</span>
          </div>
          <p>{i.description}</p>
          {resolving === i.id ? (
            <div className="resolve-form">
              <div className="field-label">מי טיפל בתקלה?</div>
              <div className="bonus-players">
                <button type="button" className={`bonus-player${!handlerId ? ' selected' : ''}`} onClick={() => setHandlerId('')}>
                  <span className="none-avatar">—</span><span>אף אחד</span>
                </button>
                {players.filter((p) => p.active !== false).map((p) => (
                  <button type="button" key={p.id} className={`bonus-player${handlerId === p.id ? ' selected' : ''}`} onClick={() => setHandlerId(p.id)}>
                    <Avatar name={p.name} photo={p.photo} size={36} /><span>{p.name}</span>
                  </button>
                ))}
              </div>
              {handlerId && (
                <label className="row">בונוס: <input type="number" min="0" className="amount-input" value={bonus} onChange={(e) => setBonus(e.target.value)} /> דינרים</label>
              )}
              <div className="row">
                <button className="primary" onClick={() => resolve(i)}><CheckCircle2 size={16} /> סגור תקלה</button>
                <button className="ghost" onClick={() => setResolving(null)}>ביטול</button>
              </div>
            </div>
          ) : (
            <button className="primary" onClick={() => { setResolving(i.id); setHandlerId(''); setBonus(settings.incidentBonus); }}>
              <CheckCircle2 size={16} /> התקלה טופלה
            </button>
          )}
        </div>
      ))}

      <form className="card bonus-form" onSubmit={declare}>
        <h3 className="title-with-icon"><Siren size={16} /> הכרז על תקלה</h3>
        <div className="field-label">איזה רכיבים? ({picked.length} נבחרו)</div>
        <input placeholder="חפש רכיב..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="component-picker">
          {nodes.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`chip-btn${picked.includes(n.id) ? ' selected' : ''}`}
              onClick={() => setPicked((p) => (p.includes(n.id) ? p.filter((x) => x !== n.id) : [...p, n.id]))}
            >
              <TypeIcon type={n.data.type} size={14} /> {n.data.name}
            </button>
          ))}
        </div>
        <div className="field-label">מה קרה?</div>
        <input placeholder="למשל: קולט ה-FTP לא מקבל קבצים מהספק" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="bonus-submit">
          <button className="danger-btn" type="submit" disabled={!picked.length || !description.trim()}><Flame size={16} /> הכרז תקלה</button>
        </div>
      </form>

      {closed.length > 0 && (
        <div className="card">
          <h3 className="title-with-icon"><History size={16} /> תקלות שנסגרו</h3>
          {closed.map((i) => (
            <div className="bonus-row" key={i.id}>
              {i.handlerId ? <Avatar name={nameOf[i.handlerId]?.name} photo={nameOf[i.handlerId]?.photo} size={30} /> : <span className="none-avatar">—</span>}
              <div className="bonus-row-main">
                <b>{i.componentNames.join(', ')}</b>
                <span className="muted small">{i.description} · {formatWhen(i.openedAt)} עד {formatWhen(i.closedAt)}</span>
              </div>
              {i.handlerId && <span className="small">🧯 {nameOf[i.handlerId]?.name} <Coin value={i.bonus} size={12} /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
