if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="hotspots"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'hotspots');
  style.textContent = `
.vs-hs { display: flex; flex-direction: column; gap: 10px; }
.vs-hs-map { display: flex; gap: 4px; height: 380px; background: var(--vs-bg); border-radius: var(--vs-r); overflow: hidden; }
.vs-hs-col { position: relative; min-width: 0; transition: opacity .15s; }
.vs-hs-tile { position: absolute; box-sizing: border-box; border: 2px solid var(--vs-bg); border-radius: 4px; padding: 3px 6px; overflow: hidden; cursor: pointer; display: flex; flex-direction: column; gap: 1px; font-family: var(--vs-mono); color: var(--vs-ink); outline: 1.5px solid transparent; outline-offset: -3px; }
.vs-hs-tile.vs-hs-plain { cursor: default; }
.vs-hs-tile { container-type: size; }
@container (max-width: 34px) { .vs-hs-name, .vs-hs-lines { display: none; } }
.vs-hs-name { font-size: 11px; font-weight: 600; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.vs-hs-lines { font-size: 10px; line-height: 1.3; opacity: .8; white-space: nowrap; }
.vs-hs-tile:hover, .vs-hs-tile.vs-hs-on, .vs-hs-lit .vs-hs-tile { outline-color: var(--vs-accent); }
.vs-hs-tile.vs-focus { outline: 2px solid var(--vs-accent); outline-offset: -3px; }
.vs-hs-col.vs-focus { outline-offset: -2px; border-radius: 4px; }
.vs-hs-map.vs-hs-linked .vs-hs-col:not(.vs-hs-lit) { opacity: .45; }
.vs-hs-names { display: flex; gap: 4px; }
.vs-hs-names span { min-width: 0; font-family: var(--vs-mono); font-size: 11.5px; color: var(--vs-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-hs-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); }
.vs-hs-scale { width: 80px; height: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--vs-surface), color-mix(in oklab, var(--vs-accent) 55%, var(--vs-surface))); }
.vs-hs-detail { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-height: 30px; padding: 8px 12px; border: var(--vs-rw) solid var(--vs-rule); border-radius: var(--vs-r); font-size: 13px; }
.vs-hs-detail-path { font-family: var(--vs-mono); font-weight: 600; overflow-wrap: anywhere; }
.vs-hs-hint { color: var(--vs-muted); }
@media (max-width: 720px) {
  .vs-hs-map { height: 300px; }
}
`;
  document.head.appendChild(style);
}

const NOMINAL_WIDTH = 1000;
const NOMINAL_HEIGHT = 380;

function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!(total > 0) || !(w > 0) || !(h > 0)) return out;
  const scale = (w * h) / total;
  const rest = items.filter((i) => i.value > 0).map((i) => ({ item: i, area: i.value * scale }))
    .sort((a, b) => b.area - a.area);
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  let row = [];

  const worst = (list, side) => {
    const s = list.reduce((a, r) => a + r.area, 0);
    let max = 0;
    let min = Infinity;
    list.forEach((r) => { max = Math.max(max, r.area); min = Math.min(min, r.area); });
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  const place = () => {
    const s = row.reduce((a, r) => a + r.area, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let cy = ry;
      row.forEach((r) => {
        const hh = r.area / cw;
        out.push({ item: r.item, x: rx, y: cy, w: cw, h: hh });
        cy += hh;
      });
      rx += cw;
      rw -= cw;
    } else {
      const ch = s / rw;
      let cx = rx;
      row.forEach((r) => {
        const ww = r.area / ch;
        out.push({ item: r.item, x: cx, y: ry, w: ww, h: ch });
        cx += ww;
      });
      ry += ch;
      rh -= ch;
    }
    row = [];
  };

  while (rest.length) {
    const side = Math.min(rw, rh);
    if (!row.length || worst(row.concat(rest[0]), side) <= worst(row, side)) row.push(rest.shift());
    else place();
  }
  if (row.length) place();
  return out;
}

const HEAT_MAX = 55;

