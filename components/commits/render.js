const LANE = 18;
const NODE_Y = 20;

function newestFirst(list) {
  const at = new Map(list.map((c, i) => [c.sha, i]));
  const linked = list.some((c) => (c.parents || []).some((p) => at.has(p)));
  const oldestFirst = list.some((c, i) => (c.parents || []).some((p) => at.has(p) && at.get(p) < i));
  return !linked || oldestFirst ? list.slice().reverse() : list.slice();
}

export default function (block, ctx) {
  const { el, svg } = ctx;
  if (!block.commits.length) return null;
  const commits = newestFirst(block.commits);
  const graph = window.verstat.commitGraph(commits);
  const width = graph.lanes * LANE + 6;
  const x = (k) => 9 + k * LANE;
  const lane = (n) => `stroke:var(--vs-lane-${n})`;
  const brief = (ctx.page.blocks || []).find((b) => b.type === 'brief' && b.pr && b.pr.base);
  const baseName = brief ? ctx.t('commits.fromBase', { base: brief.pr.base }) : ctx.t('commits.fromBaseBranch');
  let selected = null;
  const rows = [];

  function select(commit) {
    selected = selected === commit ? null : commit;
    rows.forEach((row) => {
      const on = row.commit === selected;
      row.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      row.dot.classList.toggle('vs-cm-dot-on', on);
    });
    ctx.emit('commits:select', {
      block: block.id,
      commit: selected ? selected.sha : null,
      repo: selected ? selected.repo || null : null,
      files: selected ? selected.files.slice() : [],
    });
  }

  function drawing(c, g) {
    const xc = x(g.col);
    const paths = [];
    for (const k of g.pass) paths.push([g.beforeColors[k], `M${x(k)} 0 V 2000`]);
    for (const k of g.into) {
      paths.push([g.beforeColors[k], k === g.col
        ? `M${xc} 0 V ${NODE_Y}`
        : `M${x(k)} 0 C ${x(k)} ${NODE_Y * 0.6} ${xc} ${NODE_Y * 0.4} ${xc} ${NODE_Y}`]);
    }
    for (const k of g.outs) {
      paths.push([g.afterColors[k], k === g.col
        ? `M${xc} ${NODE_Y} V 2000`
        : `M${xc} ${NODE_Y} C ${xc} ${NODE_Y + 14} ${x(k)} ${NODE_Y + 10} ${x(k)} ${NODE_Y + 26} V 2000`]);
    }
    const merge = (c.parents || []).length > 1;
    const dot = svg('circle', {
      class: `vs-cm-dot${merge || c.external ? ' vs-cm-dot-hollow' : ''}${c.external ? ' vs-cm-dot-external' : ''}`,
      cx: xc,
      cy: NODE_Y,
      r: merge ? 5.5 : 5,
      style: `${lane(g.color)};--vs-cm-lane:var(--vs-lane-${g.color})`,
    });
    const drawn = svg('svg', { class: 'vs-cm-svg', 'aria-hidden': 'true' }, [
      ...paths.map(([color, d]) => svg('path', { d, style: lane(color), class: 'vs-cm-line' })),
      dot,
    ]);
    return { drawn, dot, merge };
  }

  const repoless = commits.every((c) => !c.repo);
  return el('div', { class: `vs-cm${repoless ? ' vs-cm-norepo' : ''}` }, commits.map((c, i) => {
    const { drawn, dot, merge } = drawing(c, graph.rows[i]);
    const tag = merge ? ctx.t('commits.merge') : c.external ? baseName : null;
    const stat = merge || c.external || (c.additions === undefined && c.deletions === undefined) ? '' : [
      el('span', { class: 'vs-add' }, `+${c.additions || 0}`),
      ' ',
      el('span', { class: 'vs-del' }, `−${c.deletions || 0}`),
    ];
    const node = el('button', {
      type: 'button',
      class: `vs-cm-row${c.external ? ' vs-cm-external' : ''}`,
      'aria-pressed': 'false',
      title: ctx.t(c.files.length ? 'commits.filter' : 'commits.noFiles'),
      onclick: () => select(c),
    }, [
      el('span', { class: 'vs-cm-graph', style: `width:${width}px` }, drawn),
      el('span', { class: 'vs-cm-body' }, [
        el('span', { class: 'vs-cm-sha' }, c.sha.slice(0, 7)),
        repoless ? null : el('span', { class: 'vs-cm-repo' }, c.repo),
        el('span', { class: 'vs-cm-text' }, [
          el('span', { class: 'vs-cm-msg' }, [c.message, tag ? el('span', { class: 'vs-cm-tag' }, tag) : null]),
          c.intent ? el('span', { class: 'vs-cm-intent' }, c.intent) : null,
        ]),
        el('span', { class: 'vs-cm-stat' }, stat),
      ]),
    ]);
    rows.push({ node, dot, commit: c });
    return ctx.part(node, c.id);
  }));
}
