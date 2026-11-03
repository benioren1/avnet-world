import dagre from '@dagrejs/dagre';

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 74;

// Arranges nodes left-to-right along the data flow.
// Nodes in the same domain are nudged together by sorting before layout.
export function autoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const sorted = [...nodes].sort((a, b) => (a.data.domainId || '').localeCompare(b.data.domainId || ''));
  sorted.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 } };
  });
}
