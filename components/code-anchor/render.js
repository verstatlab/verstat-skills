export default function (block, ctx) {
  const { el } = ctx;
  if (!block.items.length) return null;
  return el('ul', { class: 'vs-ca' }, block.items.map((item) => ctx.part(el('li', { class: ctx.isInferred(item) ? 'vs-inferred' : null }, [
    ctx.anchorChip(item.anchor, item.label),
    item.text ? el('span', { class: 'vs-ca-text' }, item.text) : el('span', {}),
    ctx.sourceChip(item.source),
  ]), item.id)));
}
