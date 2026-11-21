const CSS = `
.vs-et { border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); overflow: hidden; }
.vs-et-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr); border-bottom: 1px solid var(--vs-rule); }
.vs-et-row:last-child { border-bottom: 0; }
.vs-et-row > div { padding: 12px 14px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.vs-et-row > div + div { border-left: 1px solid var(--vs-rule); }
.vs-et-head { border-bottom: var(--vs-rw) solid var(--vs-rule-strong); }
.vs-et-head > div { font-family: var(--vs-mono); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--vs-muted); padding-top: 10px; padding-bottom: 10px; }
.vs-et-row > div.vs-et-chan { background: var(--vs-surface); gap: 3px; }
.vs-et-name { font-family: var(--vs-mono); font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere; }
.vs-et-kind { align-self: flex-start; font-family: var(--vs-mono); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--vs-muted); border: 1px solid var(--vs-rule-strong); border-radius: 4px; padding: 0 6px; margin-bottom: 2px; }
.vs-et-how { font-size: 12.5px; color: var(--vs-muted); }
.vs-et-chan .vs-chips { margin-top: 4px; }
.vs-et-who { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 14px; }
.vs-et-arrow { color: var(--vs-muted); }
.vs-et-mini { display: none; font-family: var(--vs-mono); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--vs-muted); }
.vs-et-row.vs-focus { outline-offset: -3px; }
.vs-et-empty { color: var(--vs-muted); font-size: 13px; }
@media (max-width: 720px) {
  .vs-et-row { grid-template-columns: minmax(0, 1fr); }
  .vs-et-row > div + div { border-left: 0; border-top: 1px solid var(--vs-rule); }
  .vs-et-head { display: none; }
  .vs-et-mini { display: block; }
}
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="event-topology"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'event-topology');
  style.textContent = CSS;
  document.head.appendChild(style);
}


export default function (block, ctx) {
  const { el } = ctx;
  if (!block.channels.length) return null;
  const who = (list, arrow) => (list.length
    ? list.map((p) => el('div', { class: 'vs-et-who', 'data-no-terms': true }, [
      arrow === 'in' ? el('span', { class: 'vs-et-arrow' }, '→') : null,
      el('span', {}, p.name),
      arrow === 'out' ? el('span', { class: 'vs-et-arrow' }, '→') : null,
      p.anchor ? ctx.anchorChip(p.anchor) : null,
    ]))
    : [el('span', { class: 'vs-et-empty' }, ctx.t('event-topology.nobody'))]);
  const head = el('div', { class: 'vs-et-row vs-et-head' }, [el('div', {}, ctx.t('event-topology.publishes')), el('div', {}, ctx.t('event-topology.channel')), el('div', {}, ctx.t('event-topology.consumes'))]);
  const rows = block.channels.map((c) => {
    const chips = [];
    if (c.anchor) chips.push(ctx.anchorChip(c.anchor));
    if (c.source) chips.push(ctx.sourceChip(c.source));
    return ctx.part(el('div', { class: `vs-et-row${ctx.isInferred(c) ? ' vs-inferred' : ''}` }, [
      el('div', {}, [el('span', { class: 'vs-et-mini' }, ctx.t('event-topology.publishes')), ...who(c.publishers, 'out')]),
      el('div', { class: 'vs-et-chan' }, [
        el('span', { class: 'vs-et-kind' }, ctx.t(`event-topology.kind.${c.kind}`, null, c.kind)),
        el('span', { class: 'vs-et-name', 'data-no-terms': true }, c.name),
        c.how ? el('span', { class: 'vs-et-how' }, c.how) : null,
        chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
      ]),
      el('div', {}, [el('span', { class: 'vs-et-mini' }, ctx.t('event-topology.consumes')), ...who(c.consumers, 'in')]),
    ]), c.id);
  });
  return el('div', { class: 'vs-et' }, [head, ...rows]);
}
