export default function (block, ctx) {
  const { el } = ctx;
  if (!(ctx.page.route || []).length) return null;
  const list = el('ol', { class: 'vs-route-list', 'data-no-terms': '' });
  const summary = el('p', { class: 'vs-route-summary vs-mono vs-muted' });

  const root = el('div', { class: 'vs-route' }, [summary, list]);
  ctx.on('route', (state) => {
    const section = root.closest && root.closest('.vs-block');
    if (section) section.hidden = !state.steps.length;
    list.replaceChildren(...state.steps.map((s, i) => el('li', {}, el('button', {
      type: 'button',
      class: `vs-route-item${s.index === state.active ? ' vs-current' : ''}`,
      'data-step': s.index,
      onclick: () => ctx.goToStep(s.index),
    }, [
      el('span', { class: 'vs-route-num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'vs-route-text' }, [
        el('span', { class: 'vs-route-title' }, s.title),
        el('span', { class: 'vs-route-why' }, s.why),
      ]),
      el('span', { class: 'vs-route-meta' }, [
        el('span', {}, ctx.t('route.minutes', { n: s.minutes })),
        el('span', { class: 'vs-route-modes' }, s.modes.map((m) => state.labels[m].split(' · ')[0]).join(' · ')),
      ]),
    ]))));
    summary.textContent = ctx.plural(state.steps.length, 'route.summary', { minutes: state.minutes, mode: state.labels[state.mode] });
  });
  return root;
}
