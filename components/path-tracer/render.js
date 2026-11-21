const CSS = `
.vs-pt { list-style: none; margin: 0 0 0 10px; padding: 0; border-left: var(--vs-rw) solid var(--vs-rule-strong); display: flex; flex-direction: column; }
.vs-pt-step { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 8px 16px; align-items: start; padding: 10px 0 10px 22px; position: relative; }
.vs-pt-step.vs-pt-open { cursor: pointer; }
.vs-pt-node:focus-visible { outline: 2px solid var(--vs-accent); outline-offset: 2px; border-radius: 2px; }
.vs-pt-dot { position: absolute; left: -8px; top: 15px; width: 14px; height: 14px; box-sizing: border-box; border-radius: 50%; background: var(--vs-ink); border: 2px solid var(--vs-ink); }
.vs-pt-step.vs-pt-failing .vs-pt-dot { background: var(--vs-bg); }
.vs-pt-step.vs-focus { outline-offset: -2px; }
.vs-pt-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vs-pt-layer { font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); }
.vs-pt-node { font-family: var(--vs-mono); font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere; }
.vs-pt-text { font-size: 13px; color: var(--vs-muted); margin: 0; }
.vs-pt-main .vs-chips { margin-top: 4px; }
.vs-pt-fails { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.vs-pt-fail { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; padding: 6px 10px; border: 1.5px dashed var(--vs-rule-strong); border-radius: var(--vs-r); }
.vs-pt-fail b { font-family: var(--vs-mono); font-size: 13px; font-weight: 700; color: var(--vs-accent-ink); }
.vs-pt-fail > span { font-size: 13px; line-height: 1.4; flex: 1 1 16ch; }
.vs-pt-step.vs-pt-open:hover .vs-pt-target { border-color: var(--vs-accent); }
@media (max-width: 720px) {
  .vs-pt-step { grid-template-columns: minmax(0, 1fr); }
}
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="path-tracer"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'path-tracer');
  style.textContent = CSS;
  document.head.appendChild(style);
}

const spansOf = (anchor) => {
  if (!anchor || !anchor.line) return [];
  return anchor.spans || [[anchor.line, anchor.endLine || anchor.line]];
};

function target(step) {
  const failing = (step.failures || []).filter((f) => f.anchor);
  if (!failing.length) return step.anchor || null;
  const first = failing[0].anchor;
  const same = failing.map((f) => f.anchor).filter((a) => a.repo === first.repo && a.path === first.path);
  if (same.length === 1) return first;
  const sorted = same.flatMap(spansOf).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const spans = [];
  for (const [lo, hi] of sorted) {
    const last = spans[spans.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else spans.push([lo, hi]);
  }
  if (!spans.length) return first;
  return { repo: first.repo, path: first.path, line: spans[0][0], endLine: spans[0][1], spans };
}

verstat.behavior = verstat.behavior || {};
verstat.behavior.pathTracer = { target };

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.steps.length) return null;
  const chipsOf = (o) => {
    const chips = [];
    if (o.anchor) chips.push(ctx.anchorChip(o.anchor));
    if (o.source) chips.push(ctx.sourceChip(o.source));
    return chips.length ? el('div', { class: 'vs-chips' }, chips) : null;
  };
  return el('ol', { class: 'vs-pt' }, block.steps.map((s) => {
    const opens = target(s);
    const toFailure = (s.failures || []).some((f) => f.anchor);
    const fails = (s.failures || []).map((f) => ctx.part(el('div', {
      class: `vs-pt-fail${toFailure && f.anchor && f.anchor.path === opens.path && f.anchor.repo === opens.repo ? ' vs-pt-target' : ''}${ctx.isInferred(f) ? ' vs-inferred' : ''}`,
    }, [
      el('b', { 'data-no-terms': true }, f.code),
      el('span', {}, f.text),
      chipsOf(f),
    ]), f.id));
    const node = el('li', {
      class: `vs-pt-step${fails.length ? ' vs-pt-failing' : ''}${opens ? ' vs-pt-open' : ''}${ctx.isInferred(s) ? ' vs-inferred' : ''}`,
      'data-own-click': true,
      onclick: (ev) => {
        if (!opens || (ev.target.closest && ev.target.closest('.vs-chip'))) return;
        if (window.getSelection && String(window.getSelection())) return;
        verstat.anchors.open(opens, node);
      },
    }, [
      el('span', { class: 'vs-pt-dot' }),
      el('div', { class: 'vs-pt-main' }, [
        el('span', { class: 'vs-pt-layer' }, s.layer),
        el('span', {
          class: 'vs-pt-node',
          'data-no-terms': true,
          tabindex: opens ? 0 : null,
          role: opens ? 'button' : null,
          onkeydown: (ev) => {
            if (!opens || (ev.key !== 'Enter' && ev.key !== ' ')) return;
            ev.preventDefault();
            verstat.anchors.open(opens, ev.currentTarget);
          },
        }, s.node),
        s.text ? el('p', { class: 'vs-pt-text' }, s.text) : null,
        chipsOf(s),
      ]),
      fails.length ? el('div', { class: 'vs-pt-fails' }, fails) : null,
    ]);
    return ctx.part(node, s.id);
  }));
}
