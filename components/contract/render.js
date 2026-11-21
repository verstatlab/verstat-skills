const CSS = `
.vs-ct { container-type: inline-size; }
.vs-ct-wrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); overflow: hidden; }
.vs-ct-list { display: flex; flex-direction: column; border-right: var(--vs-rw) solid var(--vs-rule-strong); min-width: 0; }
.vs-ct-ep { font: inherit; display: flex; gap: 10px; align-items: baseline; padding: 11px 14px; background: transparent; color: var(--vs-ink); border: none; border-bottom: 1px solid var(--vs-rule); cursor: pointer; text-align: left; min-width: 0; }
.vs-ct-ep:hover { background: color-mix(in oklab, var(--vs-surface) 50%, transparent); }
.vs-ct-ep.vs-ct-on { background: var(--vs-surface); color: var(--vs-ink); }
.vs-ct-ep.vs-ct-on .vs-ct-path { font-weight: 600; }
.vs-ct-ep.vs-focus { outline-offset: -3px; }
.vs-ct-method { font-family: var(--vs-mono); font-size: 11px; font-weight: 700; width: 56px; flex: none; }
.vs-ct-path { font-family: var(--vs-mono); font-size: 13px; overflow-wrap: anywhere; min-width: 0; }
.vs-ct-detail { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; background: var(--vs-raised); min-width: 0; }
.vs-ct-title { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.vs-ct-title .vs-ct-method { width: auto; font-size: 12px; color: var(--vs-accent-ink); }
.vs-ct-title .vs-ct-path { font-size: 15px; font-weight: 600; }
.vs-ct-between { font-family: var(--vs-mono); font-size: 12px; color: var(--vs-muted); }
.vs-ct-text { font-size: 14px; line-height: 1.45; }
.vs-ct-sec { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.vs-ct-code { margin: 0; font-family: var(--vs-mono); font-size: 12px; line-height: 1.5; background: var(--vs-code-bg); border: 1px solid var(--vs-rule); padding: 8px 10px; border-radius: var(--vs-r); white-space: pre-wrap; overflow-wrap: anywhere; }
.vs-ct-row { display: grid; grid-template-columns: minmax(64px, auto) 1fr; gap: 8px; padding: 5px 0; border-top: 1px solid var(--vs-rule); font-size: 13px; }
.vs-ct-row > :first-child { font-family: var(--vs-mono); font-weight: 600; overflow-wrap: anywhere; }
.vs-ct-hval { font-family: var(--vs-mono); }
.vs-ct-hnote { color: var(--vs-muted); }
@container (max-width: 720px) {
  .vs-ct-wrap { grid-template-columns: minmax(0, 1fr); }
  .vs-ct-list { border-right: none; border-bottom: var(--vs-rw) solid var(--vs-rule-strong); }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-contract')) {
  const style = document.createElement('style');
  style.id = 'vs-css-contract';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default function (block, ctx) {
  const { el } = ctx;
  const endpoints = block.endpoints;
  if (!endpoints.length) return null;
  let selected = 0;
  let rendered = false;

  const label = (text) => el('span', { class: 'vs-label' }, text);

  const detailOf = (e) => {
    const chips = [];
    if (e.anchor) chips.push(ctx.anchorChip(e.anchor));
    if (e.source) chips.push(ctx.sourceChip(e.source));
    const headers = e.headers || [];
    const failures = e.failures || [];
    return [
      el('div', { class: 'vs-ct-title', 'data-no-terms': '' }, [
        el('span', { class: 'vs-ct-method' }, e.method),
        el('span', { class: 'vs-ct-path' }, e.path),
      ]),
      e.between ? el('span', { class: 'vs-ct-between' }, e.between) : null,
      e.text ? el('p', { class: 'vs-ct-text' }, e.text) : null,
      headers.length ? el('div', { class: 'vs-ct-sec' }, [
        label(ctx.t('contract.headers')),
        ...headers.map((h) => el('div', { class: 'vs-ct-row' }, [
          el('span', { 'data-no-terms': '' }, h.name),
          el('span', {}, [
            h.value ? el('span', { class: 'vs-ct-hval', 'data-no-terms': '' }, h.value) : null,
            h.value && h.note ? ' · ' : null,
            h.note ? el('span', { class: 'vs-ct-hnote' }, h.note) : null,
          ]),
        ])),
      ]) : null,
      e.request ? el('div', { class: 'vs-ct-sec' }, [label(ctx.t('contract.request')), el('pre', { class: 'vs-ct-code' }, e.request)]) : null,
      e.response ? el('div', { class: 'vs-ct-sec' }, [label(ctx.t('contract.response')), el('pre', { class: 'vs-ct-code' }, e.response)]) : null,
      failures.length ? el('div', { class: 'vs-ct-sec' }, [
        label(ctx.t('contract.errors')),
        ...failures.map((f) => el('div', { class: 'vs-ct-row' }, [el('span', {}, f.code), el('span', {}, f.text)])),
      ]) : null,
      chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
    ];
  };

  const detail = el('div', { class: 'vs-ct-detail', 'aria-live': 'polite' });
  const buttons = endpoints.map((e, i) => ctx.part(el('button', {
    type: 'button',
    class: 'vs-ct-ep',
    'aria-pressed': 'false',
    onclick: () => select(i),
  }, [
    el('span', { class: 'vs-ct-method' }, e.method),
    el('span', { class: 'vs-ct-path' }, e.path),
  ]), e.id));

  function select(i) {
    selected = i;
    buttons.forEach((b, j) => {
      b.classList.toggle('vs-ct-on', j === i);
      b.setAttribute('aria-pressed', j === i ? 'true' : 'false');
    });
    const e = endpoints[i];
    detail.classList.toggle('vs-inferred', ctx.isInferred(e));
    detail.replaceChildren(...detailOf(e).filter(Boolean));
    if (rendered && typeof verstat !== 'undefined' && verstat.glossary) verstat.glossary.highlight(detail);
  }

  ctx.onFocus((id) => {
    const i = endpoints.findIndex((e) => e.id === id);
    if (i >= 0 && i !== selected) select(i);
  });

  select(0);
  rendered = true;
  return el('div', { class: 'vs-ct' }, el('div', { class: 'vs-ct-wrap' }, [
    el('div', { class: 'vs-ct-list', 'data-no-terms': '' }, buttons),
    detail,
  ]));
}
