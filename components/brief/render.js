export default function (block, ctx) {
  const { el } = ctx;
  const pr = block.pr;
  const repos = Object.keys(ctx.page.repos || {}).filter((name) => !name.includes('@'));
  const root = el('div', { class: 'vs-brief' });

  root.append(
    el('div', { class: 'vs-brief-kicker' }, [
      el('span', { class: 'vs-kicker' }, `${ctx.number} · ${ctx.t(pr ? 'brief.whatChanged' : 'brief.answer')}`),
      el('span', { class: 'vs-kicker' }, `${ctx.page.skill} · ${ctx.plural(repos.length, 'brief.repos')}`),
    ]),
    el('h1', {}, block.title || (pr && pr.title) || ctx.page.question),
  );
  if (block.subtitle) root.append(el('p', { class: 'vs-sub vs-brief-sub' }, block.subtitle));

  if (pr) {
    const stats = [
      el('span', {}, `${pr.head} → ${pr.base}`),
      el('span', { class: 'vs-add' }, `+${pr.additions}`),
      el('span', { class: 'vs-del' }, `−${pr.deletions}`),
    ];
    const counts = [];
    if (pr.files !== undefined) counts.push(ctx.plural(pr.files, 'brief.files'));
    if (repos.length) counts.push(ctx.plural(repos.length, 'brief.repos'));
    if (pr.commits !== undefined) counts.push(ctx.plural(pr.commits, 'brief.commits'));
    if (counts.length) stats.push(el('span', {}, counts.join(' · ')));
    root.append(el('div', { class: 'vs-brief-stats' }, stats));
  }

  root.append(el('p', { class: 'vs-brief-answer' }, block.answer));
  if (block.note) root.append(el('p', { class: 'vs-brief-note' }, block.note));

  if (block.numbers && block.numbers.length) {
    root.append(el('div', { class: 'vs-brief-numbers' }, block.numbers.map((n) =>
      ctx.part(el('div', { class: `vs-brief-number${n.accent ? ' vs-accent' : ''}` }, [
        el('span', { class: 'vs-brief-value' }, String(n.value)),
        el('span', { class: 'vs-brief-label' }, n.label),
      ]), n.id))));
  }

  if (block.facts && block.facts.length) {
    root.append(el('div', { class: 'vs-brief-facts' }, block.facts.map((f) => {
      const node = el('div', { class: `vs-brief-fact${ctx.isInferred(f) ? ' vs-inferred' : ''}` }, [
        el('p', {}, f.text),
        el('div', { class: 'vs-chips' }, [f.anchor ? ctx.anchorChip(f.anchor) : null, ctx.sourceChip(f.source)]),
      ]);
      return ctx.part(node, f.id);
    })));
  }
  return root;
}
