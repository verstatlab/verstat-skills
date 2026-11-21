const MARK = { '+': '+', '-': '−', ' ': '' };

function tabName(path) {
  const name = path.split('/').pop();
  const adr = name.match(/^(\d{4})-/);
  return adr ? `ADR ${adr[1]}` : name;
}

function span(numbers) {
  if (!numbers.length) return '';
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function sameCommit(a, b) {
  return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
}

export default function (block, ctx) {
  const { el } = ctx;
  const files = block.files.filter((f) => f.diff);
  if (!files.length) return null;
  const md = window.verstat.markdown;
  let filter = null;
  const tabs = new Map();
  const cards = [];
  const opens = new Map();
  const views = new Map();

  function inline(text) {
    return md.inline(text || '').map((run) => {
      let node = run.code ? el('code', { class: 'vs-md-code' }, run.t) : document.createTextNode(run.t);
      if (run.i) node = el('em', {}, node);
      if (run.b) node = el('strong', {}, node);
      if (run.href) node = el('a', { href: run.href, target: '_blank', rel: 'noopener noreferrer' }, node);
      return node;
    });
  }

  function mark(sign) {
    return el('span', { class: `vs-md-mark vs-md-mark-${sign === '+' ? 'add' : 'del'}`, 'aria-hidden': 'true' }, MARK[sign]);
  }

  function signClass(sign) {
    return sign === '+' ? ' vs-md-add' : sign === '-' ? ' vs-md-del' : '';
  }

  function row(line, sign, body, extra) {
    return el('div', { class: `vs-md-row${extra || ''}` }, [
      el('span', { class: 'vs-md-ln' }, line === undefined ? '' : String(line)),
      el('span', { class: 'vs-md-sign' }, sign === ' ' ? '' : mark(sign)),
      body,
    ]);
  }

  function blockNode(item) {
    if (item.type === 'code') {
      return item.rows.map((r) => row(r.line, r.sign, el('div', { class: `vs-md-block vs-md-pre${signClass(r.sign)}`, 'data-no-terms': true }, r.text || ' ')));
    }
    if (item.type === 'table') {
      const cols = Math.max(...item.rows.map((r) => r.cells.length));
      const table = el('div', { class: 'vs-md-table', style: `grid-template-columns:repeat(${cols}, auto)` }, item.rows.flatMap((r) =>
        Array.from({ length: cols }, (_, c) => el('div', {
          class: `vs-md-cell${r.head ? ' vs-md-th' : ''}${signClass(r.sign)}`,
        }, [c === 0 && r.sign !== ' ' ? mark(r.sign) : null, ...inline(r.cells[c] || '')]))));
      const changed = item.rows.filter((r) => r.sign !== ' ');
      return [row(changed.length ? changed[0].line : item.start, ' ', el('div', { class: 'vs-md-block vs-md-tablewrap' }, table))];
    }
    const cls = `vs-md-block vs-md-${item.type}${signClass(item.sign)}${item.section ? ' vs-md-section' : ''}`;
    let body;
    if (item.type === 'hr') body = el('div', { class: cls }, el('hr'));
    else if (item.type === 'li' || item.type === 'oli') {
      body = el('div', { class: cls, style: item.depth ? `margin-left:${item.depth * 18}px` : null }, [
        el('span', { class: 'vs-md-bullet' }, item.type === 'li' ? '•' : `${item.num}.`),
        el('span', {}, inline(item.text)),
      ]);
    } else if (item.type === 'quote') {
      body = el('div', { class: cls }, [el('span', { class: 'vs-md-bullet' }, '›'), el('span', {}, inline(item.text))]);
    } else body = el('div', { class: cls }, inline(item.text));
    return [row(item.line, item.sign, body)];
  }

  function formatted(items) {
    return el('div', { class: 'vs-md' }, items.flatMap(blockNode));
  }

  function raw(hunk) {
    return el('div', { class: 'vs-md-raw', 'data-no-terms': true }, hunk.lines.map((l) => {
      const sign = l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ';
      return el('div', { class: `vs-md-rawline${signClass(sign)}` }, [
        el('span', { class: 'vs-md-ln' }, l.old === undefined ? '' : String(l.old)),
        el('span', { class: 'vs-md-ln' }, l.new === undefined ? '' : String(l.new)),
        el('span', { class: 'vs-md-sign' }, sign === ' ' ? '' : mark(sign)),
        el('span', { class: 'vs-md-rawtext' }, l.text),
      ]);
    }));
  }

  function hunkTitle(file, items) {
    if (!items) return tabName(file.path);
    const heading = items.find((i) => /^h[1-4]$/.test(i.type));
    return heading ? heading.text.replace(/[`*_]/g, '') : tabName(file.path);
  }

  function card(file, hunk, k) {
    const fragment = (file.fragments || []).find((fr) => fr.hunk === k) || null;
    const kind = fragment ? fragment.kind : 'skim';
    const added = hunk.lines.filter((l) => l.kind === 'add');
    const removed = hunk.lines.filter((l) => l.kind === 'del');
    const range = added.length ? span(added.map((l) => l.new)) : ctx.t('doc-changes.was', { lines: span(removed.map((l) => l.old)) });
    const canFormat = !file.diff.large && !!(file.diff.old || file.diff.new);
    const items = canFormat ? md.fragment(file.diff.old, file.diff.new, hunk.lines) : null;
    const shows = !!items && items.some((i) => i.sign !== ' ');
    let isRaw = !shows;
    const content = el('div', { class: 'vs-dc-content' });
    const fmtBtn = el('button', { type: 'button', class: 'vs-dc-view', onclick: () => show(false) }, ctx.t('doc-changes.formatted'));
    const rawBtn = el('button', { type: 'button', class: 'vs-dc-view', onclick: () => show(true) }, 'raw diff');
    function show(asRaw) {
      isRaw = asRaw;
      fmtBtn.setAttribute('aria-pressed', asRaw ? 'false' : 'true');
      rawBtn.setAttribute('aria-pressed', asRaw ? 'true' : 'false');
      content.replaceChildren(asRaw ? raw(hunk) : formatted(items));
    }
    const body = el('div', { class: 'vs-dc-body' }, [
      canFormat ? el('div', { class: 'vs-dc-views', role: 'group', 'aria-label': ctx.t('doc-changes.view') }, [fmtBtn, rawBtn]) : el('p', { class: 'vs-dc-notice' }, ctx.t('doc-changes.tooLarge')),
      content,
    ]);
    show(isRaw);
    const sign = el('span', { class: 'vs-dc-chev', 'aria-hidden': 'true' });
    const head = el('button', { type: 'button', class: 'vs-dc-head', 'aria-expanded': 'false', onclick: () => toggle(body.hidden) }, [
      el('span', { class: 'vs-dc-range' }, range),
      el('span', { class: `vs-dc-kind vs-dc-kind-${kind}` }, ctx.t(`doc-changes.kind.${kind}`, null, kind)),
      el('span', { class: 'vs-dc-title' }, [
        el('span', { class: 'vs-dc-name' }, fragment ? fragment.title : hunkTitle(file, items)),
        el('span', { class: 'vs-dc-desc' }, [
          fragment && fragment.summary ? `${fragment.summary} · ` : '',
          el('span', { class: 'vs-dc-file' }, file.path.split('/').pop()),
        ]),
      ]),
      el('span', { class: 'vs-dc-meta' }, [
        fragment && fragment.commit ? el('span', { class: 'vs-dc-commit' }, fragment.commit.slice(0, 7)) : null,
        el('span', { class: 'vs-add' }, `+${added.length}`),
        el('span', { class: 'vs-del' }, `−${removed.length}`),
        sign,
      ]),
    ]);
    function toggle(open) {
      body.hidden = !open;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      sign.textContent = open ? '−' : '+';
    }
    toggle(kind === 'read');
    const node = el('div', { class: 'vs-dc-card' }, [head, body]);
    cards.push({ node, file, fragment });
    if (fragment) {
      opens.set(fragment.id, () => {
        pick(file);
        toggle(true);
        node.classList.add('vs-focus');
        node.scrollIntoView({ block: 'nearest' });
      });
      return ctx.part(node, fragment.id);
    }
    return node;
  }

  const list = el('div', { class: 'vs-dc-list' });
  const summary = el('p', { class: 'vs-dc-summary' });
  function pick(file) {
    summary.textContent = file.summary || '';
    summary.hidden = !file.summary;
    tabs.forEach((tab, f) => tab.setAttribute('aria-pressed', f === file ? 'true' : 'false'));
    if (!views.has(file)) views.set(file, file.diff.hunks.map((h, k) => card(file, h, k)));
    list.replaceChildren(...views.get(file));
    apply();
  }

  function apply() {
    const matches = (file, fragment) => {
      if (!filter || !filter.commit) return true;
      if (filter.repo && filter.repo !== block.repo) return false;
      if (fragment && fragment.commit) return sameCommit(fragment.commit, filter.commit);
      return filter.files.includes(file.path);
    };
    cards.forEach((c) => c.node.classList.toggle('vs-dc-dim', !matches(c.file, c.fragment)));
    tabs.forEach((tab, f) => tab.classList.toggle('vs-dc-dim', !!(filter && filter.commit) && !matches(f, null)
      && !(f.fragments || []).some((fr) => fr.commit && matches(f, fr))));
  }

  const read = ctx.read;
  const tabBar = el('div', { class: 'vs-dc-tabs', role: 'group', 'aria-label': ctx.t('doc-changes.docs') }, files.map((file) => {
    const tab = el('button', { type: 'button', class: 'vs-dc-tab', title: file.path, onclick: () => pick(file) }, [
      el('span', { class: 'vs-dc-tabname' }, tabName(file.path)),
      el('span', { class: 'vs-dc-tabstat' }, `+${file.diff.additions} −${file.diff.deletions}`),
    ]);
    tabs.set(file, tab);
    const wrap = el('div', { class: 'vs-dc-tabwrap' }, tab);
    if (read) wrap.appendChild(read.box(read.key(block.repo, file.path), (on) => wrap.classList.toggle('vs-dc-done', on)));
    return ctx.part(wrap, file.id);
  }));

  ctx.on('commits:select', (detail) => {
    filter = detail && detail.commit ? detail : null;
    apply();
  });
  ctx.onFocus((part) => {
    if (opens.has(part)) return opens.get(part)();
    const file = files.find((f) => f.id === part);
    if (file) pick(file);
    else {
      const owner = files.find((f) => (f.fragments || []).some((fr) => fr.id === part));
      if (owner) {
        pick(owner);
        if (opens.has(part)) opens.get(part)();
      }
    }
  });

  const root = el('div', { class: 'vs-dc' }, [tabBar, summary, list]);
  pick(files[0]);
  return root;
}
