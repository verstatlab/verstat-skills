const CSS = `
.vs-seq-player { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.vs-seq-btn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: transparent; color: var(--vs-ink); border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); cursor: pointer; padding: 0; }
.vs-seq-btn:hover { border-color: var(--vs-accent); }
.vs-seq-btn svg, .vs-seq-play svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.vs-seq-play { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: var(--vs-accent); color: var(--vs-on-accent); border: none; border-radius: var(--vs-r); cursor: pointer; font: inherit; font-weight: 600; font-size: 14px; }
.vs-seq-play:hover { filter: brightness(.92); }
.vs-seq-play svg { fill: currentColor; stroke: none; }
.vs-seq-count { font-family: var(--vs-mono); font-size: 13px; margin-left: 8px; }
.vs-seq-now { flex: 1 1 16ch; text-align: right; font-size: 13px; color: var(--vs-muted); min-height: 1.4em; }
.vs-seq-now > span { display: inline-block; max-width: 44ch; text-align: left; }
.vs-seq-scroll { overflow-x: auto; border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); background: var(--vs-raised); }
.vs-seq-grid { position: relative; }
.vs-seq-head, .vs-seq-row { display: grid; grid-template-columns: 40px minmax(0, 1fr); }
.vs-seq-head { border-bottom: var(--vs-rw) solid var(--vs-rule-strong); background: var(--vs-bg); position: relative; z-index: 1; }
.vs-seq-parts { display: grid; }
.vs-seq-part { padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; font-weight: 700; font-size: 13px; line-height: 1.2; overflow-wrap: anywhere; }
.vs-seq-part small { font-weight: 400; font-family: var(--vs-mono); font-size: 10.5px; color: var(--vs-muted); }
.vs-seq-body { position: relative; padding: 6px 0 14px; }
.vs-seq-lives { position: absolute; top: 0; bottom: 0; left: 40px; right: 0; pointer-events: none; }
.vs-seq-life { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1.5px dashed var(--vs-rule); }
.vs-seq-row { position: relative; height: 50px; cursor: pointer; transition: opacity .25s; }
.vs-seq-row.vs-seq-future { opacity: .32; }
.vs-seq-row.vs-seq-cur, .vs-seq-row.vs-seq-cur.vs-added, .vs-seq-row.vs-seq-cur.vs-removed { background: var(--vs-accent-soft); }
.vs-seq-row:hover { opacity: 1; }
.vs-seq-num { font-family: var(--vs-mono); font-size: 10.5px; color: var(--vs-muted); padding: 6px 0 0 8px; }
.vs-seq-lane { position: relative; min-width: 0; }
.vs-seq-lane svg { position: absolute; left: 0; top: 0; width: 100%; height: 50px; overflow: visible; pointer-events: none; }
.vs-seq-arrow { --vs-seq-col: var(--vs-ink); stroke: var(--vs-seq-col); stroke-width: 1.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.vs-seq-return line.vs-seq-arrow { stroke-dasharray: 5 4; }
.vs-seq-error .vs-seq-arrow { --vs-seq-col: var(--vs-accent-ink); }
.vs-seq-cur .vs-seq-arrow { --vs-seq-col: var(--vs-accent); stroke-width: 2; }
.vs-seq-cur.vs-seq-error .vs-seq-arrow { --vs-seq-col: var(--vs-accent-ink); }
.vs-seq-row.vs-added .vs-seq-arrow { --vs-seq-col: var(--vs-add); }
.vs-seq-row.vs-removed .vs-seq-arrow { --vs-seq-col: var(--vs-del); }
.vs-seq-row.vs-removed line.vs-seq-arrow, .vs-seq-row.vs-inferred line.vs-seq-arrow { stroke-dasharray: var(--vs-dash); }
.vs-seq-row.vs-focus { outline-offset: -2px; }
.vs-seq-label { position: absolute; top: 8px; display: flex; gap: 6px; align-items: center; white-space: nowrap; font-family: var(--vs-mono); font-size: 12px; line-height: 18px; }
.vs-seq-msg { font-weight: 500; }
.vs-seq-error .vs-seq-msg { color: var(--vs-accent-ink); }
.vs-seq-cur .vs-seq-msg { font-weight: 700; color: var(--vs-accent-ink); }
.vs-seq-label .vs-chip { font-size: 11px; padding: 0 6px; line-height: 16px; }
.vs-seq-was { color: var(--vs-muted); text-decoration: line-through; }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="sequence"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'sequence');
  style.textContent = CSS;
  document.head.appendChild(style);
}

const STEP_MS = 1400;
const ARROWS = { call: '->>', return: '-->>', error: '-x' };

verstat.behavior = verstat.behavior || {};
verstat.behavior.sequence = {
  mermaid(participants, steps) {
    const m = verstat.mermaid;
    const lines = ['sequenceDiagram'];
    for (const p of participants) lines.push(`  participant ${m.id(p.id)} as ${m.label(p.label)}`);
    for (const s of steps) lines.push(`  ${m.id(s.from)}${ARROWS[s.kind || 'call']}${m.id(s.to)}: ${m.label(s.label)}`);
    return lines.join('\n');
  },
};

export default function (block, ctx) {
  const { el, svg, diff } = ctx;
  const visible = block.steps.filter((s) => diff.shows(s));
  if (!visible.length || !block.participants.length) return null;
  const col = new Map(block.participants.map((p, i) => [p.id, i]));
  const n = block.participants.length;
  const unanchoredOld = (s) => diff.mode === 'before' && s.change === 'changed' && s.before && !s.before.anchor
    && ['label', 'from', 'to'].some((f) => s.before[f] !== undefined && s.before[f] !== s[f]);
  const steps = visible.map((s) => ({
    part: s,
    id: s.id,
    from: diff.value(s, 'from'),
    to: diff.value(s, 'to'),
    label: diff.value(s, 'label'),
    anchor: unanchoredOld(s) ? undefined : diff.value(s, 'anchor'),
    handler: unanchoredOld(s) ? undefined : s.handler,
    source: unanchoredOld(s) ? 'inferred' : s.source,
    kind: s.kind || 'call',
    text: s.text,
  }));

  const exported = steps.filter((s) => col.has(s.from) && col.has(s.to) && !(diff.mode === 'diff' && s.part.change === 'removed'));
  ctx.mermaid(() => verstat.behavior.sequence.mermaid(block.participants, exported));

  const x = (id) => ((col.get(id) + 0.5) / n) * 100;
  const name = (id) => (block.participants.find((p) => p.id === id) || { label: id }).label;
  const chevron = (at, y, right) => svg('svg', { x: `${at}%`, y, width: 10, height: 10, overflow: 'visible' }, [
    svg('path', { d: right ? 'M-7 0 L0 5 L-7 10' : 'M7 0 L0 5 L7 10', class: 'vs-seq-arrow' }),
  ]);
  const glyph = (paths, filled) => svg('svg', { viewBox: '0 0 24 24', width: filled ? 13 : 15, height: filled ? 13 : 15, 'aria-hidden': 'true' },
    paths.map(([tag, attrs]) => svg(tag, attrs)));
  const PLAY = [['polygon', { points: '6 3 20 12 6 21 6 3' }]];
  const PAUSE = [['rect', { x: 14, y: 4, width: 4, height: 16 }], ['rect', { x: 6, y: 4, width: 4, height: 16 }]];

  let cur = 0;
  let timer = null;
  const rows = [];
  const count = el('span', { class: 'vs-seq-count' });
  const nowText = el('span');
  const now = el('span', { class: 'vs-seq-now' }, nowText);
  const playButton = el('button', { type: 'button', class: 'vs-seq-play', onclick: () => (timer ? pause() : play()) });
  const setPlay = (playing) => playButton.replaceChildren(glyph(playing ? PAUSE : PLAY, true), el('span', {}, ctx.t(playing ? 'sequence.pause' : 'sequence.play')));
  setPlay(false);

  function paint() {
    rows.forEach((row, i) => {
      row.classList.toggle('vs-seq-cur', i === cur);
      row.classList.toggle('vs-seq-future', i > cur);
    });
    count.textContent = ctx.t('sequence.step', { at: cur + 1, total: steps.length });
    const s = steps[cur];
    nowText.textContent = s.text || `${name(s.from)} → ${name(s.to)}: ${s.label}`;
  }

  function go(i) {
    cur = Math.max(0, Math.min(steps.length - 1, i));
    paint();
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    setPlay(false);
  }

  function play() {
    if (cur >= steps.length - 1) go(0);
    setPlay(true);
    timer = setInterval(() => {
      if (!root.isConnected) {
        pause();
        return;
      }
      go(cur + 1);
      if (cur >= steps.length - 1) pause();
    }, STEP_MS);
  }

  steps.forEach((s, i) => {
    const known = col.has(s.from) && col.has(s.to);
    const lane = el('div', { class: 'vs-seq-lane' });
    const shapes = [];
    if (known) {
      const a = x(s.from);
      const b = x(s.to);
      if (s.from === s.to) {
        const r = a + Math.min(6, 40 / n);
        shapes.push(
          svg('line', { x1: `${a}%`, x2: `${r}%`, y1: 28, y2: 28, class: 'vs-seq-arrow' }),
          svg('line', { x1: `${r}%`, x2: `${r}%`, y1: 28, y2: 42, class: 'vs-seq-arrow' }),
          svg('line', { x1: `${r}%`, x2: `${a}%`, y1: 42, y2: 42, class: 'vs-seq-arrow' }),
          chevron(a, 37, false),
        );
      } else {
        shapes.push(svg('line', { x1: `${a}%`, x2: `${b}%`, y1: 35, y2: 35, class: 'vs-seq-arrow' }), chevron(b, 30, b > a));
      }
    }
    lane.appendChild(svg('svg', { 'aria-hidden': 'true' }, shapes));
    const left = known ? Math.min(x(s.from), x(s.to)) : 0;
    const chips = [];
    if (s.anchor) chips.push(ctx.anchorChip(s.anchor));
    if (s.handler) chips.push(ctx.anchorChip(s.handler, ctx.t('sequence.handler')));
    if (s.source) chips.push(ctx.sourceChip(s.source));
    const before = diff.mode === 'diff' && s.part.change === 'changed' && s.part.before ? s.part.before : {};
    const oldLabel = before.label !== undefined && before.label !== s.label ? before.label : null;
    const oldEnds = (before.from !== undefined && before.from !== s.from) || (before.to !== undefined && before.to !== s.to)
      ? `${name(before.from || s.from)} → ${name(before.to || s.to)}` : null;
    const was = oldLabel || oldEnds
      ? el('span', { class: 'vs-seq-was' }, [oldEnds, oldLabel].filter(Boolean).join(': ')) : null;
    lane.appendChild(el('div', { class: 'vs-seq-label', style: `left:calc(${left}% + 8px)`, 'data-no-terms': true }, [
      was,
      el('span', { class: 'vs-seq-msg' }, known ? s.label : ctx.t('sequence.unknown', { label: s.label })),
      ...chips,
    ]));
    const row = el('div', {
      class: `vs-seq-row vs-seq-${s.kind}${s.source === 'inferred' ? ' vs-inferred' : ''}`,
      'data-own-click': true,
      onclick: (ev) => {
        if (ev.target.closest && ev.target.closest('.vs-chip')) return;
        pause();
        go(i);
      },
    }, [el('span', { class: 'vs-seq-num' }, String(i + 1).padStart(2, '0')), lane]);
    diff.mark(row, s.part);
    ctx.part(row, s.id);
    rows.push(row);
  });

  const columns = `grid-template-columns:repeat(${n}, minmax(0, 1fr))`;
  const head = el('div', { class: 'vs-seq-head' }, [
    el('span'),
    el('div', { class: 'vs-seq-parts', style: columns }, block.participants.map((p) =>
      ctx.part(el('div', { class: 'vs-seq-part' }, [el('span', {}, p.label), p.kind ? el('small', {}, p.kind) : null]), p.id))),
  ]);
  const lives = el('div', { class: 'vs-seq-lives', 'aria-hidden': 'true' },
    block.participants.map((p, i) => el('span', { class: 'vs-seq-life', style: `left:${((i + 0.5) / n) * 100}%` })));

  const iconButton = (title, paths, onclick) => el('button', { type: 'button', class: 'vs-seq-btn', title, 'aria-label': title, onclick }, glyph(paths));
  const player = el('div', { class: 'vs-seq-player' }, [
    iconButton(ctx.t('sequence.start'), [['polygon', { points: '19 20 9 12 19 4 19 20' }], ['line', { x1: 5, x2: 5, y1: 19, y2: 5 }]], () => { pause(); go(0); }),
    iconButton(ctx.t('sequence.back'), [['path', { d: 'm15 18-6-6 6-6' }]], () => { pause(); go(cur - 1); }),
    playButton,
    iconButton(ctx.t('sequence.next'), [['path', { d: 'm9 18 6-6-6-6' }]], () => { pause(); go(cur + 1); }),
    count,
    now,
  ]);

  const root = el('div', { class: 'vs-seq' }, [
    player,
    el('div', { class: 'vs-seq-scroll' }, el('div', { class: 'vs-seq-grid', style: `min-width:${n * 130 + 40}px` }, [
      head,
      el('div', { class: 'vs-seq-body' }, [lives, ...rows]),
    ])),
  ]);

  ctx.onFocus((id) => {
    const i = steps.findIndex((s) => s.id === id);
    if (i >= 0) {
      pause();
      go(i);
    }
  });

  paint();
  return root;
}
