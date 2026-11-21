export default function (block, ctx) {
  const root = ctx.el('div', { class: 'fixture-note' }, [ctx.el('p', {}, block.text)]);
  if (block.anchor) root.append(ctx.anchorChip(block.anchor));
  for (const claim of block.claims || []) {
    const label = claim.source === 'inferred' ? `${claim.text} (inferred)` : claim.text;
    root.append(ctx.el('div', { 'data-part': claim.id }, [ctx.el('p', {}, label), ctx.anchorChip(claim.anchor)]));
  }
  return root;
}
