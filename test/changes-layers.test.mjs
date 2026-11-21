import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writeFiles, writePage } from './helpers.mjs';

const FIXTURES = join(ROOT, 'test', 'fixtures');

function layersRepo() {
  const dir = tempDir('verstat-layers-');
  const repos = join(FIXTURES, 'repos');
  cpSync(join(repos, 'checkout'), dir, { recursive: true });
  cpSync(join(repos, 'checkout-base'), dir, { recursive: true });
  git(dir, 'init', '-q');
  const base = commit(dir, 'base');
  cpSync(join(repos, 'checkout'), dir, { recursive: true });
  cpSync(join(repos, 'checkout-base', 'src', 'api', 'orders.js'), join(dir, 'src', 'api', 'orders.js'));
  cpSync(join(repos, 'checkout-tests'), dir, { recursive: true });
  const rules = commit(dir, 'refunds: shipped orders, 14-day window');
  cpSync(join(repos, 'checkout', 'src', 'api', 'orders.js'), join(dir, 'src', 'api', 'orders.js'));
  const head = commit(dir, 'api: charge and publish order.paid');
  return { dir, base, rules, head };
}

const repo = layersRepo();

function fixturePage() {
  const text = readFileSync(join(FIXTURES, 'pages', 'changes-layers.json'), 'utf8')
    .replaceAll('aaaaaaa', repo.rules)
    .replaceAll('bbbbbbb', repo.head);
  const page = JSON.parse(text);
  for (const [name, r] of Object.entries(page.repos)) {
    r.sha = name.endsWith('@base') ? repo.base : repo.head;
    r.path = repo.dir;
  }
  return page;
}

function layer(page, id) {
  return page.blocks.find((b) => b.id === id);
}

function fileOf(page, path) {
  for (const b of page.blocks) if (b.type === 'changes') for (const f of b.files) if (f.path === path) return f;
  return null;
}

function fragmentOf(page, id) {
  for (const b of page.blocks) if (b.type === 'changes') for (const f of b.files) for (const fr of f.fragments) if (fr.id === id) return fr;
  return null;
}

function validate(page) {
  return run(['validate', writePage(page)], { components: null });
}

function build(page) {
  const out = join(tempDir('verstat-build-'), 'page.html');
  const r = run(['build', writePage(page), '-o', out], { components: null });
  assert.equal(r.code, 0, r.stderr);
  const html = readFileSync(out, 'utf8');
  return { html, data: JSON.parse(html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s)[1]) };
}

function rejects(edit, pattern) {
  const page = fixturePage();
  edit(page);
  const r = validate(page);
  assert.equal(r.code, 1, `expected a failure for ${edit}`);
  assert.match(r.stderr, pattern);
}

