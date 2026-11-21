const SEVERITY = {
  high: { key: 'high', rank: 3, state: 'problem' },
  medium: { key: 'medium', rank: 2, state: 'partial' },
  low: { key: 'low', rank: 1, state: 'minor' },
};
const SHOWN = 6;
const COLS = '28px 96px minmax(0, 1fr) minmax(0, 280px)';

function severityOf(r) {
  return SEVERITY[r.severity] || SEVERITY.low;
}

function sortRisks(risks) {
  return risks.map((r, i) => [r, i])
    .sort((a, b) => severityOf(b[0]).rank - severityOf(a[0]).rank || a[1] - b[1])
    .map(([r]) => r);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.risks.length) return null;
  const sorted = sortRisks(block.risks);
  const counts = ['high', 'medium', 'low']
    .map((k) => {
      const n = sorted.filter((r) => r.severity === k).length;
      return n ? ctx.plural(n, `risks.count.${k}`) : null;
    })
    .filter(Boolean);
  const summary = el('p', { class: 'vs-table-sum vs-risk-sum' },
    [ctx.plural(sorted.length, 'risks.risks'), ...counts].join(' · '));

  const rows = sorted.map((r, i) => {
    const sev = severityOf(r);
    const chips = [];
    if (r.anchor) chips.push(ctx.anchorChip(r.anchor));
    if (r.source) chips.push(ctx.sourceChip(r.source));
    return ctx.part(el('div', { class: `vs-table-row vs-risk-row${ctx.isInferred(r) ? ' vs-inferred' : ''}`, 'data-severity': r.severity }, [
      el('span', { class: 'vs-table-num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: `vs-state vs-state-${sev.state}` }, ctx.t(`risks.severity.${sev.key}`)),
      el('div', { class: 'vs-table-stack' }, [
        el('span', { class: 'vs-table-main vs-risk-title' }, r.title),
        el('span', { class: 'vs-table-sub vs-risk-cons' }, r.consequence),
      ]),
      el('div', { class: 'vs-table-code' }, [
        chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
        r.reference ? el('span', { class: 'vs-table-mono vs-risk-ref', 'data-no-terms': '' }, r.reference) : null,
      ]),
    ]), r.id);
  });

  const head = el('div', { class: 'vs-table-row vs-table-head' }, [
    el('span', {}, '#'),
    el('span', {}, ctx.t('risks.severity')),
    el('span', {}, ctx.t('risks.riskAndImpact')),
    el('span', { class: 'vs-table-code' }, ctx.t('risks.code')),
  ]);
  const table = el('div', { class: 'vs-table vs-risk' }, el('div', { class: 'vs-table-grid', style: `--vs-table-cols:${COLS};--vs-table-min:600px` }, [head, ...rows]));
  const hidden = rows.length - SHOWN;
  if (hidden <= 0) return el('div', {}, [summary, table]);

  let open = false;
  const more = el('button', { type: 'button', class: 'vs-table-more', onclick: () => setOpen(!open) });
  function setOpen(next) {
    open = next;
    rows.slice(SHOWN).forEach((row) => row.classList.toggle('vs-table-hidden', !open));
    more.replaceChildren(open ? ctx.t('risks.collapse') : ctx.t('risks.showMore', { n: hidden }));
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  setOpen(false);
  const late = new Set(sorted.slice(SHOWN).map((r) => r.id));
  ctx.onFocus((part) => { if (late.has(part)) setOpen(true); });
  return el('div', {}, [summary, table, more]);
}
