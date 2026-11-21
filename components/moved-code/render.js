function movedPlace(p) {
  const lines = p.start === undefined ? '' : `:${p.start}${p.end !== undefined && p.end !== p.start ? `–${p.end}` : ''}`;
  return `${p.repo ? `${p.repo}/` : ''}${p.path}${lines}`;
}

function movedBody(item, el) {
  const lines = item.body.split('\n');
  const coloured = window.verstat.syntax.highlight(lines, item.to.path);
  return lines.map((line, i) => el('span', { class: 'vs-acc-line' }, line === '…' ? '…' : coloured[i]));
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.items.length) return null;
  const opens = new Map();

  const list = el('div', { class: 'vs-acc' }, block.items.map((item) => {
    const body = el('div', { class: 'vs-acc-body', hidden: true }, [
      item.note ? el('p', { class: 'vs-acc-note' }, item.note) : null,
      item.anchor ? el('div', { class: 'vs-chips' }, ctx.anchorChip(item.anchor)) : null,
      el('pre', { class: 'vs-acc-pre', 'data-no-terms': true }, movedBody(item, el)),
    ]);
    const sign = el('span', { class: 'vs-acc-sign', 'aria-hidden': 'true' }, '+');
    const head = el('button', { type: 'button', class: 'vs-acc-head', 'aria-expanded': 'false', onclick: () => toggle(body.hidden) }, [
      el('span', { class: 'vs-acc-kind' }, ctx.t('moved-code.moved')),
      el('span', { class: 'vs-acc-title' }, [
        el('span', {}, item.title),
        el('span', { class: 'vs-acc-path' }, `${movedPlace(item.from)} → ${movedPlace(item.to)}`),
      ]),
      el('span', { class: 'vs-acc-count' }, ctx.plural(item.lines, 'moved-code.lines')),
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
