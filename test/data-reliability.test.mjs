import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writePage } from './helpers.mjs';

const GROUPS = {
  'data-model': 'data',
  'field-lineage': 'data',
  'crud-matrix': 'data',
  contract: 'data',
  'config-panel': 'data',
  'failure-modes': 'reliability',
  invariants: 'reliability',
  risks: 'reliability',
  'test-coverage': 'reliability',
};
const TYPES = Object.keys(GROUPS);
const COMPONENTS = join(ROOT, 'components');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function billingRepo() {
  const dir = tempDir('verstat-billing-');
  cpSync(join(FIXTURES, 'repos', 'billing'), dir, { recursive: true });
  git(dir, 'init', '-q');
  return { dir, sha: commit(dir, 'billing') };
}

const billing = billingRepo();

function fixturePage() {
  const page = JSON.parse(readFileSync(join(FIXTURES, 'pages', 'data-reliability.json'), 'utf8'));
  page.repos.billing.sha = billing.sha;
  page.repos.billing.path = billing.dir;
  return page;
}

function blockOf(page, type) {
  return page.blocks.find((b) => b.type === type);
}

function build(page) {
  const out = join(tempDir('verstat-build-'), 'page.html');
  const r = run(['build', writePage(page), '-o', out]);
  return { ...r, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
}

function embedded(html) {
  return JSON.parse(html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s)[1]);
}

function loadRender(type) {
  const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
  let registered = null;
  runInNewContext(wrapRender(type, readFileSync(join(COMPONENTS, type, 'render.js'), 'utf8'), meta), {
    verstat: { register: (name, fn, m) => { registered = { name, fn, meta: m }; } },
  });
  return registered;
}

class Node {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = {};
    this.listeners = {};
    this.children = [];
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') this.listeners[k.slice(2)] = v;
      else this.attrs[k] = String(v);
    }
    const node = this;
    this.classList = {
      contains: (c) => (node.attrs.class || '').split(' ').includes(c),
      toggle: (c, on) => {
        const set = new Set((node.attrs.class || '').split(' ').filter(Boolean));
        if (on) set.add(c);
        else set.delete(c);
        node.attrs.class = [...set].join(' ');
      },
    };
  }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  append(children) {
    for (const c of [].concat(children ?? [])) if (c !== null && c !== undefined && c !== false) this.children.push(c);
    return this;
  }

  replaceChildren(...children) {
    this.children = [];
    return this.append(children);
  }

  get text() {
    return this.children.map((c) => (c instanceof Node ? c.text : String(c))).join('');
  }

  all(pred) {
    const out = [];
    const walk = (n) => {
      if (!(n instanceof Node)) return;
      if (pred(n)) out.push(n);
      n.children.forEach(walk);
    };
    walk(this);
    return out;
  }

  byClass(c) { return this.all((n) => n.classList.contains(c)); }
}

function stubCtx(lang = 'en') {
  const focus = [];
  const ctx = {
    el: (tag, attrs, children) => new Node(tag, attrs).append(children),
    anchorChip: (anchor, label) => new Node('button', { class: 'vs-chip' }).append(label || `${anchor.path}:${anchor.line || 1}`),
    sourceChip: (source) => (source ? new Node('span', { class: 'vs-chip vs-source', 'data-source': source }).append(source === 'inferred' ? 'inferred' : source) : null),
    isInferred: (obj) => !!(obj && obj.source === 'inferred'),
    part: (node, id) => {
      if (id !== undefined && id !== null) node.setAttribute('data-part', id);
      return node;
    },
    onFocus: (fn) => focus.push(fn),
    focus: (id) => focus.forEach((fn) => fn(id)),
    ...i18n(lang),
  };
  return ctx;
}

