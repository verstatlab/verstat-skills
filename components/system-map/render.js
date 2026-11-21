if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="system-map"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'system-map');
  style.textContent = `
.vs-sm { display: flex; flex-direction: column; gap: 10px; }
.vs-sm-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 12px; color: var(--vs-muted); }
.vs-sm-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.vs-sm-links li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.vs-sm-links .vs-sm-to { font-weight: 600; }
.vs-sm-muted { color: var(--vs-muted); }
`;
  document.head.appendChild(style);
}

const LEVELS = ['system', 'service', 'module'];

function levels(block, warn) {
  const seen = new Map();
  (block.levels || []).forEach((l) => {
    if (!l.nodes.length) return;
    if (seen.has(l.level)) {
      if (warn) warn('level "' + l.level + '" appears more than once; only the first is shown');
      return;
    }
    seen.set(l.level, l);
  });
  return LEVELS.filter((name) => seen.has(name)).map((name) => seen.get(name));
}

function levelOfPart(block, id, prefer) {
  const has = (l) => l.nodes.some((n) => n.id === id || n.group === id) || (l.links || []).some((k) => k.id === id);
  const list = levels(block);
  const found = (prefer && list.find((l) => l.level === prefer && has(l))) || list.find(has);
  return found ? found.level : null;
}

export default function render(block, ctx) {
  const { el } = ctx;
  const warn = (text) => { if (typeof console !== 'undefined') console.warn('verstat: system-map "' + block.id + '": ' + text); };
  const list = levels(block, warn);
  if (!list.length) return null;
  const groupById = new Map((block.groups || []).map((g) => [g.id, g]));
  const warned = new Set();
  const warnOnce = (text) => { if (!warned.has(text)) { warned.add(text); warn(text); } };
  let current = list.find((l) => l.level === block.level) || list[0];

  const host = el('div', {});
  const detail = el('div', { class: 'vs-flow-panel', 'aria-live': 'polite', 'data-no-terms': true });
  const buttons = new Map();
  let flow = null;
  let currentLinks = [];

  const hint = () => detail.replaceChildren(el('div', { class: 'vs-flow-hint-row' }, ctx.t('system-map.hint')));

  const linkRow = (k, out) => el('li', {}, [
    el('span', { class: 'vs-sm-to' }, (out ? '→ ' : '← ') + current.nodes.find((x) => x.id === (out ? k.to : k.from)).label),
    el('span', { class: 'vs-sm-muted' }, [k.kind ? ctx.t(`system-map.link.${k.kind}`, null, k.kind) : null, k.label].filter(Boolean).join(' · ')),
    k.anchor ? ctx.anchorChip(k.anchor) : null,
    ctx.sourceChip(k.source),
  ]);

  const cell = (label, value) => el('div', {}, [el('span', { class: 'vs-flow-k' }, label), ...[].concat(value)]);

  const select = (n) => {
    const chips = (n.anchors || []).map((a) => ctx.anchorChip(a));
    if (n.source) chips.push(ctx.sourceChip(n.source));
    const group = groupById.get(n.group);
    const outs = currentLinks.filter((k) => k.from === n.id);
    const ins = currentLinks.filter((k) => k.to === n.id);
    detail.replaceChildren(...[
      cell(ctx.t('system-map.node'), [
        el('span', { class: 'vs-flow-v vs-flow-strong' }, n.label),
        el('span', { class: 'vs-sm-muted' }, ctx.t(`system-map.kind.${n.kind}`, null, n.kind) + (group ? ' · ' + group.label : '')),
      ]),
      n.note ? cell(ctx.t('system-map.note'), el('span', { class: 'vs-flow-v' }, n.note)) : null,
      chips.length ? cell(ctx.t('system-map.code'), el('div', { class: 'vs-chips' }, chips)) : null,
      ins.length || outs.length
        ? cell(ctx.t('system-map.links'), el('ul', { class: 'vs-sm-links' }, outs.map((k) => linkRow(k, true)).concat(ins.map((k) => linkRow(k, false)))))
        : null,
    ].filter(Boolean));
  };

  const draw = (level, focus) => {
    current = level;
    buttons.forEach((b, name) => b.setAttribute('aria-pressed', name === level.level ? 'true' : 'false'));
    hint();
    const nodes = level.nodes;
    const known = new Set(nodes.map((n) => n.id));
    const links = (level.links || []).filter((k) => {
      if (known.has(k.from) && known.has(k.to)) return true;
      warnOnce('link ' + k.from + ' → ' + k.to + ' names a node that is not on the "' + level.level + '" level; not drawn');
      return false;
    });
    currentLinks = links;
    nodes.forEach((n) => { if (n.group && !groupById.has(n.group)) warnOnce('node "' + n.id + '" names an unknown group "' + n.group + '"; drawn without a frame'); });
    const groups = (block.groups || []).filter((g) => nodes.some((n) => n.group === g.id));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const spec = {
      rankdir: 'LR',
      groups: groups.map((g) => ({ id: g.id, title: g.label })),
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.label,
        sub: ctx.t(`system-map.kind.${n.kind}`, null, n.kind),
        note: n.note,
        group: groupById.has(n.group) ? n.group : undefined,
        hot: !!n.highlight,
        dash: n.kind === 'external' || ctx.isInferred(n),
        click: true,
      })),
      edges: links.map((k) => ({
        part: k.id || null,
        s: k.from,
        t: k.to,
        label: k.label,
        on: !!k.highlight,
        dash: k.kind === 'publish' || k.kind === 'subscribe' || ctx.isInferred(k),
      })),
    };
    if (flow) flow.destroy();
    flow = verstat.flow.mount(host, {
      spec,
      height: 440,
      focus: focus || null,
      ariaLabel: (block.title || ctx.t('system-map.label')) + ' · ' + ctx.t(`system-map.level.${level.level}`),
      onNodeEnter: (id) => flow.update({ hl: [id] }),
      onNodeLeave: () => flow.update({ hl: [] }),
      onNodeClick: (id) => {
        const n = byId.get(id);
        select(n);
        if (n.anchors && n.anchors.length) verstat.anchors.open(n.anchors[0]);
      },
    });
  };
  ctx.onCleanup(() => { if (flow) flow.destroy(); });

  const tools = [];
  if (list.length > 1) {
    tools.push(el('div', { class: 'vs-seg', role: 'group', 'aria-label': ctx.t('system-map.levelAria') }, list.map((l) => {
      const b = el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { if (l !== current) draw(l); } }, ctx.t(`system-map.level.${l.level}`));
      buttons.set(l.level, b);
      return b;
    })));
  }
  tools.push(el('span', {}, ctx.t('system-map.legend')));

  ctx.on('focus', (d) => { if (flow && (d.block !== block.id || !d.part)) flow.update({ focus: null }); });
  ctx.onFocus((id) => {
    const name = levelOfPart(block, id, current.level);
    if (!name) {
      if (flow) flow.update({ focus: null });
      return;
    }
    if (name !== current.level) draw(list.find((l) => l.level === name), id);
    else flow.update({ focus: id });
    const n = current.nodes.find((x) => x.id === id);
    if (n) select(n);
  });

  draw(current);
  return el('div', { class: 'vs-sm' }, [el('div', { class: 'vs-sm-tools' }, tools), el('div', { class: 'vs-flow-frame' }, [host, detail])]);
}

render.levels = levels;
render.levelOfPart = levelOfPart;
