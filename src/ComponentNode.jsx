import { createContext, memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check } from 'lucide-react';
import { COMPONENT_TYPES } from './model.js';
import { Coin, TypeIcon } from './icons.jsx';

// Shared lookups for every node without threading props through React Flow.
// owned: null in the admin editor; a Set of component ids on a player's map.
// justBought: id of a component bought a moment ago, to play a short celebration.
export const EditorContext = createContext({ domainsById: {}, highlightDomain: null, owned: null, justBought: null });

function ComponentNode({ id, data, selected }) {
  const { domainsById, highlightDomain, owned, justBought } = useContext(EditorContext);
  const domain = domainsById[data.domainId];
  const type = COMPONENT_TYPES[data.type] || COMPONENT_TYPES.other;
  const color = domain?.color || '#8892a6';
  const dimmed = highlightDomain && highlightDomain !== data.domainId;
  const ghost = owned && !owned.has(id);
  const editable = !owned;

  const classes = ['comp-node'];
  if (selected) classes.push('selected');
  if (dimmed) classes.push('dimmed');
  if (ghost) classes.push('ghost');
  if (owned && !ghost) classes.push('owned');
  if (justBought === id) classes.push('celebrate');

  return (
    <div className={classes.join(' ')} style={{ '--domain': color }} dir="rtl">
      <Handle type="target" position={Position.Left} isConnectable={editable} />
      <div className="comp-icon"><TypeIcon type={data.type} locked={Boolean(ghost)} /></div>
      <div className="comp-body">
        <div className="comp-name" title={data.name}>{data.name || 'ללא שם'}</div>
        <div className="comp-meta">
          <span>{domain?.name || type.label}</span>
          {owned && !ghost
            ? <span className="comp-owned"><Check size={12} strokeWidth={3} /> שלך</span>
            : <Coin value={data.price} size={11} className="comp-price" />}
        </div>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={editable} />
    </div>
  );
}

export default memo(ComponentNode);
