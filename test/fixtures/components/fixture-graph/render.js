export default function (block, ctx) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR' });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of block.nodes) g.setNode(node.id, { label: node.label, width: 120, height: 32 });
  for (const edge of block.edges) g.setEdge(edge.from, edge.to);
  dagre.layout(g);
  const rows = g.nodes().map((id) => {
    const n = g.node(id);
    return `${n.label}: x=${Math.round(n.x)} y=${Math.round(n.y)}`;
  });
  return ctx.el('pre', { class: 'fixture-graph' }, rows.join('\n'));
}
