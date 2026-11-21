const CSS = `
.vs-cfg { overflow-x: auto; border-top: var(--vs-rw) solid var(--vs-rule-strong); }
.vs-cfg-grid { min-width: 760px; }
.vs-cfg-row { display: grid; grid-template-columns: 190px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr); border-bottom: 1px solid var(--vs-rule); }
.vs-cfg-row.vs-focus { outline-offset: -2px; }
.vs-cfg-row > * { padding: 11px 8px; min-width: 0; }
.vs-cfg-head > * { padding: 10px 8px; }
.vs-cfg-name { font-family: var(--vs-mono); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.vs-cfg-def { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font-family: var(--vs-mono); font-size: 12.5px; overflow-wrap: anywhere; }
.vs-cfg-envs { display: flex; flex-direction: column; gap: 2px; font-family: var(--vs-mono); font-size: 12.5px; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-cfg-envs b { color: var(--vs-ink); font-weight: 400; }
.vs-cfg-aff { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; line-height: 1.4; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-config-panel')) {
  const style = document.createElement('style');
  style.id = 'vs-css-config-panel';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.params.length) return null;
  const head = el('div', { class: 'vs-cfg-row vs-cfg-head' }, ['param', 'default', 'envs', 'affects'].map((k) => el('span', { class: 'vs-label' }, ctx.t(`config-panel.${k}`))));
  const rows = block.params.map((p) => {
    const envs = Object.entries(p.values || {});
    const chips = (p.affectsAnchors || []).map((a) => ctx.anchorChip(a));
    if (p.source) chips.push(ctx.sourceChip(p.source));
    return ctx.part(el('div', { class: `vs-cfg-row${ctx.isInferred(p) ? ' vs-inferred' : ''}` }, [
      el('span', { class: 'vs-cfg-name', 'data-no-terms': '' }, p.name),
      el('div', { class: 'vs-cfg-def' }, [
        el('span', { 'data-no-terms': '' }, p.default === undefined ? '—' : p.default),
        p.anchor ? ctx.anchorChip(p.anchor) : null,
      ]),
      el('div', { class: 'vs-cfg-envs', 'data-no-terms': '' }, envs.length
        ? envs.map(([env, value]) => el('span', {}, [`${env} = `, el('b', {}, value)]))
        : '—'),
      el('div', { class: 'vs-cfg-aff' }, [
        el('span', {}, p.affects),
        chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
      ]),
    ]), p.id);
  });
  return el('div', { class: 'vs-cfg' }, el('div', { class: 'vs-cfg-grid' }, [head, ...rows]));
}
