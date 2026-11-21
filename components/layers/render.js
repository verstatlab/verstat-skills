if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="layers"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'layers');
  style.textContent = `
.vs-ly { display: flex; flex-direction: column; border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); overflow: hidden; }
.vs-ly-row { display: grid; grid-template-columns: 200px minmax(0, 1fr) 220px; }
.vs-ly-row > * { padding: 12px 16px; min-width: 0; }
.vs-ly-row + .vs-ly-row { border-top: 1px solid var(--vs-rule); }
.vs-ly-row.vs-ly-hl { background: var(--vs-surface); }
.vs-ly-hl .vs-chip { background: var(--vs-bg); }
.vs-ly-row.vs-focus { outline-offset: -2px; }
.vs-ly-role { padding-top: 14px; padding-bottom: 14px; font-weight: 600; font-size: 15px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--vs-rule); }
.vs-ly-pkg { font-family: var(--vs-mono); font-size: 12px; font-weight: 400; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-ly-files { display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.vs-ly-note { font-size: 13px; color: var(--vs-muted); margin: 0; }
.vs-ly-rule { font-family: var(--vs-mono); font-size: 11.5px; color: var(--vs-muted); display: flex; flex-direction: column; justify-content: center; gap: 6px; align-items: flex-start; overflow-wrap: anywhere; border-left: 1px solid var(--vs-rule); }
@media (max-width: 720px) {
  .vs-ly-row { grid-template-columns: 1fr; }
  .vs-ly-row > * { padding: 6px 16px; }
  .vs-ly-role { padding-top: 12px; border-right: none; }
  .vs-ly-rule { border-left: none; padding-bottom: 12px; }
  .vs-ly-rule:empty { display: none; }
}
`;
  document.head.appendChild(style);
}

export default function render(block, ctx) {
  const { el } = ctx;
  if (!block.layers || !block.layers.length) return null;
  return el('div', { class: 'vs-ly' }, block.layers.map((layer) => {
    const files = (layer.files || []).map((f) => {
      if (typeof f === 'string') return el('span', { class: 'vs-chip' }, f);
      if (f.anchor) return ctx.anchorChip(f.anchor, f.label);
      return el('span', { class: 'vs-chip' }, f.label || f.path);
    });
    const meta = [];
    if (layer.source) meta.push(ctx.sourceChip(layer.source));
    const cls = 'vs-ly-row' + (layer.highlight ? ' vs-ly-hl' : '') + (ctx.isInferred(layer) ? ' vs-inferred' : '');
    return ctx.part(el('div', { class: cls }, [
      el('div', { class: 'vs-ly-role' }, [
        el('span', {}, layer.role),
        layer.package ? el('span', { class: 'vs-ly-pkg', 'data-no-terms': true }, layer.package) : null,
      ]),
      el('div', { class: 'vs-ly-files' }, [
        files.length ? el('div', { class: 'vs-chips' }, files) : null,
        layer.note ? el('p', { class: 'vs-ly-note' }, layer.note) : null,
        meta.length ? el('div', { class: 'vs-chips' }, meta) : null,
      ]),
      el('div', { class: 'vs-ly-rule' }, [
        layer.rule ? el('span', {}, layer.rule) : null,
        layer.ruleAnchor ? ctx.anchorChip(layer.ruleAnchor) : null,
      ]),
    ]), layer.id);
  }));
}
