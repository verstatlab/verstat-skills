export default function (block, ctx) {
  const { el } = ctx;
  if (!block.points.length) return null;
  return el('div', { class: 'vs-cp' }, block.points.map((p) => {
    const chips = (p.anchors || []).map((a) => ctx.anchorChip(a));
    if (p.source) chips.push(ctx.sourceChip(p.source));
    return ctx.part(el('div', { class: `vs-cp-card vs-cp-${p.kind}${ctx.isInferred(p) ? ' vs-inferred' : ''}` }, [
      el('span', { class: 'vs-cp-kind' }, ctx.t(`change-points.kind.${p.kind}`, null, p.kind)),
      el('span', { class: 'vs-cp-title' }, p.title),
      el('p', { class: 'vs-cp-text' }, p.text),
      p.commands && p.commands.length ? el('pre', { class: 'vs-cp-cmd' }, p.commands.join('\n')) : null,
      chips.length ? el('div', { class: 'vs-chips' }, chips) : null,
    ]), p.id);
  }));
}
