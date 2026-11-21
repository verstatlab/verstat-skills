const CSS = `
.vs-dt-row.vs-added .vs-dt-mark { color: var(--vs-add); font-weight: 600; }
.vs-dt-row.vs-removed .vs-dt-mark { color: var(--vs-del); font-weight: 600; }
.vs-dt-row.vs-changed .vs-dt-mark { color: var(--vs-accent-ink); font-weight: 600; }
.vs-dt-cell { font-family: var(--vs-mono); font-size: 13px; line-height: 1.45; }
.vs-dt-any { color: var(--vs-muted); }
.vs-dt-empty { display: inline-block; padding: 1px 6px; background: repeating-linear-gradient(135deg, var(--vs-surface) 0 6px, transparent 6px 12px); color: var(--vs-muted); font-family: var(--vs-mono); font-size: 11px; }
.vs-dt-none { color: var(--vs-accent-ink); font-family: var(--vs-mono); font-size: 12px; }
.vs-dt-out { display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.4; }
.vs-dt-warn { font-size: 12.5px; padding-top: 0; font-family: var(--vs-font); white-space: normal; align-items: baseline; }
.vs-dt-note { color: var(--vs-muted); font-size: 12px; }
.vs-dt-was { color: var(--vs-muted); text-decoration: line-through; margin-right: 6px; }
.vs-dt-row.vs-dt-same { opacity: .6; }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="decision-table"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'decision-table');
  style.textContent = CSS;
  document.head.appendChild(style);
}

verstat.behavior = verstat.behavior || {};
verstat.behavior.decisionTable = {
  conflicts(conditions, rows) {
    const filled = (v) => typeof v === 'string' && v !== '';
    const pairs = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (!filled(a.outcome) || !filled(b.outcome) || a.outcome === b.outcome) continue;
        const overlap = conditions.every((c) => {
          const x = (a.when || {})[c.id];
          const y = (b.when || {})[c.id];
          if (!filled(x) || !filled(y)) return false;
          return x === '*' || y === '*' || x === y;
        });
        if (overlap) pairs.push([a.id, b.id]);
      }
    }
    return pairs;
  },
};

export default function (block, ctx) {
  const { el, diff } = ctx;
  const visible = block.rows.filter((r) => diff.shows(r));
  if (!visible.length) return null;
  const conds = block.conditions;
  const oldBasis = (r) => {
    if (diff.mode !== 'before' || r.change !== 'changed' || !r.before) return null;
    if (r.before.anchor) return 'checked';
    return r.before.literal !== undefined && r.before.literal !== r.literal ? 'unanchored' : null;
  };
  const rows = visible.map((r) => ({
    part: r,
    id: r.id,
    when: diff.mode === 'before' && r.change === 'changed' && r.before && r.before.when ? Object.assign({}, r.when, r.before.when) : r.when,
    outcome: diff.value(r, 'outcome'),
    anchor: oldBasis(r) === 'unanchored' ? undefined : diff.value(r, 'anchor'),
    source: { checked: (r.before && r.before.source) || r.source, unanchored: 'inferred' }[oldBasis(r)] || (oldBasis(r) ? undefined : r.source),
  }));
  const number = new Map(rows.map((r, i) => [r.id, i + 1]));
  const against = new Map();
  const live = diff.mode === 'diff' ? rows.filter((r) => r.part.change !== 'removed') : rows;
  for (const [a, b] of verstat.behavior.decisionTable.conflicts(conds, live)) {
    against.set(a, (against.get(a) || []).concat(b));
    against.set(b, (against.get(b) || []).concat(a));
  }
  const inDiff = diff.mode === 'diff';
  const columns = `28px repeat(${conds.length}, minmax(min-content, 1fr)) minmax(min-content, 1.4fr) max-content`;
  const minWidth = 28 + conds.length * 126 + 176 + 166;

  const was = (r, value, old) => (inDiff && r.part.change === 'changed' && old !== undefined && old !== value
    ? el('span', { class: 'vs-dt-was' }, old === '' ? '∅' : old) : null);

  const header = el('div', { class: 'vs-table-row vs-table-head' }, [
    el('span', {}, inDiff ? '±' : '#'),
    ...conds.map((c) => ctx.part(el('span', {}, c.label), c.id)),
    el('span', {}, block.outcomeLabel || ctx.t('decision-table.outcome')),
    el('span', { class: 'vs-table-code' }, ctx.t('decision-table.code')),
  ]);

  const body = rows.map((r, i) => {
    const before = (r.part.before && r.part.before.when) || {};
    const cells = conds.map((c) => {
      const v = r.when[c.id];
      if (typeof v !== 'string' || v === '') {
        return el('div', { class: 'vs-dt-cell' }, [was(r, '', before[c.id]), el('span', { class: 'vs-dt-empty', title: ctx.t('decision-table.emptyTitle') }, ctx.t('decision-table.empty'))]);
      }
      return el('div', { class: `vs-dt-cell${v === '*' ? ' vs-dt-any' : ''}` }, [was(r, v, before[c.id]), v === '*' ? ctx.t('decision-table.any') : v]);
    });
    const conflict = against.get(r.id);
    const outcome = el('div', { class: 'vs-dt-out' }, [
      el('span', {}, [
        was(r, r.outcome, r.part.before && r.part.before.outcome),
        r.outcome ? r.outcome : el('span', { class: 'vs-dt-none' }, ctx.t('decision-table.undefined')),
      ]),
      conflict ? el('span', { class: 'vs-state vs-state-problem vs-dt-warn' }, ctx.plural(conflict.length, 'decision-table.conflict', { rows: conflict.map((id) => number.get(id)).join(', ') })) : null,
      r.part.note ? el('span', { class: 'vs-dt-note' }, r.part.note) : null,
    ]);
    const chips = [];
    if (r.anchor) chips.push(ctx.anchorChip(r.anchor));
    if (r.source) chips.push(ctx.sourceChip(r.source));
    const code = el('div', { class: 'vs-table-code', 'data-no-terms': true }, chips.length ? el('div', { class: 'vs-chips' }, chips) : null);
    const marks = { added: '+', removed: '−', changed: '~' };
    const mark = `${inDiff ? (marks[r.part.change] || '') : ''}${i + 1}`;
    const cls = ['vs-table-row', 'vs-dt-row'];
    if (r.source === 'inferred') cls.push('vs-inferred');
    if (inDiff && !r.part.change) cls.push('vs-dt-same');
    const row = el('div', { class: cls.join(' ') }, [el('span', { class: 'vs-table-num vs-dt-mark' }, mark), ...cells, outcome, code]);
    diff.mark(row, r.part);
    return ctx.part(row, r.id);
  });

  return el('div', { class: 'vs-table' }, el('div', { class: 'vs-table-grid vs-table-fit', style: `--vs-table-cols:${columns};--vs-table-min:${minWidth}px` }, [header, ...body]));
}
