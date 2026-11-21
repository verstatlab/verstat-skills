const CSS = `
.vs-tc-sum { font-size: 15px; margin-bottom: 12px; }
.vs-tc-sum b { font-weight: 600; }
.vs-tc-none { font-size: 13px; color: var(--vs-muted); }
.vs-tc-note { font-size: 12.5px; line-height: 1.4; color: var(--vs-muted); }
.vs-tc-frag { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.vs-tc-frag-name { font-family: var(--vs-mono); font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere; }
.vs-tc-frag .vs-tc-note { font-size: 13.5px; line-height: 1.45; font-weight: 400; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-test-coverage')) {
  const style = document.createElement('style');
  style.id = 'vs-css-test-coverage';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const COLS = '28px 110px minmax(0, 1fr) minmax(0, 280px)';

function tcFragments(ctx) {
  const rows = [];
  for (const b of ctx.page.blocks || []) {
    if (b.type !== 'changes') continue;
    for (const file of b.files || []) {
      for (const fragment of file.fragments || []) {
        if (fragment.kind === 'read' || fragment.kind === 'skim') rows.push({ file, fragment });
      }
    }
  }
  return rows;
}

function tcDiff(block, ctx) {
  const { el } = ctx;
  const all = tcFragments(ctx);
  if (!all.length) return null;
  const covered = all.filter((r) => r.fragment.test).length;
  const head = el('div', { class: 'vs-table-row vs-table-head' }, [
    el('span', {}, '#'),
    el('span', {}, ctx.t('test-coverage.state')),
    el('span', {}, ctx.t('test-coverage.fragment')),
    el('span', { class: 'vs-table-code' }, ctx.t('test-coverage.test')),
  ]);
  return el('div', { class: 'vs-tc' }, [
    el('p', { class: 'vs-tc-sum' }, [el('b', {}, ctx.t('test-coverage.fragmentsOf', { covered, total: all.length })), ' ', ctx.plural(all.length, 'test-coverage.fragmentsCovered')]),
    el('div', { class: 'vs-table' }, el('div', { class: 'vs-table-grid', style: `--vs-table-cols:${COLS};--vs-table-min:600px` }, [
      head,
      ...all.map(({ file, fragment }, i) => {
        const test = fragment.test;
        const name = file.path.split('/').pop();
        return el('div', { class: `vs-table-row vs-tc-row${test ? '' : ' vs-tc-no'}` }, [
          el('span', { class: 'vs-table-num' }, String(i + 1).padStart(2, '0')),
          el('span', { class: `vs-state ${test ? 'vs-state-ok' : 'vs-state-problem'}` }, ctx.t(test ? 'test-coverage.covered' : 'test-coverage.notCovered')),
          el('div', { class: 'vs-table-main vs-tc-frag' }, [
            el('span', { class: 'vs-tc-frag-name', 'data-no-terms': true }, fragment.function ? `${name} · ${fragment.function}` : name),
            el('span', { class: 'vs-tc-note' }, test ? test.description : ctx.t('test-coverage.noTest')),
          ]),
          el('div', { class: 'vs-table-code vs-tc-tests' }, test ? el('div', { class: 'vs-chips' }, ctx.anchorChip(test.anchor, test.name)) : null),
        ]);
      }),
    ])),
  ]);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (block.mode === 'diff') return tcDiff(block, ctx);
  const all = block.behaviors || [];
  if (!all.length) return null;
  const covered = all.filter((b) => b.tests.length).length;
  const total = all.length;
  const head = el('div', { class: 'vs-table-row vs-table-head' }, [
    el('span', {}, '#'),
    el('span', {}, ctx.t('test-coverage.state')),
    el('span', {}, ctx.t('test-coverage.behavior')),
    el('span', { class: 'vs-table-code' }, ctx.t('test-coverage.test')),
  ]);
  return el('div', { class: 'vs-tc' }, [
    el('p', { class: 'vs-tc-sum' }, [el('b', {}, ctx.t('test-coverage.behaviorsOf', { covered, total })), ' ', ctx.plural(total, 'test-coverage.behaviorsPinned')]),
    el('div', { class: 'vs-table' }, el('div', { class: 'vs-table-grid', style: `--vs-table-cols:${COLS};--vs-table-min:600px` }, [
      head,
      ...all.map((b, i) => {
        const has = b.tests.length > 0;
        return ctx.part(el('div', { class: `vs-table-row vs-tc-row${has ? '' : ' vs-tc-no'}${ctx.isInferred(b) ? ' vs-inferred' : ''}` }, [
          el('span', { class: 'vs-table-num' }, String(i + 1).padStart(2, '0')),
          el('span', { class: `vs-state ${has ? 'vs-state-ok' : 'vs-state-problem'}` }, ctx.t(has ? 'test-coverage.covered' : 'test-coverage.notCovered')),
          el('span', { class: 'vs-table-main vs-tc-beh' }, b.behavior),
          el('div', { class: 'vs-table-code vs-tc-tests' }, [
            has ? el('div', { class: 'vs-chips' }, b.tests.map((t) => ctx.anchorChip(t.anchor, t.name))) : null,
            !has && !b.note ? el('span', { class: 'vs-tc-none' }, '—') : null,
            b.note ? el('span', { class: 'vs-tc-note' }, b.note) : null,
            b.source ? ctx.sourceChip(b.source) : null,
          ]),
        ]), b.id);
      }),
    ])),
  ]);
}
