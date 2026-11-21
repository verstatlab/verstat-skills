const CSS = `
.vs-tl-note { font-size: 13px; color: var(--vs-muted); margin: 0 0 6px; }
.vs-tl-origin { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-family: var(--vs-mono); font-size: 12px; color: var(--vs-muted); margin-bottom: 14px; }
.vs-tl-scroll { overflow-x: auto; }
.vs-tl { display: grid; }
.vs-tl > * { min-width: 0; }
.vs-tl-tick { position: relative; padding: 0 12px 14px 0; display: flex; flex-direction: column; gap: 6px; }
.vs-tl-axis { position: absolute; left: 0; right: 0; top: 6px; height: 1px; background: var(--vs-rule-strong); }
.vs-tl-axis.vs-tl-held { background: var(--vs-accent); }
.vs-tl-dot { position: relative; width: 13px; height: 13px; border-radius: 50%; box-sizing: border-box; background: var(--vs-bg); border: 1.5px solid var(--vs-muted); }
.vs-tl-dot.vs-tl-held { background: var(--vs-accent); border-color: var(--vs-accent); }
.vs-tl-time { font-family: var(--vs-mono); font-size: 12px; font-weight: 600; }
.vs-tl-rule { grid-column: 1 / -1; border-top: 1px solid var(--vs-rule); }
.vs-tl-lane { padding: 12px 8px 12px 0; font-family: var(--vs-mono); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-tl-band { background: var(--vs-accent-soft); border-radius: 8px; margin: 8px 12px 8px 0; }
.vs-tl-ev { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 6px; padding: 18px 24px 18px 12px; font-size: 14px; line-height: 1.35; }
.vs-tl-ev.vs-tl-span::before { content: ""; position: absolute; inset: 8px 12px 8px 0; z-index: -1; background: var(--vs-surface); border-radius: 8px; }
.vs-tl-ev.vs-tl-span { padding-left: 12px; }
.vs-tl-kind { font-family: var(--vs-mono); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--vs-muted); }
.vs-tl-title { font-weight: 600; }
.vs-tl-fail .vs-tl-title { color: var(--vs-accent-ink); }
.vs-tl-text { font-size: 12.5px; color: var(--vs-muted); line-height: 1.4; }
.vs-tl-ev .vs-chips { margin-top: 2px; }
.vs-tl-ev.vs-focus, .vs-tl-band.vs-focus, .vs-tl-any-item.vs-focus { outline-offset: -3px; }
.vs-tl-any { margin: 12px 12px 0 0; border: 1px dashed color-mix(in oklab, var(--vs-accent) 45%, var(--vs-rule-strong)); border-radius: var(--vs-r); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.vs-tl-any-head { font-family: var(--vs-mono); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--vs-muted); }
.vs-tl-any-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: start; }
.vs-tl-any-item .vs-tl-text { grid-column: 1; }
.vs-tl-any-item .vs-chips { grid-column: 2; grid-row: 1; justify-content: flex-end; }
.vs-tl-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 12px; font-size: 13px; }
.vs-tl-legend > span { display: flex; gap: 8px; align-items: center; }
.vs-tl-swatch { width: 14px; height: 14px; border-radius: 4px; background: var(--vs-accent-soft); border: 1px solid var(--vs-accent); flex: none; }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="timeline"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'timeline');
  style.textContent = CSS;
  document.head.appendChild(style);
}


const span = (a, b) => [Math.min(a, b), Math.max(a, b)];

function layout(block) {
  const holds = block.holds || [];
  const times = [...new Set([
    ...block.events.flatMap((e) => (e.until !== undefined ? [e.at, e.until] : [e.at])),
    ...holds.flatMap((h) => [h.from, h.until]),
  ])].sort((a, b) => a - b);
  const within = (t, h) => {
    const [lo, hi] = span(h.from, h.until);
    return t >= lo && t <= hi;
  };
  return {
    times,
    held: times.map((t) => holds.some((h) => within(t, h))),
    segments: times.slice(0, -1).map((t, k) => holds.some((h) => within(t, h) && within(times[k + 1], h))),
  };
}

verstat.behavior = verstat.behavior || {};
verstat.behavior.timeline = { layout };

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.events.length) return null;
  const holds = block.holds || [];
  const anytime = block.anytime || [];
  const { times, held, segments } = layout(block);
  const column = new Map(times.map((t, i) => [t, i + 2]));
  const lanes = block.lanes.slice();
  for (const item of [...block.events, ...holds]) if (!lanes.some((l) => l.id === item.lane)) lanes.push({ id: item.lane, label: item.lane });
  const unit = ctx.t(`timeline.unit.${block.unit}`, null, block.unit);
  const chipsOf = (o) => {
    const chips = [];
    if (o.anchor) chips.push(ctx.anchorChip(o.anchor));
    if (o.source) chips.push(ctx.sourceChip(o.source));
    return chips.length ? el('div', { class: 'vs-chips' }, chips) : null;
  };
  const columnsOf = (a, b) => {
    const [lo, hi] = span(a, b);
    return [column.get(lo), column.get(hi)];
  };

  const cells = [el('span', { style: 'grid-row:1;grid-column:1' })];
  times.forEach((t, k) => {
    cells.push(el('div', { class: 'vs-tl-tick', style: `grid-row:1;grid-column:${k + 2}` }, [
      k < segments.length ? el('span', { class: `vs-tl-axis${segments[k] ? ' vs-tl-held' : ''}` }) : null,
      el('span', { class: `vs-tl-dot${held[k] ? ' vs-tl-held' : ''}` }),
      el('span', { class: 'vs-tl-time' }, `${t} ${unit}`),
    ]));
  });

  let row = 2;
  lanes.forEach((lane) => {
    const placed = block.events
      .filter((e) => e.lane === lane.id)
      .map((e) => {
        const [start, end] = columnsOf(e.at, e.until !== undefined ? e.until : e.at);
        return { e, start, end };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const subrows = [];
    for (const p of placed) {
      let k = subrows.findIndex((taken) => !taken.some((c) => c >= p.start && c <= p.end));
      if (k < 0) {
        subrows.push([]);
        k = subrows.length - 1;
      }
      for (let c = p.start; c <= p.end; c++) subrows[k].push(c);
      p.row = row + k;
    }
    const height = Math.max(1, subrows.length);
    const rows = `grid-row:${row} / span ${height}`;
    cells.push(el('span', { class: 'vs-tl-rule', style: rows }));
    cells.push(ctx.part(el('div', { class: 'vs-tl-lane', style: `${rows};grid-column:1` }, lane.label), lane.id));
    for (const h of holds.filter((x) => x.lane === lane.id)) {
      const [start, end] = columnsOf(h.from, h.until);
      cells.push(ctx.part(el('div', {
        class: `vs-tl-band${ctx.isInferred(h) ? ' vs-inferred' : ''}`,
        style: `${rows};grid-column:${start} / ${end + 1}`,
        title: `${h.label}: ${Math.min(h.from, h.until)}–${Math.max(h.from, h.until)} ${unit}`,
      }), h.id));
    }
    for (const { e, start, end, row: r } of placed) {
      const cls = ['vs-tl-ev'];
      if (e.until !== undefined) cls.push('vs-tl-span');
      if (e.failure) cls.push('vs-tl-fail');
      if (ctx.isInferred(e)) cls.push('vs-inferred');
      cells.push(ctx.part(el('div', {
        class: cls.join(' '),
        style: `grid-row:${r};grid-column:${start} / ${end + 1}`,
        title: e.until !== undefined ? `${e.at}–${e.until} ${unit}` : `${e.at} ${unit}`,
      }, [
        e.kind !== 'event' ? el('span', { class: 'vs-tl-kind' }, ctx.t(`timeline.kind.${e.kind}`, null, e.kind)) : null,
        el('span', { class: 'vs-tl-title' }, e.label),
        e.text ? el('span', { class: 'vs-tl-text' }, e.text) : null,
        chipsOf(e),
      ]), e.id));
    }
    row += height;
  });

  const groups = new Map();
  for (const a of anytime) {
    const key = holds.some((h) => h.id === a.during) ? a.during : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  for (const [key, items] of groups) {
    const hold = holds.find((h) => h.id === key);
    let from = 2;
    let to = times.length + 2;
    if (hold) {
      const [start, end] = columnsOf(hold.from, hold.until);
      from = start;
      to = Math.min(times.length + 2, Math.max(end + 1, start + 2));
    }
    cells.push(el('div', { class: 'vs-tl-any', style: `grid-row:${row};grid-column:${from} / ${to}` }, [
      el('span', { class: 'vs-tl-any-head' }, hold ? ctx.t('timeline.anyWhile', { label: hold.label }) : ctx.t('timeline.any')),
      ...items.map((a) => ctx.part(el('div', { class: `vs-tl-any-item${a.failure ? ' vs-tl-fail' : ''}${ctx.isInferred(a) ? ' vs-inferred' : ''}` }, [
        el('span', { class: 'vs-tl-title' }, a.label),
        chipsOf(a),
        a.text ? el('span', { class: 'vs-tl-text' }, a.text) : null,
      ]), a.id)),
    ]));
    row += 1;
  }

  const grid = el('div', {
    class: 'vs-tl',
    style: `grid-template-columns:110px repeat(${times.length}, minmax(130px, 1fr));min-width:${110 + times.length * 130}px`,
  }, cells);
  const legend = holds.length
    ? el('div', { class: 'vs-tl-legend' }, holds.map((h) => el('span', {}, [
      el('span', { class: 'vs-tl-swatch' }),
      el('span', {}, h.label),
      chipsOf(h),
    ])))
    : null;
  return el('div', {}, [
    block.note ? el('p', { class: 'vs-tl-note' }, block.note) : null,
    el('div', { class: 'vs-tl-origin' }, [
      el('span', {}, `0 = ${block.origin ? block.origin.label : ctx.t('timeline.start')}`),
      block.origin && block.origin.anchor ? ctx.anchorChip(block.origin.anchor) : null,
    ]),
    el('div', { class: 'vs-tl-scroll' }, [grid, legend]),
  ]);
}
