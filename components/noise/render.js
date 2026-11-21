function noiseBody(item, el) {
  const out = [];
  let path = item.paths[0];
  let group = [];
  const flush = () => {
    const coloured = [];
    for (const sign of ['-', '+']) {
      const at = group.map((g, i) => (g.sign === sign ? i : -1)).filter((i) => i >= 0);
      const lit = window.verstat.syntax.highlight(at.map((i) => group[i].text), path);
      at.forEach((i, k) => { coloured[i] = lit[k]; });
    }
    group.forEach((g, i) => {
      const kind = g.sign === '+' ? 'add' : 'del';
      out.push(el('span', { class: `vs-acc-line vs-acc-${kind}` }, [
        el('span', { class: `vs-acc-mark vs-${kind}`, 'aria-hidden': 'true' }, g.sign === '+' ? '+' : '−'),
        ...coloured[i],
      ]));
    });
    group = [];
  };
  for (const line of item.body.split('\n')) {
    const m = line.match(/^([+-]) (.*)$/);
    if (m) {
      group.push({ sign: m[1], text: m[2] });
      continue;
    }
    flush();
    if (item.paths.includes(line)) path = line;
    out.push(el('span', { class: `vs-acc-line${item.paths.includes(line) ? ' vs-acc-path-line' : ''}` }, line));
  }
  flush();
  return out;
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.items.length) return null;
  const opens = new Map();

  const list = el('div', { class: 'vs-acc' }, block.items.map((item) => {
    const body = el('div', { class: 'vs-acc-body', hidden: true }, [
      item.note ? el('p', { class: 'vs-acc-note' }, item.note) : null,
      el('pre', { class: 'vs-acc-pre', 'data-no-terms': true }, noiseBody(item, el)),
    ]);
    const sign = el('span', { class: 'vs-acc-sign', 'aria-hidden': 'true' }, '+');
    const head = el('button', { type: 'button', class: 'vs-acc-head', 'aria-expanded': 'false', onclick: () => toggle(body.hidden) }, [
      el('span', { class: 'vs-acc-kind' }, ctx.t('noise.noise')),
      el('span', { class: 'vs-acc-title' }, [
        el('span', {}, item.title),
        el('span', { class: 'vs-acc-path' }, item.paths.join(', ')),
      ]),
      el('span', { class: 'vs-acc-count' }, ctx.plural(item.lines, 'noise.lines')),
      sign,
    ]);
    function toggle(open) {
      body.hidden = !open;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      sign.textContent = open ? '−' : '+';
    }
    opens.set(item.id, toggle);
    return ctx.part(el('div', { class: 'vs-acc-item' }, [head, body]), item.id);
  }));

  ctx.onFocus((part) => { if (opens.has(part)) opens.get(part)(true); });
  return list;
}
