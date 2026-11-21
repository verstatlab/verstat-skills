const COLUMNS = ['situation', 'code-does', 'person-sees', 'code'];
const COLS = '28px minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.1fr) 150px';

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.modes.length) return null;
  const head = el('div', { class: 'vs-table-row vs-table-head' },
    [el('span', {}, '#'), ...COLUMNS.map((k, i) => el('span', { class: i === COLUMNS.length - 1 ? 'vs-table-code' : null }, ctx.t(`failure-modes.${k}`)))]);
  return el('div', { class: 'vs-table vs-fm' }, el('div', { class: 'vs-table-grid', style: `--vs-table-cols:${COLS};--vs-table-min:760px` }, [
    head,
    ...block.modes.map((m, i) => {
      const chips = [];
      if (m.anchor) chips.push(ctx.anchorChip(m.anchor));
      if (m.source) chips.push(ctx.sourceChip(m.source));
      return ctx.part(el('div', { class: `vs-table-row vs-fm-row${ctx.isInferred(m) ? ' vs-inferred' : ''}` }, [
        el('span', { class: 'vs-table-num' }, String(i + 1).padStart(2, '0')),
        el('span', { class: 'vs-table-main vs-fm-sit' }, m.situation),
        el('span', { class: 'vs-table-text vs-fm-beh' }, m.behavior),
        el('span', { class: 'vs-table-mono vs-fm-vis', 'data-no-terms': '' }, m.visible),
        el('div', { class: 'vs-table-code' }, chips.length ? el('div', { class: 'vs-chips' }, chips) : '—'),
      ]), m.id);
    }),
  ]));
}
