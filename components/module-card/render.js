if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="module-card"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'module-card');
  style.textContent = `
.vs-mc { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); overflow: hidden; }
.vs-mc > * { padding: 18px 20px; min-width: 0; }
.vs-mc > * + * { border-left: var(--vs-rw) solid var(--vs-rule); }
.vs-mc-head { background: var(--vs-surface); color: var(--vs-ink); display: flex; flex-direction: column; gap: 12px; }
.vs-mc-path { font-family: var(--vs-mono); font-size: 12px; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-mc-role { font-size: 22px; font-weight: 600; line-height: 1.2; letter-spacing: var(--vs-track); }
.vs-mc-summary { font-size: 14px; line-height: 1.5; margin: 0; }
.vs-mc-head .vs-chip { background: var(--vs-bg); }
.vs-mc-label { font-family: var(--vs-mono); font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--vs-muted); margin: 0 0 8px; }
.vs-mc-members { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.vs-mc-member { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 8px; padding-bottom: 6px; border-bottom: 1px solid var(--vs-rule); font-family: var(--vs-mono); font-size: 12.5px; }
.vs-mc-member.vs-focus { outline-offset: 2px; }
.vs-mc-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
.vs-mc-at { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vs-mc-kind { color: var(--vs-muted); }
.vs-mc-why { flex-basis: 100%; font-family: var(--vs-font); font-size: 12.5px; color: var(--vs-muted); line-height: 1.4; }
.vs-mc-group + .vs-mc-group { margin-top: 14px; }
.vs-mc-group .vs-mc-label { margin-bottom: 6px; }
.vs-mc-read > .vs-mc-label { color: var(--vs-accent-ink); }
.vs-mc-skim > .vs-mc-label { color: var(--vs-ink); }
.vs-mc-items { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 8px; }
.vs-mc-items.vs-mc-has-why { flex-direction: column; align-items: flex-start; }
.vs-mc-items li { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.vs-mc-item { font-family: var(--vs-mono); font-size: 12px; overflow-wrap: anywhere; }
.vs-mc-skip .vs-mc-item, .vs-mc-skip .vs-anchor { color: var(--vs-muted); }
.vs-mc-items .vs-mc-why { font-size: 12px; }
@media (max-width: 720px) {
  .vs-mc > * + * { border-left: none; border-top: var(--vs-rw) solid var(--vs-rule); }
}
`;
  document.head.appendChild(style);
}

export default function render(block, ctx) {
  const { el } = ctx;

  const head = el('div', { class: 'vs-mc-head' + (ctx.isInferred(block) ? ' vs-inferred' : '') }, [
    el('span', { class: 'vs-mc-path', 'data-no-terms': true }, block.path),
    el('div', { class: 'vs-mc-role' }, block.role),
    block.summary ? el('p', { class: 'vs-mc-summary' }, block.summary) : null,
    block.anchor || block.source
      ? el('div', { class: 'vs-chips' }, [block.anchor ? ctx.anchorChip(block.anchor) : null, ctx.sourceChip(block.source)])
      : null,
  ]);

  const members = (block.members || []).map((m) => {
    const chips = [m.anchor ? ctx.anchorChip(m.anchor) : null, ctx.sourceChip(m.source)].filter(Boolean);
    return ctx.part(el('li', { class: 'vs-mc-member' + (ctx.isInferred(m) ? ' vs-inferred' : '') }, [
      el('span', { class: 'vs-mc-name', 'data-no-terms': true }, m.name),
      el('span', { class: 'vs-mc-at' }, [el('span', { class: 'vs-mc-kind' }, m.kind), ...chips]),
      m.note ? el('span', { class: 'vs-mc-why' }, m.note) : null,
    ]), m.id);
  });

  const reading = (key, label) => {
    const items = block[key] || [];
    if (!items.length) return null;
    const withWhy = items.some((r) => r.why);
    return el('div', { class: 'vs-mc-group vs-mc-' + key }, [
      el('p', { class: 'vs-mc-label' }, label),
      el('ul', { class: 'vs-mc-items' + (withWhy ? ' vs-mc-has-why' : '') }, items.map((r) => ctx.part(el('li', {}, [
        r.anchor ? ctx.anchorChip(r.anchor, r.path) : el('span', { class: 'vs-mc-item', 'data-no-terms': true }, r.path),
        r.why ? el('span', { class: 'vs-mc-why' }, r.why) : null,
      ]), r.id))),
    ]);
  };
  const read = [reading('read', ctx.t('module-card.read')), reading('skim', ctx.t('module-card.skim')), reading('skip', ctx.t('module-card.skip'))].filter(Boolean);

  return el('div', { class: 'vs-mc' }, [
    head,
    members.length ? el('div', {}, [el('p', { class: 'vs-mc-label' }, ctx.t('module-card.members')), el('ul', { class: 'vs-mc-members' }, members)]) : null,
    read.length ? el('div', {}, read) : null,
  ]);
}
