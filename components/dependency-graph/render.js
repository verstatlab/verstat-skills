if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="dependency-graph"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'dependency-graph');
  style.textContent = `
.vs-dg { display: flex; flex-direction: column; gap: 10px; }
.vs-dg-caption { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--vs-muted); }
.vs-dg-caption b { color: var(--vs-ink); font-weight: 600; }
.vs-dg-caption .vs-dg-cyc { color: var(--vs-accent-ink); }
.vs-dg-muted { color: var(--vs-muted); }
.vs-dg-edges { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.vs-dg-edges li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.vs-dg-edges .vs-dg-to { font-family: var(--vs-mono); font-size: 12px; overflow-wrap: anywhere; }
`;
  document.head.appendChild(style);
}

function cycles(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => { if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to); });
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const comps = [];
  const strong = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v)) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comps.push(comp);
    }
  };
  adj.forEach((_, id) => { if (!idx.has(id)) strong(id); });
  const selfLoops = new Set(edges.filter((e) => e.from === e.to && adj.has(e.from)).map((e) => e.from));
  const components = comps.filter((c) => c.length > 1 || selfLoops.has(c[0]));
  const compOf = new Map();
  components.forEach((c, i) => c.forEach((id) => compOf.set(id, i)));
  return {
    components,
    edges: edges.map((e) => compOf.has(e.from) && compOf.get(e.from) === compOf.get(e.to)),
  };
}

export default function render(block, ctx) {
  const { el } = ctx;
  const nodes = block.nodes || [];
  if (!nodes.length) return null;
  const warn = (text) => { if (typeof console !== 'undefined') console.warn('verstat: dependency-graph "' + block.id + '": ' + text); };
  const known = new Set(nodes.map((n) => n.id));
  const edges = (block.edges || []).filter((e) => {
    if (known.has(e.from) && known.has(e.to)) return true;
    warn('edge ' + e.from + ' → ' + e.to + ' names an unknown node; not drawn');
    return false;
  });
  const cyc = cycles(nodes, edges);
  const clusters = (block.clusters || []).filter((c) => nodes.some((n) => n.cluster === c.id));
  const clusterById = new Map(clusters.map((c) => [c.id, c]));
  const declared = new Set((block.clusters || []).map((c) => c.id));
  nodes.forEach((n) => { if (n.cluster && !declared.has(n.cluster)) warn('node "' + n.id + '" names an unknown cluster "' + n.cluster + '"; drawn without a frame'); });

  const detail = el('div', { class: 'vs-flow-panel', 'aria-live': 'polite', 'data-no-terms': true });
  const hint = () => detail.replaceChildren(el('div', { class: 'vs-flow-hint-row' }, ctx.t('dependency-graph.hint')));
  hint();

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgeRow = (e, out) => el('li', {}, [
    el('span', { class: 'vs-dg-to' }, (out ? '→ ' : '← ') + byId.get(out ? e.to : e.from).label),
    el('span', { class: 'vs-dg-muted' }, [ctx.t(`dependency-graph.edge.${e.kind || 'import'}`, null, e.kind), e.label].filter(Boolean).join(' · ')),
    e.anchor ? ctx.anchorChip(e.anchor) : null,
    ctx.sourceChip(e.source),
  ]);
  const cell = (label, value) => el('div', {}, [el('span', { class: 'vs-flow-k' }, label), ...[].concat(value)]);

  const select = (n) => {
    const ins = edges.filter((e) => e.to === n.id);
    const outs = edges.filter((e) => e.from === n.id);
    const chips = (n.anchors || []).map((a) => ctx.anchorChip(a));
    if (n.source) chips.push(ctx.sourceChip(n.source));
    const cluster = clusterById.get(n.cluster);
    detail.replaceChildren(...[
      cell(ctx.t('dependency-graph.module'), [
        el('span', { class: 'vs-flow-v vs-flow-strong' }, n.label),
        el('span', { class: 'vs-dg-muted' }, (cluster ? cluster.label + ' · ' : '') + ctx.t('dependency-graph.inOut', { in: ins.length, out: outs.length })),
      ]),
      n.note ? cell(ctx.t('dependency-graph.note'), el('span', { class: 'vs-flow-v' }, n.note)) : null,
      chips.length ? cell(ctx.t('dependency-graph.code'), el('div', { class: 'vs-chips' }, chips)) : null,
      ins.length || outs.length
        ? cell(ctx.t('dependency-graph.deps'), el('ul', { class: 'vs-dg-edges' }, outs.map((e) => edgeRow(e, true)).concat(ins.map((e) => edgeRow(e, false)))))
        : null,
    ].filter(Boolean));
  };

  const hover = (n) => {
    ctx.emit('dependency-graph:hover', n
      ? { block: block.id, node: n.id, label: n.label, cluster: n.cluster || null, paths: (n.anchors || []).map((a) => a.path) }
      : { block: block.id, node: null, label: null, cluster: null, paths: [] });
  };

  const host = el('div', {});
  const flow = verstat.flow.mount(host, {
    spec: {
      rankdir: 'TB',
      groups: clusters.map((c) => ({ id: c.id, title: c.label })),
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.label,
        note: n.note,
        group: clusterById.has(n.cluster) ? n.cluster : undefined,
        hot: !!n.highlight,
        dash: ctx.isInferred(n),
        click: true,
      })),
      edges: edges.map((e, i) => ({
        part: e.id || null,
        s: e.from,
        t: e.to,
        label: e.label,
        on: cyc.edges[i],
        dash: e.kind === 'call' || ctx.isInferred(e),
      })),
    },
    height: 460,
    ariaLabel: block.title || ctx.t('dependency-graph.label'),
    onNodeEnter: (id) => { flow.update({ hl: [id] }); hover(byId.get(id)); },
    onNodeLeave: () => { flow.update({ hl: [] }); hover(null); },
    onNodeClick: (id) => {
      const n = byId.get(id);
      select(n);
      if (n.anchors && n.anchors.length) verstat.anchors.open(n.anchors[0]);
    },
  });
  ctx.onCleanup(() => flow.destroy());

  ctx.on('focus', (d) => { if (d.block !== block.id || !d.part) flow.update({ focus: null }); });
  ctx.onFocus((id) => {
    flow.update({ focus: id });
    const n = byId.get(id);
    if (n) select(n);
  });

  const imports = edges.filter((e) => e.kind !== 'call').length;
  const calls = edges.length - imports;
  return el('div', { class: 'vs-dg' }, [
    el('div', { class: 'vs-flow-frame' }, [host, detail]),
    el('div', { class: 'vs-dg-caption' }, [
      el('span', {}, [el('b', {}, ctx.plural(nodes.length, 'dependency-graph.modules'))]),
      el('span', {}, ctx.t('dependency-graph.legend', { imports, calls })),
      el('span', { class: cyc.components.length ? 'vs-dg-cyc' : null }, ctx.t('dependency-graph.cycles', { n: cyc.components.length })),
    ]),
  ]);
}

render.cycles = cycles;
