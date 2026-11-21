const CSS = `
.vs-fl-field { font-family: var(--vs-mono); font-size: 13px; color: var(--vs-muted); margin-bottom: 10px; overflow-wrap: anywhere; }
.vs-fl-field b { color: var(--vs-ink); font-weight: 600; }
.vs-fl { display: flex; overflow-x: auto; border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); }
.vs-fl-stage { flex: 1 0 180px; padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid var(--vs-rule); background: var(--vs-bg); color: var(--vs-ink); min-width: 0; }
.vs-fl-stage:last-child { border-right: none; }
.vs-fl-stage.vs-focus { outline-offset: -3px; }
.vs-fl-hot { background: var(--vs-accent-soft); }
.vs-fl-hot .vs-fl-kind { color: var(--vs-accent-ink); opacity: 1; }
.vs-fl-kind { font-family: var(--vs-mono); font-size: 11px; font-weight: 600; letter-spacing: .04em; opacity: .8; }
.vs-fl-value { font-family: var(--vs-mono); font-size: 13px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.vs-fl-text { font-size: 12.5px; line-height: 1.4; opacity: .9; }
.vs-fl-stage .vs-chips { margin-top: auto; padding-top: 4px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-field-lineage')) {
  const style = document.createElement('style');
  style.id = 'vs-css-field-lineage';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.stages.length) return null;
  return el('div', {}, [
    el('div', { class: 'vs-fl-field', 'data-no-terms': '' }, [ctx.t('field-lineage.value'), ' ', el('b', {}, block.field)]),
    el('div', { class: 'vs-fl' }, block.stages.map((s, i) => {
      const chips = [];
      if (s.anchor) chips.push(ctx.anchorChip(s.anchor));
      if (s.source) chips.push(ctx.sourceChip(s.source));
      const cls = `vs-fl-stage${s.hot ? ' vs-fl-hot' : ''}${ctx.isInferred(s) ? ' vs-inferred' : ''}`;
      return ctx.part(el('div', { class: cls }, [
        el('span', { class: 'vs-fl-kind' }, `${i + 1} · ${ctx.t(`field-lineage.kind.${s.kind}`, null, s.kind)}`),
        el('span', { class: 'vs-fl-value', 'data-no-terms': '' }, s.value),
        el('span', { class: 'vs-fl-text' }, s.text),
        chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
      ]), s.id);
    })),
  ]);
}