describe('changes (layers)', () => {
  test('the fixture validates and builds: fragment lines from git, notes placed, test lines embedded', () => {
    const v = validate(fixturePage());
    assert.equal(v.code, 0, v.stderr);
    const { html, data } = build(fixturePage());
    const states = fileOf(data, 'src/orders/states.js');
    assert.deepEqual(states.diff, { status: 'modified', additions: 2, deletions: 2 });
    const reopen = fragmentOf(data, 'fr-reopen');
    assert.deepEqual(reopen.diff.lines.map((l) => l.kind), ['context', 'context', 'del', 'context']);
    assert.equal(reopen.diff.lines[2].old, 10);
    assert.deepEqual([reopen.diff.additions, reopen.diff.deletions], [0, 1]);
    assert.deepEqual(reopen.notes[0], { ...reopen.notes[0], line: 10, side: 'base' });
    const publish = fragmentOf(data, 'fr-publish');
    assert.deepEqual(publish.diff.lines.filter((l) => l.kind !== 'context').map((l) => l.old ?? l.new), [12, 12, 14]);
    const policy = fragmentOf(data, 'fr-policy');
    assert.equal(policy.diff.lines.filter((l) => l.kind === 'del').length, 5);
    assert.equal(policy.test.anchor.line, 13);
    assert.ok(data.code['checkout:test/refunds/policy.test.js']);
    assert.ok(!data.code['checkout:src/refunds/policy.js'], 'a fragment does not embed its whole file');
    assert.ok(html.includes('vs.read = { key'), 'the read progress module is on a page with layers');
  });

  test('a page without layers carries no read progress', () => {
    const page = fixturePage();
    page.blocks = page.blocks.filter((b) => b.type === 'brief');
    page.route = page.route.filter((s) => s.block === 'answer');
    page.repos = { checkout: page.repos.checkout };
    const { html } = build(page);
    assert.ok(!html.includes('vs.read = { key'));
  });

  test('a changed file on no layer fails, naming it', () => {
    rejects((p) => { layer(p, 'ch-api').files = []; }, /changed files of checkout@base\.\.checkout are on no layer: "src\/api\/orders\.js"/);
  });

  test('a file in two layers fails', () => {
    rejects((p) => {
      const copy = JSON.parse(JSON.stringify(fileOf(p, 'src/refunds/policy.js')));
      copy.id = 'f-policy-again';
      copy.fragments.forEach((f) => { f.id = `${f.id}-again`; f.notes = []; });
      layer(p, 'ch-api').files.push(copy);
    }, /"src\/refunds\/policy\.js" is already in the layer "ch-rules"/);
  });

  test('a note off the lines of its fragment fails', () => {
    rejects((p) => { fragmentOf(p, 'fr-charge').notes = [{ at: { find: "bus.publish('order.paid'" }, text: 'x' }]; }, /line 14 of checkout:src\/api\/orders\.js is not a line of this fragment/);
    rejects((p) => { fragmentOf(p, 'fr-refund').notes[0].at = { find: "['paid', 'reopen', 'pending'],", side: 'base' }; }, /line 10 of checkout@base:src\/orders\/states\.js is not a line of this fragment/);
  });

  test('a fragment test without an anchor, or on a whole file, fails', () => {
    rejects((p) => { delete fragmentOf(p, 'fr-refund').test.anchor; }, /fragments\[2\]\.test/);
    rejects((p) => {
      const t = fragmentOf(p, 'fr-refund').test;
      delete t.anchor.find;
      delete t.anchor.findEnd;
    }, /a fragment's test anchors the test itself/);
    rejects((p) => {
      const a = fragmentOf(p, 'fr-refund').test.anchor;
      a.find = [a.find, { find: a.findEnd, nth: 1 }];
      delete a.findEnd;
    }, /a fragment's test is one place/);
  });

  test('a changed line in no fragment fails; overlapping fragments fail; a fragment without a change fails', () => {
    rejects((p) => { fileOf(p, 'src/api/orders.js').fragments.pop(); }, /changed lines of "src\/api\/orders\.js" are in no fragment: −12, \+12, \+14/);
    rejects((p) => { fragmentOf(p, 'fr-charge').at = { find: 'const result', findEnd: "move(order, 'pay')" }; }, /changed line −12 of "src\/api\/orders\.js" is also in fragment "fr-charge"/);
    rejects((p) => { fragmentOf(p, 'fr-charge').at = { find: "if (!order) return" }; }, /the fragment covers no changed line/);
  });

  test('a file the diff does not change fails; so does an unknown commit', () => {
    rejects((p) => { layer(p, 'ch-api').files.push({ id: 'f-bus', path: 'src/events/bus.js', fragments: [] }); }, /"src\/events\/bus\.js" is not changed/);
    rejects((p) => { fragmentOf(p, 'fr-charge').commit = 'abcdef1'; }, /commit abcdef1 not found/);
  });

  test('tests are covered by test-coverage diff files or a fragment test, documentation by doc-changes', () => {
    const noTests = fixturePage();
    noTests.blocks = noTests.blocks.filter((b) => b.id !== 'tests');
    noTests.route = noTests.route.filter((s) => s.block !== 'tests');
    delete fragmentOf(noTests, 'fr-refund').test;
    const r = validate(noTests);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /on no layer: "test\/orders\/states\.test\.js"/);
    assert.doesNotMatch(r.stderr, /policy\.test\.js/, 'a fragment test covers its file');

    const doc = fixturePage();
    layer(doc, 'ch-api').files = [];
    doc.blocks.push({ id: 'docs', type: 'doc-changes', repo: 'checkout', files: [{ path: 'src/api/orders.js' }] });
    const counted = validate(doc);
    assert.doesNotMatch(counted.stderr, /on no layer/, 'a doc-changes file needs no layer');
  });

  test('test-coverage: explain mode needs behaviors; diff mode needs changed files and no behaviors', () => {
    rejects((p) => { layer(p, 'tests').behaviors = []; }, /leave "behaviors" out/);
    rejects((p) => { layer(p, 'tests').files.push({ path: 'src/events/bus.js' }); }, /"src\/events\/bus\.js" is not changed in checkout/);
    rejects((p) => { delete layer(p, 'tests').mode; }, /"behaviors" is required unless "mode" is "diff"/);
  });

  test('a cut fragment keeps the lines its notes sit on; a note past the cut still validates', () => {
    const dir = tempDir('verstat-big-');
    git(dir, 'init', '-q');
    writeFiles(dir, { 'x.js': 'export const x = 1;\n' });
    const base = commit(dir, 'base');
    const rows = Array.from({ length: 600 }, (_, i) => `rows.push(${i + 1});`);
    writeFiles(dir, { 'big.js': `export const rows = [];\n${rows.join('\n')}\n` });
    const head = commit(dir, 'head');
    const page = {
      schema: 'verstat.page/1', skill: 'explain-pr', question: 'What does the branch change?',
      repos: { t: { sha: head, path: dir }, 't@base': { sha: base, path: dir } },
      blocks: [{ id: 'big', type: 'changes', repo: 't', base: 't@base', files: [{ id: 'f', path: 'big.js', fragments: [
        { id: 'fr', kind: 'skip', title: 'Data', description: 'Generated lines.', notes: [{ id: 'n', at: { find: 'rows.push(590);' }, text: 'The last block.' }] },
      ] }] }],
      route: [{ block: 'big', minutes: 1, why: 'Data.', modes: ['full'] }],
    };
    const v = validate(page);
    assert.equal(v.code, 0, v.stderr);
    const { data } = build(page);
    const diff = data.blocks[0].files[0].fragments[0].diff;
    assert.equal(diff.truncated.total, 601);
    assert.ok(diff.lines.some((l) => l.new === 591), 'the noted line is shown');
    assert.equal(diff.lines.filter((l) => l.kind === 'gap').length, 1);

    const added = JSON.parse(JSON.stringify(page));
    added.blocks[0].files[0].fragments[0].at = { find: 'rows.push(1);', side: 'base' };
    const r = validate(added);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /does not exist at the base: the change adds it/);
  });

  test('moved-only and lock files may be left out; binary and lock files take no fragments; a foreign base sha and a hand-written diff fail', () => {
    const dir = tempDir('verstat-kinds-');
    git(dir, 'init', '-q');
    const moved = ['function sumPrices(items) {', '  const prices = items.map((item) => item.price);', '  const total = prices.reduce((a, b) => a + b, 0);', '  return Math.round(total * 100) / 100;', '}'];
    const app = Array.from({ length: 30 }, (_, i) => `const v${i + 1} = ${i + 1};`);
    writeFiles(dir, {
      'src/app.js': `${app.join('\n')}\n`,
      'src/a.js': `export const a = 1;\n\n${moved.join('\n')}\n`,
      'src/b.js': 'export const b = 2;\n',
      'package-lock.json': '{\n  "version": "1.0.0"\n}\n',
    });
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    const base = commit(dir, 'base');
    writeFiles(dir, {
      'src/app.js': `${app.map((l, i) => (i === 4 ? 'const v5 = 50;' : i === 24 ? 'const v25 = 250;' : l)).join('\n')}\n`,
      'src/a.js': 'export const a = 1;\n',
      'src/b.js': `export const b = 2;\n\n${moved.join('\n')}\n`,
      'package-lock.json': '{\n  "version": "1.1.0"\n}\n',
    });
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9, 9]));
    const head = commit(dir, 'head');
    const page = () => ({
      schema: 'verstat.page/1', skill: 'explain-pr', question: 'What does the branch change?',
      repos: { t: { sha: head, path: dir }, 't@base': { sha: base, path: dir } },
      blocks: [{ id: 'l', type: 'changes', repo: 't', base: 't@base', files: [
        { id: 'f-app', path: 'src/app.js', fragments: [
          { id: 'fr-5', kind: 'read', title: 'v5', description: 'v5 becomes 50.', at: { find: 'const v5 = 50;' } },
          { id: 'fr-25', kind: 'read', title: 'v25', description: 'v25 becomes 250.', at: { find: 'const v7 = 7;', findEnd: 'const v25 = 250;' } },
        ] },
        { id: 'f-logo', path: 'logo.png', fragments: [] },
      ] }],
      route: [{ block: 'l', minutes: 1, why: 'Code.', modes: ['full'] }],
    });
    const ok = validate(page());
    assert.equal(ok.code, 0, ok.stderr);
    const { data } = build(page());
    const far = data.blocks[0].files[0].fragments[1].diff.lines;
    assert.ok(far.every((l) => l.kind !== 'gap' && (l.new === undefined || l.new >= 22)), 'a hunk with no change in the bounds is not shown');
    assert.equal(data.blocks[0].files[1].diff.binary, true);

    const edits = [
      [(p) => { p.blocks[0].files[1].fragments.push({ id: 'x', kind: 'skip', title: 'x', description: 'x' }); }, /"logo\.png" is binary/],
      [(p) => { p.blocks[0].files.push({ id: 'f-lock', path: 'package-lock.json', fragments: [{ id: 'y', kind: 'skip', title: 'y', description: 'y' }] }); }, /a generated lock file/],
      [(p) => { p.blocks[0].files[0].diff = { status: 'modified' }; }, /files\[0\]/],
      [(p) => { p.blocks[0].files[0].fragments[0].diff = { lines: [] }; }, /fragments\[0\]/],
    ];
    for (const [edit, pattern] of edits) {
      const p = page();
      edit(p);
      const r = validate(p);
      assert.equal(r.code, 1, String(edit));
      assert.match(r.stderr, pattern);
    }
    const other = tempDir('verstat-other-');
    git(other, 'init', '-q');
    writeFiles(other, { 'x.txt': 'x\n' });
    const foreign = commit(other, 'other');
    const p = page();
    p.repos['t@base'] = { sha: foreign, path: other };
    const r = validate(p);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /base sha .* not found in the t checkout/);
  });

  test('the render opens only read fragments, puts notes under their lines and shows the layer number', () => {
    const { data } = build(fixturePage());
    const meta = JSON.parse(readFileSync(join(ROOT, 'components', 'changes', 'meta.json'), 'utf8'));
    let registered = null;
    runInNewContext(wrapRender('changes', readFileSync(join(ROOT, 'components', 'changes', 'render.js'), 'utf8'), meta), {
      verstat: { register: (name, fn) => { registered = fn; } },
    });
    const el = (tag, attrs = {}, children = []) => ({ tag, attrs, children: [].concat(children).filter((c) => c !== null && c !== undefined), hidden: !!attrs.hidden, classList: { toggle() {}, remove() {} }, appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; } });
    let kicker = null;
    const boxes = [];
    const ctx = {
      ...i18n(),
      page: data, el, part: (n) => n, on: () => {}, onFocus: () => {}, sourceChip: () => null,
      anchorChip: (a, label) => el('chip', {}, label), kicker: (t) => { kicker = t; },
      read: { key: (r, p) => `${r}/${p}`, box: (k) => { boxes.push(k); return el('box'); } },
    };
    const root = registered(layer(data, 'ch-rules'), ctx);
    assert.equal(kicker, 'layer 1 of 2');
    assert.deepEqual(boxes, ['checkout/src/orders/states.js', 'checkout/src/refunds/policy.js']);
    const text = (n) => (typeof n === 'string' ? n : (n.children || []).map(text).join(''));
    const find = (n, pred, out = []) => {
      if (n && typeof n === 'object') {
        if (pred(n)) out.push(n);
        (n.children || []).forEach((c) => find(c, pred, out));
      }
      return out;
    };
    const heads = find(root, (n) => n.attrs && n.attrs.class === 'vs-ch-head');
    assert.deepEqual(heads.map((h) => h.attrs['aria-expanded']), ['false', 'true', 'true', 'true']);
    assert.deepEqual(heads.map((h) => text(h.children[0])), ['6', 'was 10', '11', '5–9']);
    const rows = find(root, (n) => n.attrs && n.attrs.class === 'vs-ch-row' && n.children.length > 1);
    assert.ok(rows.some((r) => text(r).includes('AGENT NOTE · line 11')));
    assert.ok(rows.some((r) => text(r).includes('AGENT NOTE · line 10')));
    assert.ok(text(root).includes('TEST OF THIS FRAGMENT'));
    assert.ok(text(root).includes("test('a shipped order can be refunded'"));
  });

  test('test-coverage in diff mode counts the read and skim fragments', () => {
    const { data } = build(fixturePage());
    let registered = null;
    runInNewContext(wrapRender('test-coverage', readFileSync(join(ROOT, 'components', 'test-coverage', 'render.js'), 'utf8'), {}), {
      verstat: { register: (name, fn) => { registered = fn; } },
    });
    const el = (tag, attrs = {}, children = []) => ({ tag, attrs, children: [].concat(children).filter((c) => c !== null && c !== undefined) });
    const text = (n) => (typeof n === 'string' ? n : (n.children || []).map(text).join(''));
    const root = registered(layer(data, 'tests'), { page: data, el, part: (n) => n, anchorChip: (a, l) => el('chip', {}, l), sourceChip: () => null, isInferred: () => false, ...i18n() });
    const all = text(root);
    assert.ok(all.startsWith('2 of 5 fragments covered'), all.slice(0, 60));
    assert.ok(all.includes('the PR has no test that checks this change'));
    assert.ok(!all.includes('Trigger capture'), 'skip fragments are not counted');
    assert.ok(existsSync(join(ROOT, 'components', 'test-coverage', 'schema.json')));
  });
});
