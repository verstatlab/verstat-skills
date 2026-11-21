export default function (block, ctx) {
  const { el } = ctx;
  const items = (block.items || []).map((q) => ({ id: q.id, text: q.text, anchor: q.anchor }));
  for (const text of ctx.page.openQuestions || []) items.push({ text });
  if (!items.length) return null;
  return el('ol', { class: 'vs-oq' }, items.map((q, i) => ctx.part(el('li', {}, [
    el('span', { class: 'vs-oq-num' }, `?${i + 1}`),
    el('div', { class: 'vs-oq-body' }, [
      el('p', {}, q.text),
      q.anchor ? el('div', { class: 'vs-chips' }, ctx.anchorChip(q.anchor)) : null,
    ]),
  ]), q.id)));
}
