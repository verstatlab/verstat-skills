const CSS = `
.vs-inv { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); border-top: var(--vs-rw) solid var(--vs-rule-strong); border-left: 1px solid var(--vs-rule); }
.vs-inv-card { padding: 14px 16px; border-right: 1px solid var(--vs-rule); border-bottom: 1px solid var(--vs-rule); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.vs-inv-card.vs-focus { outline-offset: -3px; }
.vs-inv-text { font-size: 15px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.vs-inv-check { font-family: var(--vs-mono); font-size: 12px; color: var(--vs-muted); overflow-wrap: anywhere; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-invariants')) {
  const style = document.createElement('style');
  style.id = 'vs-css-invariants';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.invariants.length) return null;
  return el('div', { class: 'vs-inv' }, block.invariants.map((v) => {
    const chips = [ctx.anchorChip(v.anchor)];
    if (v.source) chips.push(ctx.sourceChip(v.source));
    return ctx.part(el('div', { class: `vs-inv-card${ctx.isInferred(v) ? ' vs-inferred' : ''}` }, [
      el('span', { class: 'vs-inv-text' }, v.text),
      v.check ? el('code', { class: 'vs-inv-check', 'data-no-terms': '' }, v.check) : null,
      el('div', { class: 'vs-chips' }, chips),
    ]), v.id);
  }));
}
