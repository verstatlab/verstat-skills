export default function (block, ctx) {
  const { el } = ctx;
  if (!block.items.length) return null;
  return el('ol', { class: 'vs-rf' }, block.items.map((item, i) => ctx.part(el('li', { class: ctx.isInferred(item) ? 'vs-inferred' : null }, [
    el('span', { class: `vs-rf-num${i === 0 ? ' vs-first' : ''}` }, String(i + 1)),
    el('div', { class: 'vs-rf-body' }, [
      el('span', { class: 'vs-rf-title' }, item.title),
      el('p', { class: 'vs-rf-text' }, item.text),
      item.anchor || item.source ? el('div', { class: 'vs-chips' }, [item.anchor ? ctx.anchorChip(item.anchor) : null, ctx.sourceChip(item.source)]) : null,
    ]),
  ]), item.id)));
}