function heat(value, max) {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.round(HEAT_MAX * Math.min(1, value / max));
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function linked(group, detail) {
  if (!detail || !detail.node) return false;
  const paths = detail.paths || [];
  const dirs = new Set(paths.map(dirOf).filter(Boolean));
  const label = detail.label || '';
  return group.files.some((f) => paths.includes(f.path)
    || (label && (!paths.length || label.includes('/')) && (f.path === label || f.path.endsWith('/' + label)))
    || dirs.has(dirOf(f.path)));
}

export default function render(block, ctx) {
  const { el } = ctx;
  const groups = (block.groups || []).filter((g) => g.files.length);
  if (!groups.length) return null;
  const metric = block.metric || 'changes';
  const valueOf = (f) => f[metric] || 0;
  const max = Math.max(0, ...groups.flatMap((g) => g.files.map(valueOf)));
  const totals = groups.map((g) => g.files.reduce((s, f) => s + f.lines, 0));
  const all = totals.reduce((a, b) => a + b, 0);

  const detail = el('div', { class: 'vs-hs-detail', 'aria-live': 'polite' });
  const hint = () => detail.replaceChildren(el('span', { class: 'vs-hs-hint' }, ctx.t('hotspots.hint')));
  hint();
  const tiles = new Map();
  let selected = null;

  const show = (file) => {
    if (selected) selected.classList.remove('vs-hs-on');
    selected = tiles.get(file.id) || null;
    if (selected) selected.classList.add('vs-hs-on');
    detail.replaceChildren(...[
      el('span', { class: 'vs-hs-detail-path', 'data-no-terms': true }, file.path),
      el('span', {}, ctx.plural(file.lines, 'hotspots.lines')),
      file.changes !== undefined ? el('span', {}, ctx.plural(file.changes, 'hotspots.changes')) : null,
      file.authors !== undefined ? el('span', {}, ctx.plural(file.authors, 'hotspots.authors')) : null,
      file.anchor ? ctx.anchorChip(file.anchor) : null,
      file.note ? el('span', { class: 'vs-hs-hint' }, file.note) : null,
    ].filter(Boolean));
  };

  const open = (f) => {
    show(f);
    if (f.anchor && typeof verstat !== 'undefined' && verstat.anchors) verstat.anchors.open(f.anchor, tiles.get(f.id));
  };

  const columns = groups.map((g, i) => {
    const width = (NOMINAL_WIDTH * totals[i]) / all;
    const rects = squarify(g.files.map((f) => ({ value: f.lines, file: f })), 0, 0, width, NOMINAL_HEIGHT);
    return ctx.part(el('div', { class: 'vs-hs-col', style: `flex: ${totals[i]} 1 0` }, rects.map((r) => {
      const f = r.item.file;
      const p = heat(valueOf(f), max);
      const h = r.h;
      const label = `${f.path}, ${ctx.plural(f.lines, 'hotspots.lines')}`;
      const tile = el('div', {
        class: 'vs-hs-tile' + (f.anchor ? '' : ' vs-hs-plain'),
        tabindex: '0',
        role: f.anchor ? 'button' : 'img',
        'aria-label': label,
        title: label,
        'data-no-terms': true,
        'data-own-click': true,
        style: `left:${(100 * r.x) / width}%;top:${(100 * r.y) / NOMINAL_HEIGHT}%;width:${(100 * r.w) / width}%;height:${(100 * h) / NOMINAL_HEIGHT}%;` +
          `background:color-mix(in oklab, var(--vs-accent) ${p}%, var(--vs-surface))`,
        onmouseenter: () => show(f),
        onfocus: () => show(f),
        onclick: () => open(f),
        onkeydown: f.anchor ? (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          open(f);
        } : null,
      }, [
        h >= 22 ? el('span', { class: 'vs-hs-name' }, f.path.split('/').pop()) : null,
        h >= 42 ? el('span', { class: 'vs-hs-lines' }, String(f.lines)) : null,
      ]);
      tiles.set(f.id, tile);
      return ctx.part(tile, f.id);
    })), g.id);
  });
  const map = el('div', { class: 'vs-hs-map' }, columns);

  ctx.on('dependency-graph:hover', (detail) => {
    const lit = groups.map((g) => linked(g, detail));
    const any = lit.some(Boolean);
    map.classList.toggle('vs-hs-linked', any);
    columns.forEach((c, i) => c.classList.toggle('vs-hs-lit', any && lit[i]));
  });

  ctx.onFocus((id) => {
    for (const g of groups) {
      const f = g.files.find((x) => x.id === id);
      if (f) show(f);
    }
  });

  const metricLabel = ctx.t(metric === 'authors' ? 'hotspots.colorAuthors' : 'hotspots.colorChanges');
  return el('div', { class: 'vs-hs' }, [
    map,
    el('div', { class: 'vs-hs-names' }, groups.map((g, i) => el('span', { style: `flex: ${totals[i]} 1 0`, title: g.label }, g.label))),
    el('div', { class: 'vs-hs-legend' }, [
      el('span', {}, ctx.t('hotspots.rare')),
      el('span', { class: 'vs-hs-scale', 'aria-hidden': 'true' }),
      el('span', {}, ctx.t('hotspots.often')),
      el('span', {}, '· ' + ctx.t('hotspots.size') + ' · ' + metricLabel + (block.period ? ' · ' + ctx.t('hotspots.period', { period: block.period }) : '')),
    ]),
    detail,
  ]);
}

render.squarify = squarify;
render.heat = heat;
