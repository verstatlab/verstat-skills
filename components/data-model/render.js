const CSS = `
.vs-dm { display: flex; flex-direction: column; gap: 18px; }
.vs-dm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 16px; }
.vs-dm-card { border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); overflow: hidden; align-self: start; min-width: 0; }
.vs-dm-head { padding: 10px 14px; background: var(--vs-surface); color: var(--vs-ink); border-bottom: var(--vs-rw) solid var(--vs-rule-strong); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.vs-dm-head .vs-chip { background: var(--vs-bg); }
.vs-dm-name { font-weight: 700; font-size: 16px; overflow-wrap: anywhere; }
.vs-dm-store { font-family: var(--vs-mono); font-size: 11.5px; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-dm-owner { font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); }
.vs-dm-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; padding: 6px 14px; border-bottom: 1px solid var(--vs-rule); font-size: 12.5px; }
.vs-dm-field:last-child { border-bottom: none; }
.vs-dm-hl { background: var(--vs-accent-soft); }
.vs-dm-fname { font-family: var(--vs-mono); overflow-wrap: anywhere; }
.vs-dm-hl .vs-dm-fname { font-weight: 600; }
.vs-dm-ftype { color: var(--vs-muted); }
.vs-dm-key { font-family: var(--vs-mono); font-size: 10px; font-weight: 600; color: var(--vs-accent-ink); margin-right: 6px; }
.vs-dm-fowner { font-family: var(--vs-mono); color: var(--vs-muted); text-align: right; }
.vs-dm-note { grid-column: 1 / -1; color: var(--vs-muted); font-size: 12px; line-height: 1.4; }
.vs-dm-fchips { grid-column: 1 / -1; }
.vs-dm-rels { list-style: none; margin: 0; padding: 0; border-top: var(--vs-rw) solid var(--vs-rule-strong); }
.vs-dm-rel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 0; border-bottom: 1px solid var(--vs-rule); font-size: 14px; }
.vs-dm-rel-ends { font-family: var(--vs-mono); font-weight: 600; font-size: 13px; }
.vs-dm-rel-kind { color: var(--vs-accent-ink); padding: 0 6px; }
.vs-dm-rel-label { color: var(--vs-muted); }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-data-model')) {
  const style = document.createElement('style');
  style.id = 'vs-css-data-model';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const KIND = { '1-1': '1—1', '1-n': '1—n', 'n-n': 'n—n' };

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.entities.length) return null;
  const chips = (obj, label) => {
    const out = [];
    if (obj.anchor) out.push(ctx.anchorChip(obj.anchor, label));
    if (obj.source) out.push(ctx.sourceChip(obj.source));
    return out;
  };

  const cards = el('div', { class: 'vs-dm-grid' }, block.entities.map((e) => {
    const head = chips(e);
    return ctx.part(el('div', { class: `vs-dm-card${ctx.isInferred(e) ? ' vs-inferred' : ''}` }, [
      el('div', { class: 'vs-dm-head' }, [
        el('span', { class: 'vs-dm-name' }, e.name),
        e.store ? el('span', { class: 'vs-dm-store', 'data-no-terms': '' }, e.store) : null,
        e.owner ? el('span', { class: 'vs-dm-owner' }, e.owner) : null,
        head.length ? el('div', { class: 'vs-chips' }, head) : null,
      ]),
      el('div', { class: 'vs-dm-fields' }, e.fields.map((f) => ctx.part(el('div', { class: `vs-dm-field${f.highlight ? ' vs-dm-hl' : ''}` }, [
        el('span', { class: 'vs-dm-fname', 'data-no-terms': '' }, [
          f.key ? el('span', { class: 'vs-dm-key' }, f.key.toUpperCase()) : null,
          f.name,
          f.type ? el('span', { class: 'vs-dm-ftype' }, ` ${f.type}`) : null,
        ]),
        el('span', { class: 'vs-dm-fowner' }, f.owner || ''),
        f.note ? el('span', { class: 'vs-dm-note' }, f.note) : null,
        f.anchor ? el('div', { class: 'vs-chips vs-dm-fchips' }, ctx.anchorChip(f.anchor)) : null,
      ]), f.id))),
    ]), e.id);
  }));

  const relations = block.relations || [];
  if (!relations.length) return el('div', { class: 'vs-dm' }, cards);
  return el('div', { class: 'vs-dm' }, [
    cards,
    el('ul', { class: 'vs-dm-rels' }, relations.map((r) => ctx.part(el('li', { class: `vs-dm-rel${ctx.isInferred(r) ? ' vs-inferred' : ''}` }, [
      el('span', { class: 'vs-dm-rel-ends', 'data-no-terms': '' }, [r.from, el('span', { class: 'vs-dm-rel-kind' }, KIND[r.kind] || r.kind), r.to]),
      r.label ? el('span', { class: 'vs-dm-rel-label' }, r.label) : null,
      ...chips(r),
    ]), r.id))),
  ]);
}
