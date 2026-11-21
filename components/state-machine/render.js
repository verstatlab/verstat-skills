const CSS = `
.vs-sm-warn { margin-top: 8px; font-size: 13px; color: var(--vs-err); }
.vs-sm-top { display: flex; flex-wrap: wrap; justify-content: flex-end; margin-bottom: 10px; }
.vs-sm-was { font-family: var(--vs-mono); font-size: 12px; color: var(--vs-muted); text-decoration: line-through; }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="state-machine"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'state-machine');
  style.textContent = CSS;
  document.head.appendChild(style);
}

verstat.behavior = verstat.behavior || {};
verstat.behavior.stateMachine = {
  analyse(states, transitions) {
    const ids = states.map((s) => s.id);
    const out = new Map(ids.map((id) => [id, []]));
    for (const t of transitions) if (out.has(t.from) && out.has(t.to)) out.get(t.from).push(t.to);
    const initial = states.filter((s) => s.initial).map((s) => s.id);
    let unreachable = [];
    if (initial.length) {
      const seen = new Set(initial);
      const queue = initial.slice();
      while (queue.length) {
        for (const next of out.get(queue.shift())) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      unreachable = ids.filter((id) => !seen.has(id));
    }
    const deadEnd = states.filter((s) => !s.final && !out.get(s.id).length).map((s) => s.id);
    return { unreachable, deadEnd };
  },
  mermaid(states, transitions) {
    const m = verstat.mermaid;
    const lines = ['stateDiagram-v2'];
    for (const s of states) lines.push(`  state "${m.label(s.label || s.id)}" as ${m.id(s.id)}`);
    for (const s of states) if (s.initial) lines.push(`  [*] --> ${m.id(s.id)}`);
    for (const t of transitions) {
      const text = [t.trigger, t.condition].filter(Boolean).join(' / ');
      lines.push(`  ${m.id(t.from)} --> ${m.id(t.to)}${text ? `: ${m.label(text)}` : ''}`);
    }
    for (const s of states) if (s.final) lines.push(`  ${m.id(s.id)} --> [*]`);
    return lines.join('\n');
  },
};

export default function (block, ctx) {
  const { el, diff } = ctx;
  const sm = verstat.behavior.stateMachine;
  const states = block.states.filter((s) => diff.shows(s));
  if (!states.length) return null;
  const known = new Set(states.map((s) => s.id));
  const visible = block.transitions.filter((t) => diff.shows(t));
  const oldBasis = (t) => {
    if (diff.mode !== 'before' || t.change !== 'changed' || !t.before) return null;
    if (t.before.anchor) return 'checked';
    return t.before.to !== undefined && t.before.to !== t.to ? 'unanchored' : null;
  };
  const view = visible.map((t) => ({
    part: t,
    id: t.id,
    from: t.from,
    to: diff.value(t, 'to'),
    trigger: diff.value(t, 'trigger'),
    condition: diff.value(t, 'condition'),
    anchor: oldBasis(t) === 'unanchored' ? undefined : diff.value(t, 'anchor'),
  }));
  const transitions = view.filter((t) => known.has(t.from) && known.has(t.to));
  const broken = view.filter((t) => !(known.has(t.from) && known.has(t.to)));
  const byId = new Map(states.map((s) => [s.id, s]));
  const inDiff = diff.mode === 'diff';
  const afterStates = inDiff ? states.filter((st) => st.change !== 'removed') : states;
  const afterIds = new Set(afterStates.map((st) => st.id));
  const afterTransitions = inDiff
    ? transitions.filter((t) => t.part.change !== 'removed' && afterIds.has(t.from) && afterIds.has(t.to))
    : transitions;
  const flags = sm.analyse(afterStates, afterTransitions);

  ctx.mermaid(() => sm.mermaid(afterStates, afterTransitions));

  const sourceOf = (t) => {
    const basis = oldBasis(t.part);
    if (basis === 'checked') return t.part.before.source || t.part.source;
    if (basis === 'unanchored') return 'inferred';
    return t.part.source;
  };
  const inferred = (t) => sourceOf(t) === 'inferred';
  const name = (id) => (byId.has(id) ? byId.get(id).label || id : id);
  const was = (t, field) => {
    const before = t.part.before;
    if (!inDiff || t.part.change !== 'changed' || !before || before[field] === undefined || before[field] === t[field]) return undefined;
    return before[field];
  };
  const tone = (part) => (inDiff && part.change === 'added' ? 'add' : inDiff && part.change === 'removed' ? 'del' : null);

  const labelOf = (t) => {
    const oldTrigger = was(t, 'trigger');
    const oldCondition = was(t, 'condition');
    const oldTo = was(t, 'to');
    const head = [];
    if (t.trigger || oldTrigger !== undefined) head.push(oldTrigger !== undefined ? `${oldTrigger || '—'} → ${t.trigger || '—'}` : t.trigger);
    if (t.condition || oldCondition !== undefined) head.push(oldCondition !== undefined ? `${oldCondition || '—'} → ${t.condition || '—'}` : t.condition);
    const lines = head.length ? [head.join(' · ')] : [];
    if (oldTo) lines.push(ctx.t('state-machine.wasTo', { to: name(oldTo) }));
    return lines.join('\n');
  };

  const nodes = [];
  const edges = [];
  for (const s of states) {
    if (s.initial) {
      nodes.push({ id: `start:${s.id}`, type: 'start', part: null });
      edges.push({ s: `start:${s.id}`, t: s.id, part: null });
    }
  }
  for (const s of states) {
    const sub = [];
    if (s.label && s.label !== s.id) sub.push(s.id);
    if (flags.unreachable.includes(s.id)) sub.push(ctx.t('state-machine.unreachable'));
    if (flags.deadEnd.includes(s.id)) sub.push(ctx.t('state-machine.deadEnd'));
    nodes.push({
      id: s.id,
      title: s.label || s.id,
      sub: sub.join(' · '),
      note: s.text,
      final: !!s.final,
      dash: ctx.isInferred(s),
      tone: tone(s),
    });
  }
  for (const t of transitions) {
    const tn = tone(t.part);
    edges.push({ part: t.id, key: t.id, s: t.from, t: t.to, label: labelOf(t), aria: `${name(t.from)} → ${name(t.to)}${t.trigger ? `: ${t.trigger}` : ''}`, tone: tn, dash: inferred(t) || tn === 'del' });
  }

  const panel = el('div', { class: 'vs-flow-panel', 'data-no-terms': true });
  const byKey = new Map(transitions.map((t) => [t.id, t]));
  let selected = null;

  function fillPanel(t) {
    if (!t) {
      panel.replaceChildren(el('div', { class: 'vs-flow-hint-row' }, ctx.t('state-machine.hint')));
      return;
    }
    const from = byId.get(t.from);
    const to = byId.get(t.to);
    const cell = (label, value) => el('div', {}, [el('span', { class: 'vs-flow-k' }, label), ...[].concat(value)]);
    const old = (field, show) => {
      const v = was(t, field);
      return v === undefined ? null : el('span', { class: 'vs-sm-was' }, ctx.t('state-machine.was', { value: show ? show(v) : v || '—' }));
    };
    const where = [];
    if (t.anchor) where.push(ctx.anchorChip(t.anchor));
    if (sourceOf(t)) where.push(ctx.sourceChip(sourceOf(t)));
    panel.replaceChildren(
      cell(ctx.t('state-machine.transition'), [el('span', { class: 'vs-flow-v vs-flow-strong' }, `${from.label || from.id} → ${to.label || to.id}`), old('to', (v) => `→ ${name(v)}`)]),
      cell(ctx.t('state-machine.trigger'), [el('span', { class: 'vs-flow-v' }, t.trigger || '—'), old('trigger')]),
      cell(ctx.t('state-machine.condition'), [el('span', { class: 'vs-flow-v' }, t.condition || '—'), old('condition')]),
      cell(ctx.t('state-machine.where'), where.length ? el('div', { class: 'vs-chips' }, where) : el('span', { class: 'vs-muted' }, ctx.t('state-machine.noAnchor'))),
    );
  }

  const host = el('div', {});
  const flow = verstat.flow.mount(host, {
    spec: { rankdir: 'LR', nodes, edges },
    height: 380,
    ariaLabel: block.title || ctx.t('state-machine.label'),
    onEdgeClick: (key) => select(key),
  });
  ctx.onCleanup(() => flow.destroy());

  function select(id) {
    selected = byKey.has(id) ? id : null;
    flow.update({ sel: selected });
    fillPanel(selected ? byKey.get(selected) : null);
  }
  select(transitions.length ? transitions[0].id : null);

  ctx.on('focus', (d) => { if (d.block !== block.id || !d.part) flow.update({ focus: null }); });
  ctx.onFocus((id) => {
    if (byKey.has(id)) select(id);
    flow.update({ focus: id });
  });

  const legend = inDiff ? el('div', { class: 'vs-sm-top' }, el('div', { class: 'vs-flow-legend' }, [
    el('span', {}, [el('i', { class: 'is-add' }), ctx.t('state-machine.added')]),
    el('span', {}, [el('i', { class: 'is-del' }), ctx.t('state-machine.removed')]),
    el('span', {}, ctx.t('state-machine.changed')),
  ])) : null;

  const warn = broken.length ? el('div', { class: 'vs-sm-warn' }, broken.map((t) => el('div', {}, ctx.t('state-machine.broken', { id: t.id, from: t.from, to: t.to })))) : null;

  return el('div', { class: 'vs-sm' }, [legend, el('div', { class: 'vs-flow-frame' }, [host, panel]), warn]);
}