describe('data and reliability blocks', () => {
  test('each type has schema, render and meta, and prints its schema', () => {
    for (const type of TYPES) {
      for (const file of ['schema.json', 'render.js', 'meta.json']) {
        assert.ok(existsSync(join(COMPONENTS, type, file)), `${type}/${file}`);
      }
      const r = run(['schema', type], { components: null });
      assert.equal(r.code, 0, `${type}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).properties.type.const, type);
      const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
      assert.equal(meta.group, GROUPS[type], type);
      assert.equal(typeof meta.label, 'string');
    }
  });

  test('the fixture page validates with one inferred invariant', () => {
    const page = fixturePage();
    assert.deepEqual([...new Set(page.blocks.map((b) => b.type))].sort(), [...TYPES].sort());
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines[0], 'ok');
    assert.equal(lines.length, 2, r.stdout);
    const at = page.blocks.findIndex((b) => b.type === 'invariants');
    assert.match(lines[1], new RegExp(`^inferred: \\$\\.blocks\\[${at}\\]\\.invariants\\[2\\] — `));
  });

  test('the fixture page builds with counts, metas and the inferred invariant embedded', () => {
    const page = fixturePage();
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    for (const type of TYPES) {
      const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
      assert.ok(r.html.includes(`verstat.register(${JSON.stringify(type)}, `), `${type} registered`);
      assert.ok(r.html.includes(`})(), {"group":${JSON.stringify(meta.group)},"label":${JSON.stringify(meta.label)},"diffMode":false}`), `${type} meta`);
    }
    const data = embedded(r.html);
    assert.equal(data.validation.anchors, 48);
    assert.equal(data.validation.inferred, 5);
    const inv = blockOf(data, 'invariants').invariants;
    assert.equal(inv[2].source, 'inferred');
    assert.equal(inv[0].source, 'code');
  });

  test('an invariant is inferred unless its check is on the anchored line', () => {
    const page = fixturePage();
    const at = page.blocks.findIndex((b) => b.type === 'invariants');
    const inv = page.blocks[at].invariants;
    delete inv[0].check;
    inv[2].check = "if (total < 0) throw new Error('negative total');";
    const r = run(['validate', writePage(page), '--json']);
    assert.equal(r.code, 0, r.stderr);
    const paths = JSON.parse(r.stdout).inferred.map((i) => i.path);
    assert.deepEqual(paths, [`$.blocks[${at}].invariants[0]`]);
  });

  test('schema rejections', () => {
    const cases = [
      ['invariant without an anchor', (p) => delete blockOf(p, 'invariants').invariants[0].anchor, /invariants\[0\]/],
      ['crud ops outside CRUD order', (p) => { blockOf(p, 'crud-matrix').stores[0].access[0].ops = 'X'; }, /access\[0\]\.ops/],
      ['crud ops empty', (p) => { blockOf(p, 'crud-matrix').stores[0].access[0].ops = ''; }, /access\[0\]\.ops/],
      ['failure mode without visible', (p) => delete blockOf(p, 'failure-modes').modes[0].visible, /modes\[0\]/],
      ['unknown property on a risk', (p) => { blockOf(p, 'risks').risks[0].colour = 'red'; }, /risks\[0\]/],
      ['risk without severity', (p) => delete blockOf(p, 'risks').risks[1].severity, /risks\[1\]/],
      ['unknown risk severity', (p) => { blockOf(p, 'risks').risks[0].severity = 'critical'; }, /risks\[0\]/],
      ['unknown relation kind', (p) => { blockOf(p, 'data-model').relations[0].kind = 'many'; }, /relations\[0\]\.kind/],
      ['unknown lineage kind', (p) => { blockOf(p, 'field-lineage').stages[0].kind = 'copied'; }, /stages\[0\]\.kind/],
    ];
    for (const [name, edit, where] of cases) {
      const page = fixturePage();
      edit(page);
      const r = run(['validate', writePage(page)]);
      assert.equal(r.code, 1, name);
      assert.match(r.stderr, where, name);
    }
  });

  test('every render.js loads through wrapRender without a document', () => {
    for (const type of TYPES) {
      const registered = loadRender(type);
      assert.equal(registered.name, type);
      assert.equal(typeof registered.fn, 'function');
    }
  });

  test('empty main lists validate and render nothing', () => {
    const page = fixturePage();
    const empty = {
      'data-model': (b) => { b.entities = []; delete b.relations; },
      'field-lineage': (b) => { b.stages = []; },
      'crud-matrix': (b) => { b.stores = []; },
      contract: (b) => { b.endpoints = []; },
      'config-panel': (b) => { b.params = []; },
      'failure-modes': (b) => { b.modes = []; },
      invariants: (b) => { b.invariants = []; },
      risks: (b) => { b.risks = []; },
      'test-coverage': (b) => { b.behaviors = []; },
    };
    for (const type of TYPES) empty[type](blockOf(page, type));
    page.route = [];
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 0, r.stderr);
    for (const type of TYPES) {
      assert.equal(loadRender(type).fn(blockOf(page, type), stubCtx()), null, type);
    }
    const crud = { ...blockOf(fixturePage(), 'crud-matrix'), actors: [] };
    assert.equal(loadRender('crud-matrix').fn(crud, stubCtx()), null, 'crud without actors');
  });

  test('every type renders the fixture block', () => {
    const page = fixturePage();
    for (const type of TYPES) {
      const out = loadRender(type).fn(blockOf(page, type), stubCtx());
      assert.ok(out instanceof Node, type);
    }
  });

  test('test coverage counts behaviours and says “not covered”', () => {
    const block = {
      id: 't',
      type: 'test-coverage',
      behaviors: [
        { id: 'a', behavior: 'covered', tests: [{ name: 'it works', anchor: { repo: 'r', path: 'a.test.js', find: 'x' } }] },
        { id: 'b', behavior: 'uncovered', tests: [], note: 'nobody wrote it' },
      ],
    };
    const out = loadRender('test-coverage').fn(block, stubCtx());
    assert.equal(out.byClass('vs-tc-sum')[0].text, '1 of 2 behaviors pinned by tests');
    const rows = out.byClass('vs-tc-row');
    assert.equal(rows[0].byClass('vs-state-ok')[0].text, 'covered');
    assert.equal(rows[0].byClass('vs-tc-none').length, 0);
    assert.equal(rows[0].byClass('vs-chip')[0].text, 'it works');
    assert.equal(rows[1].byClass('vs-state-problem')[0].text, 'not covered');
    assert.equal(rows[1].byClass('vs-tc-none').length, 0);
    assert.match(rows[1].text, /nobody wrote it/);
  });

  test('risks are sorted by severity, counted, and fold after six', () => {
    const ctx = stubCtx();
    const block = blockOf(fixturePage(), 'risks');
    const out = loadRender('risks').fn(block, ctx);
    const rows = out.byClass('vs-risk-row');
    assert.deepEqual(rows.map((r) => r.attrs['data-severity']), ['high', 'high', 'medium', 'medium', 'medium', 'low', 'low']);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.attrs['data-part']), ['rk-tx', 'rk-currency']);
    assert.equal(rows[0].byClass('vs-table-num')[0].text, '01');
    assert.equal(rows[0].byClass('vs-state-problem')[0].text, 'high');
    assert.equal(rows[2].byClass('vs-state-partial')[0].text, 'medium');
    assert.equal(rows[6].byClass('vs-state-minor')[0].text, 'low');
    assert.equal(out.byClass('vs-risk-sum')[0].text, '7 risks · 2 high · 3 medium · 2 low');
    const hidden = () => rows.filter((r) => r.classList.contains('vs-table-hidden')).map((r) => r.attrs['data-part']);
    assert.deepEqual(hidden(), ['rk-ttl-zero']);
    const more = out.byClass('vs-table-more')[0];
    assert.equal(more.text, 'show 1 more');
    more.listeners.click();
    assert.deepEqual(hidden(), []);
    assert.equal(more.text, 'collapse');
    more.listeners.click();
    assert.deepEqual(hidden(), ['rk-ttl-zero']);
    ctx.focus('rk-ttl-zero');
    assert.deepEqual(hidden(), []);
  });

  test('six risks or fewer have no fold button', () => {
    const block = blockOf(fixturePage(), 'risks');
    const out = loadRender('risks').fn({ ...block, risks: block.risks.slice(0, 3) }, stubCtx());
    assert.equal(out.byClass('vs-table-more').length, 0);
    assert.equal(out.byClass('vs-risk-sum')[0].text, '3 risks · 2 high · 1 medium');
  });

  test('claimed-vs-done labels each status with its state dot', () => {
    const anchor = { repo: 'r', path: 'a.js', find: 'x' };
    const block = {
      id: 'c',
      type: 'claimed-vs-done',
      claims: [
        { id: 'a', status: 'found', text: 'one', anchor },
        { id: 'b', status: 'partial', text: 'two', anchor },
        { id: 'c', status: 'missing', text: 'three' },
      ],
    };
    const rows = loadRender('claimed-vs-done').fn(block, stubCtx()).byClass('vs-cvd-row');
    assert.equal(rows[0].byClass('vs-state-ok')[0].text, 'confirmed');
    assert.equal(rows[1].byClass('vs-state-partial')[0].text, 'partly');
    assert.equal(rows[2].byClass('vs-state-problem')[0].text, 'not confirmed');
    assert.equal(rows[2].byClass('vs-chip').length, 0);
  });

  test('a decision-table conflict is a problem state under the outcome, not a filled row', () => {
    const ctx = { ...stubCtx(), diff: { mode: null, shows: () => true, value: (p, f) => p[f], mark: (n) => n } };
    const block = {
      id: 'd',
      type: 'decision-table',
      conditions: [{ id: 'x', label: 'X' }],
      rows: [
        { id: 'r1', when: { x: '*' }, outcome: 'yes' },
        { id: 'r2', when: { x: 'a' }, outcome: 'no' },
      ],
    };
    const rows = loadRender('decision-table').fn(block, ctx).byClass('vs-dt-row');
    assert.equal(rows[0].byClass('vs-state-problem')[0].text, 'conflicts with row 2');
    assert.equal(rows[1].byClass('vs-state-problem')[0].text, 'conflicts with row 1');
    assert.ok(rows.every((r) => !r.classList.contains('vs-dt-conflict')));
  });

  test('a decision-table code cell holds its pills only, in a content-sized column', () => {
    const ctx = { ...stubCtx(), diff: { mode: null, shows: () => true, value: (p, f) => p[f], mark: (n) => n } };
    const block = {
      id: 'd',
      type: 'decision-table',
      conditions: [{ id: 'x', label: 'X' }],
      rows: [{ id: 'r1', when: { x: 'a' }, outcome: 'yes', literal: 'if (!module?.register) {', anchor: { path: 'src/importMetaResolver.ts', line: 29 }, source: 'code' }],
    };
    const table = loadRender('decision-table').fn(block, ctx);
    const code = table.byClass('vs-dt-row')[0].byClass('vs-table-code')[0];
    assert.deepEqual(code.children.map((c) => c.attrs.class), ['vs-chips']);
    assert.ok(!code.text.includes('register'));
    assert.equal(code.byClass('vs-chip').length, 2);
    const grid = table.byClass('vs-table-grid')[0];
    assert.ok(grid.classList.contains('vs-table-fit'));
    const cols = /--vs-table-cols:([^;]+)/.exec(grid.attrs.style)[1];
    assert.match(cols, /max-content$/);
    assert.ok(!cols.includes('minmax(0'), cols);
    const css = readFileSync(join(ROOT, 'client', 'verstat.css'), 'utf8');
    assert.match(css, /\.vs-table-fit > \.vs-table-row \{[^}]*grid-template-columns: subgrid/);
    assert.match(css, /\.vs-table-fit \.vs-table-code \.vs-chip \{[^}]*white-space: nowrap/);
  });

  test('the risk summary declines each severity in the uk locale', () => {
    const risks = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, severity: 'high', title: 't', consequence: 'c' }));
    const sum = (n, lang) => loadRender('risks').fn({ id: 'rk', type: 'risks', risks: risks(n) }, stubCtx(lang)).byClass('vs-risk-sum')[0].text;
    assert.equal(sum(1, 'uk'), '1 ризик · 1 високий');
    assert.equal(sum(2, 'uk'), '2 ризики · 2 високі');
    assert.equal(sum(5, 'uk'), '5 ризиків · 5 високих');
    assert.equal(sum(1, 'en'), '1 risk · 1 high');
    assert.equal(sum(5, 'en'), '5 risks · 5 high');
  });

  test('the uk locale renders the Ukrainian UI strings', () => {
    const block = blockOf(fixturePage(), 'risks');
    const out = loadRender('risks').fn(block, stubCtx('uk'));
    assert.equal(out.byClass('vs-risk-sum')[0].text, '7 ризиків · 2 високі · 3 середні · 2 низькі');
    assert.equal(out.byClass('vs-risk-row')[0].byClass('vs-state-problem')[0].text, 'високий');
    assert.equal(out.byClass('vs-table-more')[0].text, 'показати ще 1');
    const tc = loadRender('test-coverage').fn({
      id: 't',
      type: 'test-coverage',
      behaviors: [{ id: 'a', behavior: 'x', tests: [] }],
    }, stubCtx('uk'));
    assert.equal(tc.byClass('vs-tc-sum')[0].text, '0 із 1 поведінки зафіксовані тестами');
    assert.equal(tc.byClass('vs-state-problem')[0].text, 'не покрито');
  });

  test('an inferred invariant is drawn as a deduction', () => {
    const anchor = { repo: 'r', path: 'a.js', find: 'x' };
    const block = {
      id: 'i',
      type: 'invariants',
      invariants: [
        { id: 'a', text: 'holds', check: 'x', anchor, source: 'code' },
        { id: 'b', text: 'maybe', anchor, source: 'inferred' },
      ],
    };
    const cards = loadRender('invariants').fn(block, stubCtx()).byClass('vs-inv-card');
    assert.equal(cards[0].classList.contains('vs-inferred'), false);
    assert.equal(cards[1].classList.contains('vs-inferred'), true);
    assert.equal(cards[1].all((n) => n.attrs['data-source'] === 'inferred').length, 1);
  });

  test('contract switches the endpoint on click and on route focus', () => {
    const ctx = stubCtx();
    const out = loadRender('contract').fn(blockOf(fixturePage(), 'contract'), ctx);
    const selected = () => out.byClass('vs-ct-on').map((n) => n.attrs['data-part']);
    const detailPath = () => out.byClass('vs-ct-detail')[0].byClass('vs-ct-path')[0].text;
    assert.deepEqual(selected(), ['ep-create']);
    assert.equal(detailPath(), '/invoices');
    out.byClass('vs-ct-ep')[1].listeners.click();
    assert.deepEqual(selected(), ['ep-get']);
    assert.equal(detailPath(), '/invoices/:id');
    ctx.focus('ep-pay');
    assert.deepEqual(selected(), ['ep-pay']);
    assert.match(out.byClass('vs-ct-detail')[0].text, /Idempotency-Key/);
  });

  test('crud matrix merges accesses of one actor and skips unknown actors', () => {
    const block = blockOf(fixturePage(), 'crud-matrix');
    block.stores[0].access.push({ actor: 'nobody', ops: 'D' });
    const out = loadRender('crud-matrix').fn(block, stubCtx());
    const row = out.all((n) => n.attrs['data-part'] === block.stores[0].id)[0];
    const cells = row.byClass('vs-crud-cell');
    assert.equal(cells.length, block.actors.length);
    assert.deepEqual(cells[0].byClass('vs-crud-op').map((n) => n.text), ['C', 'R']);
    assert.deepEqual(cells[1].byClass('vs-crud-op').map((n) => n.text), ['U', 'D']);
    assert.deepEqual(cells[1].byClass('vs-chip').map((n) => n.text), ['U · code', 'D · code']);
    assert.equal(cells[2].children.length, 0);
  });
});
