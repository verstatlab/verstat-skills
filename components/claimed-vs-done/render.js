const CVD_STATUS = { found: 'ok', partial: 'partial', missing: 'problem' };
const COLS = '28px 140px minmax(0, 1fr) minmax(0, 220px)';

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.claims.length) return null;
  const head = el('div', { class: 'vs-table-row vs-table-head' }, [
    el('span', {}, '#'),
    el('span', {}, ctx.t('claimed-vs-done.state')),
    el('span', {}, ctx.t('claimed-vs-done.claimed')),
    el('span', { class: 'vs-table-code' }, ctx.t('claimed-vs-done.code')),
  ]);
  return el('div', { class: 'vs-table vs-cvd' }, el('div', { class: 'vs-table-grid', style: `--vs-table-cols:${COLS};--vs-table-min:600px` }, [
    head,
    ...block.claims.map((c, i) => {
      const chips = [];
      if (c.anchor) chips.push(ctx.anchorChip(c.anchor));
      if (c.source) chips.push(ctx.sourceChip(c.source));
      const label = ctx.t(`claimed-vs-done.status.${c.status}`, null, c.status);
      const state = CVD_STATUS[c.status] || 'minor';
      return ctx.part(el('div', { class: `vs-table-row vs-cvd-row${ctx.isInferred(c) ? ' vs-inferred' : ''}` }, [
        el('span', { class: 'vs-table-num' }, String(i + 1).padStart(2, '0')),
        el('span', { class: `vs-state vs-state-${state} vs-cvd-state`, 'data-status': c.status }, label),
        el('div', { class: 'vs-table-stack' }, [
          el('span', { class: 'vs-table-main vs-cvd-text' }, ctx.t('claimed-vs-done.quote', { text: c.text })),
          c.note ? el('span', { class: 'vs-table-sub vs-cvd-note' }, c.note) : null,
        ]),
        el('div', { class: 'vs-table-code' }, chips.length ? el('div', { class: 'vs-chips' }, chips) : null),
      ]), c.id);
    }),
  ]));
}
