const CSS = `
.vs-calc { border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); background: var(--vs-bg); padding: 18px 20px; }
.vs-calc-inputs { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 10px; font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); }
.vs-calc-inputs b { font-weight: 600; color: var(--vs-ink); }
.vs-calc-steps { list-style: none; margin: 0; padding: 0; }
.vs-calc-step { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-top: 1px solid var(--vs-rule); }
.vs-calc-step.vs-focus { outline-offset: -2px; }
.vs-calc-n { font-family: var(--vs-mono); font-size: 12px; color: var(--vs-accent-ink); font-weight: 600; }
.vs-calc-body { display: flex; flex-direction: column; gap: 5px; min-width: 0; font-size: 14px; line-height: 1.4; }
.vs-calc-line { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; font-family: var(--vs-mono); font-size: 12px; background: var(--vs-surface); padding: 4px 8px; border-radius: var(--vs-r); }
.vs-calc-line code { font: inherit; overflow-wrap: anywhere; }
.vs-calc-val { font-weight: 600; }
.vs-calc-body .vs-chips { margin-top: 2px; }
.vs-calc-result { margin-top: 10px; display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--vs-r); background: var(--vs-accent-soft); font-weight: 600; }
.vs-calc-result span:last-child { font-family: var(--vs-mono); }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="calculation"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'calculation');
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.steps.length) return null;
  const inputs = block.inputs && block.inputs.length
    ? el('div', { class: 'vs-calc-inputs', 'data-no-terms': true }, [el('span', {}, ctx.t('calculation.input')), ...block.inputs.map((i) => el('span', {}, [`${i.name} = `, el('b', {}, String(i.value))]))])
    : null;
  const steps = el('ol', { class: 'vs-calc-steps' }, block.steps.map((s, i) => {
    const chips = [];
    if (s.anchor) chips.push(ctx.anchorChip(s.anchor));
    if (s.source) chips.push(ctx.sourceChip(s.source));
    return ctx.part(el('li', { class: `vs-calc-step${ctx.isInferred(s) ? ' vs-inferred' : ''}` }, [
      el('span', { class: 'vs-calc-n' }, String(i + 1).padStart(2, '0')),
      el('div', { class: 'vs-calc-body' }, [
        el('span', {}, s.label),
        el('div', { class: 'vs-calc-line', 'data-no-terms': true }, [el('code', {}, s.expr), el('span', { class: 'vs-calc-val' }, `= ${s.value}`)]),
        chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
      ]),
    ]), s.id);
  }));
  const result = block.result
    ? el('div', { class: 'vs-calc-result' }, [el('span', {}, block.result.label), el('span', {}, String(block.result.value))])
    : null;
  return el('div', { class: 'vs-calc' }, [inputs, steps, result]);
}
