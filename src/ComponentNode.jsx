import { createContext, memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, Flame, Star } from 'lucide-react';
import { COMPONENT_TYPES } from './model.js';
import { Coin, TypeIcon } from './icons.jsx';

// Shared lookups for every node without threading props through React Flow.
// owned:      null in the admin editor; a Set of component ids on a player's map.
// levels:     { componentId: 2 | 3 } upgrade levels of the city being shown.
// burning:    Set of component ids with an open incident.
// justBought: id of a component bought a moment ago, to play a short celebration.
// celebration: which celebration animation the city owner bought.
export const EditorContext = createContext({
  domainsById: {}, highlightDomain: null, owned: null, levels: {}, burning: new Set(), justBought: null, celebration: 'pulse',
});

function ComponentNode({ id, data, selected }) {
  const { domainsById, highlightDomain, owned, levels = {}, burning, justBought, celebration } = useContext(EditorContext);
  const domain = domainsById[data.domainId];
  const type = COMPONENT_TYPES[data.type] || COMPONENT_TYPES.other;
  const color = domain?.color || '#8892a6';
  const dimmed = highlightDomain && highlightDomain !== data.domainId;
  const ghost = owned && !owned.has(id);
  const editable = !owned;
  const level = levels[id] || 1;
  const onFire = burning?.has(id);

  const classes = ['comp-node'];
  if (selected) classes.push('selected');
  if (dimmed) classes.push('dimmed');
  if (ghost) classes.push('ghost');
  if (owned && !ghost) classes.push('owned', `lvl${level}`);
  if (onFire) classes.push('burning');
  if (justBought === id) classes.push('celebrate', `celebrate-${celebration || 'pulse'}`);

  return (
    <div className={classes.join(' ')} style={{ '--domain': color }} dir="rtl">
      <Handle type="target" position={Position.Left} isConnectable={editable} />
      <div className="comp-icon"><TypeIcon type={data.type} locked={Boolean(ghost)} /></div>
      <div className="comp-body">
        <div className="comp-name" title={data.name}>
          {data.name || 'ללא שם'}
          {owned && !ghost && level > 1 && (
            <span className="lvl-stars">{Array.from({ length: level - 1 }, (_, i) => <Star key={i} size={10} fill="currentColor" />)}</span>
          )}
        </div>
        <div className="comp-meta">
          <span>{domain?.name || type.label}</span>
          {onFire
            ? <span className="comp-fire"><Flame size={12} /> תקלה</span>
            : owned && !ghost
              ? <span className="comp-owned"><Check size={12} strokeWidth={3} /> שלך</span>
              : <Coin value={data.price} size={11} className="comp-price" />}
        </div>
      </div>
      {onFire && <div className="flames" aria-hidden="true">🔥</div>}
      {justBought === id && celebration && celebration !== 'pulse' && (
        <div className={`burst burst-${celebration}`} aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
        </div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={editable} />
    </div>
  );
}

export default memo(ComponentNode);

// A decoration (tree, flag, statue...) the city owner placed on the map.
// The statue shows the owner's face.
export const DecorationNode = memo(({ data }) => (
  <div className={`deco deco-${data.type}`} title={data.label}>
    {data.type === 'statue' && data.photo
      ? <span className="statue"><img src={data.photo} alt="" /><span className="plinth" /></span>
      : <span className="deco-emoji">{data.emoji}</span>}
  </div>
));
