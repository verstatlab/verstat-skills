const CSS = `
.vs-crud { overflow-x: auto; }
.vs-crud-grid { border-top: var(--vs-rw) solid var(--vs-rule-strong); }
.vs-crud-row { display: grid; border-bottom: 1px solid var(--vs-rule); }
.vs-crud-row.vs-focus { outline-offset: -2px; }
.vs-crud-headrow { border-bottom: var(--vs-rw) solid var(--vs-rule-strong); }
.vs-crud-th { padding: 10px 8px; font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.vs-crud-th + .vs-crud-th, .vs-crud-cell { border-left: 1px solid var(--vs-rule); }
.vs-crud-store { padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 0; }
.vs-crud-name { font-family: var(--vs-mono); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.vs-crud-kind { font-family: var(--vs-mono); font-size: 10.5px; color: var(--vs-muted); letter-spacing: .04em; }
.vs-crud-cache { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-family: var(--vs-mono); font-size: 11.5px; }
.vs-crud-key { color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-crud-ttl { padding: 0 6px; border: 1px solid var(--vs-accent-ink); color: var(--vs-accent-ink); border-radius: var(--vs-r); font-size: 11px; }
.vs-crud-cell { padding: 9px 8px; display: flex; flex-wrap: wrap; gap: 3px; align-content: center; align-items: center; min-width: 0; }
.vs-crud-op { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--vs-mono); font-size: 11px; font-weight: 700; border: 1.5px solid var(--vs-ink); line-height: 1; }
.vs-crud-op-C, .vs-crud-op-U { background: var(--vs-ink); color: var(--vs-bg); }
.vs-crud-op-R { background: transparent; color: var(--vs-ink); }
.vs-crud-op-D { background: var(--vs-accent); color: var(--vs-on-accent); }
.vs-crud-cell .vs-chip { margin-left: 4px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-crud-matrix')) {
  const style = document.createElement('style');
  style.id = 'vs-css-crud-matrix';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const OPS = ['C', 'R', 'U', 'D'];

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.stores.length || !block.actors.length) return null;
  const columns = `minmax(180px, 1.4fr) repeat(${block.actors.length}, minmax(96px, 1fr))`;
  const minWidth = 180 + block.actors.length * 110;
  const row = (cls, cells) => el('div', { class: cls, style: `grid-template-columns: ${columns}` }, cells);

  const head = row('vs-crud-row vs-crud-headrow', [
    el('span', { class: 'vs-crud-th' }, ctx.t('crud-matrix.store')),
    ...block.actors.map((a) => ctx.part(el('span', { class: 'vs-crud-th' }, [
      el('span', { 'data-no-terms': '' }, a.name),
      a.anchor ? ctx.anchorChip(a.anchor, ctx.t('crud-matrix.code')) : null,
    ]), a.id)),
  ]);

  const rows = block.stores.map((s) => {
    const byActor = new Map();
    for (const access of s.access) {
      if (!byActor.has(access.actor)) byActor.set(access.actor, []);
      byActor.get(access.actor).push(access);
    }
    return ctx.part(row('vs-crud-row', [
      el('div', { class: 'vs-crud-store' }, [
        el('span', { class: 'vs-crud-name', 'data-no-terms': '' }, s.name),
        el('span', { class: 'vs-crud-kind' }, ctx.t(`crud-matrix.kind.${s.kind}`, null, s.kind)),
        s.key || s.ttl ? el('span', { class: 'vs-crud-cache', 'data-no-terms': '' }, [
          s.key ? el('span', { class: 'vs-crud-key' }, s.key) : null,
          s.ttl ? el('span', { class: 'vs-crud-ttl', title: 'TTL' }, `TTL ${s.ttl}`) : null,
        ]) : null,
        s.anchor ? ctx.anchorChip(s.anchor) : null,
      ]),
      ...block.actors.map((a) => {
        const list = byActor.get(a.id);
        if (!list) return el('span', { class: 'vs-crud-cell' });
        const ops = OPS.filter((op) => list.some((access) => access.ops.includes(op)));
        const sources = [...new Set(list.map((access) => access.source).filter((src) => src && src !== 'code'))];
        return el('span', {
          class: `vs-crud-cell${list.every((access) => ctx.isInferred(access)) ? ' vs-inferred' : ''}`,
          title: `${a.name}: ${ops.join('')}`,
        }, [
          ...ops.map((op) => el('span', { class: `vs-crud-op vs-crud-op-${op}` }, op)),
          ...list.filter((access) => access.anchor).map((access) => ctx.anchorChip(access.anchor, list.length > 1 ? `${access.ops} · ${ctx.t('crud-matrix.code')}` : ctx.t('crud-matrix.code'))),
          ...sources.map((src) => ctx.sourceChip(src)),
        ]);
      }),
    ]), s.id);
  });

  return el('div', { class: 'vs-crud' }, el('div', { class: 'vs-crud-grid', style: `min-width: ${minWidth}px` }, [head, ...rows]));
}
