const CSS = `
.vs-ch { display: flex; flex-direction: column; gap: 14px; }
.vs-ch-hint { font-size: 13px; color: var(--vs-accent-ink); }
.vs-ch-hint[hidden], .vs-ch-panel[hidden], .vs-ch-body[hidden] { display: none; }
.vs-ch-tabs { display: flex; overflow-x: auto; border: 1px solid var(--vs-rule); border-radius: var(--vs-r); }
.vs-ch-tab { flex: none; display: flex; align-items: stretch; border-right: 1px solid var(--vs-rule); color: var(--vs-ink); }
.vs-ch-tab:last-child { border-right: none; }
.vs-ch-tab.vs-on { background: var(--vs-surface); }
.vs-ch-tab:not(.vs-on):hover { background: color-mix(in oklab, var(--vs-surface) 60%, transparent); }
.vs-ch-tab.vs-ch-done:not(.vs-on) .vs-ch-pick { opacity: .55; }
.vs-ch-tab.vs-ch-dim { opacity: .35; }
.vs-ch-tab.vs-focus { outline-offset: -2px; }
.vs-ch-pick { font: inherit; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 8px 6px 8px 14px; background: transparent; color: inherit; border: none; cursor: pointer; text-align: left; }
.vs-ch-name { font-family: var(--vs-mono); font-size: 12.5px; font-weight: 600; }
.vs-ch-stat { font-family: var(--vs-mono); font-size: 11px; color: var(--vs-muted); white-space: nowrap; }
.vs-ch-panel { display: flex; flex-direction: column; gap: 12px; }
.vs-ch-frag { border: 1px solid var(--vs-rule); border-radius: var(--vs-r); overflow: hidden; scroll-margin-top: 80px; transition: opacity .15s; }
.vs-ch-frag.vs-ch-dim { opacity: .35; }
.vs-ch-frag.vs-focus { outline-offset: 2px; }
.vs-ch-head { font: inherit; width: 100%; display: grid; grid-template-columns: 96px 108px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 10px 14px; background: var(--vs-surface); border: none; color: var(--vs-ink); cursor: pointer; text-align: left; }
.vs-ch-head[aria-expanded="true"] { border-bottom: 1px solid var(--vs-rule); }
.vs-ch-range { font-family: var(--vs-mono); font-size: 13px; font-weight: 600; white-space: nowrap; }
.vs-ch-badge { font-family: var(--vs-mono); font-size: 11px; font-weight: 700; letter-spacing: .04em; padding: 2px 8px; border-radius: 4px; border: 1.5px solid; white-space: nowrap; justify-self: stretch; text-align: center; box-sizing: border-box; }
.vs-ch-read { background: var(--vs-accent-soft); color: var(--vs-accent-ink); border-color: color-mix(in oklab, var(--vs-accent) 55%, var(--vs-rule-strong)); }
.vs-ch-skim { background: transparent; color: var(--vs-ink); border-color: var(--vs-ink); }
.vs-ch-skip { background: transparent; color: var(--vs-muted); border-color: var(--vs-rule-strong); }
.vs-ch-title { font-size: 15px; font-weight: 600; line-height: 1.3; min-width: 0; }
.vs-ch-meta { display: flex; gap: 10px; align-items: baseline; font-family: var(--vs-mono); font-size: 12px; white-space: nowrap; }
.vs-ch-commit { color: var(--vs-muted); }
.vs-ch-chev { font-size: 13px; width: 12px; text-align: center; }
.vs-ch-desc { grid-column: 3 / 5; font-size: 13.5px; line-height: 1.45; color: var(--vs-muted); }
.vs-ch-fn { font-family: var(--vs-mono); font-size: 12px; }
.vs-ch-code { background: var(--vs-code-bg); font-family: var(--vs-mono); font-size: 12.5px; line-height: 1.7; overflow-x: auto; padding: 6px 0; }
.vs-ch-row { min-width: max-content; }
.vs-ch-line { display: flex; }
.vs-ch-num { width: 44px; flex: none; text-align: right; padding-right: 8px; color: var(--vs-muted); user-select: none; }
.vs-ch-num + .vs-ch-num { padding-right: 10px; }
.vs-ch-mark { width: 18px; flex: none; font-weight: 700; user-select: none; }
.vs-ch-text { white-space: pre; padding-right: 16px; }
.vs-ch-add { background: var(--vs-add-soft); }
.vs-ch-add .vs-ch-mark { color: var(--vs-add); }
.vs-ch-del { background: var(--vs-del-soft); }
.vs-ch-del .vs-ch-mark { color: var(--vs-del); }
.vs-ch-del .vs-ch-text { color: var(--vs-del); }
.vs-ch-gap .vs-ch-text { color: var(--vs-muted); }
.vs-ch-flag { font-family: var(--vs-font); font-size: 13px; color: var(--vs-muted); padding: 6px 14px; }
.vs-ch-card { margin: 6px 16px 10px 106px; max-width: 640px; padding: 10px 14px; background: var(--vs-bg); border: 1px solid var(--vs-rule-strong); border-radius: var(--vs-r); font-family: var(--vs-font); font-size: 14px; line-height: 1.45; display: flex; flex-direction: column; gap: 4px; white-space: normal; }
.vs-ch-card.vs-focus { outline-offset: 2px; }
.vs-ch-card-label { font-family: var(--vs-mono); font-size: 11px; font-weight: 600; color: var(--vs-accent-ink); }
.vs-ch-test-wrap { background: var(--vs-code-bg); padding: 0 0 12px; }
.vs-ch-test { margin-top: 0; gap: 8px; }
.vs-ch-test-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.vs-ch-test-head .vs-ch-card-label { color: var(--vs-add); flex: 1; }
.vs-ch-test-code { background: var(--vs-code-bg); border: 1px solid var(--vs-rule); border-radius: var(--vs-r); font-family: var(--vs-mono); font-size: 12px; line-height: 1.6; overflow-x: auto; padding: 6px 0; }
.vs-ch-test-code .vs-ch-num { width: 40px; padding-right: 12px; }
@media (max-width: 720px) {
  .vs-ch-head { grid-template-columns: auto auto minmax(0, 1fr); padding: 10px 12px; }
  .vs-ch-badge { justify-self: start; }
  .vs-ch-meta { grid-column: 3; grid-row: 1; justify-self: end; }
  .vs-ch-title { grid-column: 1 / -1; grid-row: 2; }
  .vs-ch-desc { grid-column: 1 / -1; grid-row: 3; }
  .vs-ch-num { width: 34px; padding-right: 6px; }
  .vs-ch-card { margin-left: 12px; margin-right: 12px; }
  .vs-ch-row > .vs-ch-card { position: sticky; left: 12px; max-width: calc(100vw - 80px); }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('vs-css-changes')) {
  const style = document.createElement('style');
  style.id = 'vs-css-changes';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CH_MARKS = { add: '+', del: '−', context: ' ' };

function chSpan(numbers) {
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return min === max ? String(min) : `${min}–${max}`;
}

function chRange(lines, ctx) {
  const added = lines.filter((l) => l.kind === 'add').map((l) => l.new);
  if (added.length) return chSpan(added);
  const removed = lines.filter((l) => l.kind === 'del').map((l) => l.old);
  return removed.length ? ctx.t('changes.was', { lines: chSpan(removed) }) : '';
}

function chFirst(fragment) {
  const lines = (fragment.diff && fragment.diff.lines) || [];
  const head = lines.find((l) => l.new !== undefined);
  if (head) return head.new;
  const base = lines.find((l) => l.old !== undefined);
  return base ? base.old : 0;
}

function chHighlight(texts, path) {
  const syntax = typeof verstat !== 'undefined' && verstat.syntax;
  return syntax ? syntax.highlight(texts, path) : texts.map((t) => [t]);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.files.length) return null;
  const layers = (ctx.page.blocks || []).filter((b) => b.type === 'changes' && b.files && b.files.length);
  if (ctx.kicker) ctx.kicker(ctx.t('changes.layerOf', { at: layers.indexOf(block) + 1, total: layers.length }));

  const read = ctx.read;
  const tabs = [];
  const panels = [];
  const cards = [];
  const where = new Map();
  let current = 0;

  function pick(index) {
    current = index;
    tabs.forEach((t, i) => t.classList.toggle('vs-on', i === index));
    panels.forEach((p, i) => { p.hidden = i !== index; });
  }

  function codeRows(fragment, path) {
    const diff = fragment.diff || { lines: [] };
    const real = diff.lines.filter((l) => l.kind !== 'gap');
    const colored = chHighlight(real.map((l) => l.text.replace(/\t/g, '    ')), path);
    const notes = (fragment.notes || []).map((note) => ({ note, placed: false }));
    const rows = [];
    let at = 0;
    for (const line of diff.lines) {
      if (line.kind === 'gap') {
        rows.push(el('div', { class: 'vs-ch-row vs-ch-gap' }, el('div', { class: 'vs-ch-line' }, [
          el('span', { class: 'vs-ch-num' }), el('span', { class: 'vs-ch-num' }), el('span', { class: 'vs-ch-mark' }), el('span', { class: 'vs-ch-text' }, '…'),
        ])));
        continue;
      }
      const nodes = colored[at++];
      const row = el('div', { class: 'vs-ch-row' }, el('div', { class: `vs-ch-line vs-ch-${line.kind}`, 'data-no-terms': true }, [
        el('span', { class: 'vs-ch-num' }, line.old === undefined ? '' : String(line.old)),
        el('span', { class: 'vs-ch-num' }, line.new === undefined ? '' : String(line.new)),
        el('span', { class: 'vs-ch-mark' }, CH_MARKS[line.kind]),
        el('span', { class: 'vs-ch-text' }, nodes && nodes.length ? nodes : ' '),
      ]));
      for (const n of notes) {
        if (n.placed || n.note.line === undefined) continue;
        const hit = n.note.side === 'base'
          ? line.kind !== 'add' && line.old === n.note.line
          : line.kind !== 'del' && line.new === n.note.line;
        if (!hit) continue;
        n.placed = true;
        row.appendChild(noteCard(n.note, line.kind === 'del' ? line.old : line.new));
      }
      rows.push(row);
    }
    for (const n of notes) if (!n.placed) rows.push(noteCard(n.note, n.note.line));
    if (diff.truncated) rows.push(el('p', { class: 'vs-ch-flag' }, ctx.plural(diff.truncated.total, 'changes.truncated', { shown: diff.truncated.shown })));
    return el('div', { class: 'vs-ch-code' }, rows);
  }

  function noteCard(note, line) {
    return ctx.part(el('div', { class: 'vs-ch-card' }, [
      el('span', { class: 'vs-ch-card-label' }, line !== undefined ? ctx.t('changes.agentNoteAt', { line }) : ctx.t('changes.agentNote')),
      el('span', {}, note.text),
      note.source ? el('div', { class: 'vs-chips' }, ctx.sourceChip(note.source)) : null,
    ]), note.id);
  }

  function testCard(test) {
    const a = test.anchor;
    const file = a && ctx.page.code ? ctx.page.code[`${a.repo}:${a.path}`] : null;
    let code = null;
    if (file && a.line !== undefined) {
      const from = a.line;
      const to = a.endLine !== undefined ? a.endLine : a.line;
      const texts = file.lines.slice(from - 1, to);
      const colored = chHighlight(texts, a.path);
      code = el('div', { class: 'vs-ch-test-code', 'data-no-terms': true }, texts.map((_, i) => el('div', { class: 'vs-ch-row' }, el('div', { class: 'vs-ch-line' }, [
        el('span', { class: 'vs-ch-num' }, String(from + i)),
        el('span', { class: 'vs-ch-text' }, colored[i] && colored[i].length ? colored[i] : ' '),
      ]))));
    }
    return el('div', { class: 'vs-ch-test-wrap' }, el('div', { class: 'vs-ch-card vs-ch-test' }, [
      el('div', { class: 'vs-ch-test-head' }, [
        el('span', { class: 'vs-ch-card-label' }, ctx.t('changes.fragmentTest')),
        ctx.anchorChip(a, test.name),
      ]),
      el('span', {}, test.description),
      code,
    ]));
  }

  function fragmentCard(fragment, file, fileIndex) {
    const diff = fragment.diff || { lines: [], additions: 0, deletions: 0 };
    let open = fragment.kind === 'read';
    let body = null;
    const chev = el('span', { class: 'vs-ch-chev', 'aria-hidden': 'true' }, open ? '−' : '+');
    const head = el('button', { type: 'button', class: 'vs-ch-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => toggle(!open) }, [
      el('span', { class: 'vs-ch-range' }, chRange(diff.lines, ctx)),
      el('span', { class: `vs-ch-badge vs-ch-${fragment.kind}` }, ctx.t(`changes.kind.${fragment.kind}`, null, fragment.kind)),
      el('span', { class: 'vs-ch-title' }, fragment.title),
      el('span', { class: 'vs-ch-meta' }, [
        fragment.commit ? el('span', { class: 'vs-ch-commit' }, fragment.commit.slice(0, 7)) : null,
        el('span', { class: 'vs-add' }, `+${diff.additions || 0}`),
        el('span', { class: 'vs-del' }, `−${diff.deletions || 0}`),
        chev,
      ]),
      el('span', { class: 'vs-ch-desc' }, [fragment.description, fragment.function ? el('span', { class: 'vs-ch-fn' }, ` · ${fragment.function}`) : null]),
    ]);
    function toggle(show) {
      open = show;
      if (show && !body) {
        body = el('div', { class: 'vs-ch-body' }, [codeRows(fragment, file.path), fragment.test ? testCard(fragment.test) : null]);
        card.appendChild(body);
        if (typeof verstat !== 'undefined' && verstat.glossary) verstat.glossary.highlight(body);
      }
      if (body) body.hidden = !show;
      head.setAttribute('aria-expanded', show ? 'true' : 'false');
      chev.textContent = show ? '−' : '+';
    }
    const card = ctx.part(el('div', { class: 'vs-ch-frag', id: `frag-${block.id}-${fragment.id}` }, head), fragment.id);
    toggle(open);
    cards.push({ fragment, file, card });
    const show = () => { pick(fileIndex); toggle(true); };
    where.set(fragment.id, show);
    for (const n of fragment.notes || []) {
      if (!n.id) continue;
      where.set(n.id, () => {
        show();
        const node = [...card.querySelectorAll('[data-part]')].find((x) => x.getAttribute('data-part') === n.id);
        if (node) node.classList.add('vs-focus');
      });
    }
    return card;
  }

  block.files.forEach((file, i) => {
    const diff = file.diff || {};
    const key = read ? read.key(block.repo, file.path) : null;
    const tab = ctx.part(el('div', { class: 'vs-ch-tab' }, [
      el('button', { type: 'button', class: 'vs-ch-pick', onclick: () => pick(i) }, [
        el('span', { class: 'vs-ch-name', 'data-no-terms': true }, file.path),
        el('span', { class: 'vs-ch-stat' }, `+${diff.additions || 0} −${diff.deletions || 0}`),
      ]),
    ]), file.id);
    if (read) tab.appendChild(read.box(key, (on) => tab.classList.toggle('vs-ch-done', on)));
    tabs.push(tab);
    where.set(file.id, () => pick(i));
    const fragments = (file.fragments || []).slice().sort((x, y) => chFirst(x) - chFirst(y));
    let content;
    if (diff.binary) content = [el('p', { class: 'vs-ch-flag' }, ctx.t('changes.binary'))];
    else if (diff.generated) content = [el('p', { class: 'vs-ch-flag' }, ctx.t('changes.generated'))];
    else if (!fragments.length) content = [el('p', { class: 'vs-ch-flag' }, ctx.t('changes.noLines'))];
    else content = fragments.map((fr) => fragmentCard(fr, file, i));
    panels.push(el('div', { class: 'vs-ch-panel' }, content));
  });

  const hint = el('p', { class: 'vs-ch-hint', hidden: true });
  let filterBy = null;
  ctx.on('commits:select', (detail) => {
    if (!detail || !detail.commit) {
      if (detail && filterBy !== null && detail.block !== filterBy) return;
      filterBy = null;
      cards.forEach(({ card }) => card.classList.remove('vs-ch-dim'));
      tabs.forEach((t) => t.classList.remove('vs-ch-dim'));
      hint.hidden = true;
      return;
    }
    filterBy = detail.block;
    const other = detail.repo && detail.repo !== block.repo && detail.repo !== block.base;
    const sha = detail.commit;
    const hitFiles = new Set();
    let hits = 0;
    cards.forEach(({ fragment, file, card }) => {
      const hit = !other && (fragment.commit
        ? sha.startsWith(fragment.commit) || fragment.commit.startsWith(sha)
        : (detail.files || []).includes(file.path));
      if (hit) {
        hits++;
        hitFiles.add(file.path);
      }
      card.classList.toggle('vs-ch-dim', !hit);
    });
    tabs.forEach((t, i) => t.classList.toggle('vs-ch-dim', !hitFiles.has(block.files[i].path)));
    hint.textContent = hits
      ? ctx.t('changes.filter', { sha: sha.slice(0, 7) })
      : ctx.t('changes.filterNone', { sha: sha.slice(0, 7) });
    hint.hidden = false;
  });

  ctx.onFocus((part) => {
    const go = where.get(part);
    if (go) go();
  });

  pick(current);
  return el('div', { class: 'vs-ch' }, [
    hint,
    el('div', { class: 'vs-ch-tabs', role: 'group', 'aria-label': ctx.t('changes.layerFiles') }, tabs),
    ...panels,
  ]);
}
