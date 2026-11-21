export default function (block, ctx) {
  const { el, diff } = ctx;
  const rows = block.rows.filter((r) => diff.shows(r));
  if (!rows.length) return null;
  ctx.mermaid(() => {
    const m = window.verstat.mermaid;
    return ['stateDiagram-v2']
      .concat(rows.map((r) => `  ${m.id(r.from)} --> ${m.id(diff.value(r, 'to'))}: ${m.label(diff.value(r, 'label') || '')}`))
      .join('\n');
  });
  return el('ul', { class: 'fixture-diff' }, rows.map((r) => {
    const anchor = diff.value(r, 'anchor');
    const row = el('li', {}, [
      el('span', {}, `${r.from} → ${diff.value(r, 'to')}`),
      el('span', { class: 'vs-muted' }, ` ${diff.value(r, 'label') || ''} `),
      anchor ? ctx.anchorChip(anchor) : null,
    ]);
    return ctx.part(diff.mark(row, r), r.id);
  }));
}
