export default function (block, ctx) {
  const { el } = ctx;
  const entries = ctx.page.glossary || [];
  if (!entries.length) return null;
  return el('div', { class: 'vs-glossary', 'data-no-terms': '' }, entries.map((g) =>
    el('div', { class: `vs-glossary-card${ctx.isInferred(g) ? ' vs-inferred' : ''}` }, [
      el('div', { class: 'vs-term-head' }, [
        el('span', { class: 'vs-glossary-term' }, g.term),
        g.code ? el('span', { class: 'vs-mono vs-muted vs-glossary-code' }, g.code) : null,
      ]),
      el('p', { class: 'vs-glossary-def' }, g.definition),
      g.anchor || g.source ? el('div', { class: 'vs-chips' }, [g.anchor ? ctx.anchorChip(g.anchor) : null, ctx.sourceChip(g.source)]) : null,
    ])));
}
