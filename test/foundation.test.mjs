import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writePage } from './helpers.mjs';

const TYPES = ['brief', 'glossary', 'route', 'open-questions', 'change-points', 'reviewer-focus', 'code-anchor'];
const COMPONENTS = join(ROOT, 'components');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function shopRepo() {
  const dir = tempDir('verstat-shop-');
  cpSync(join(FIXTURES, 'repos', 'shop'), dir, { recursive: true });
  git(dir, 'init', '-q');
  return { dir, sha: commit(dir, 'shop') };
}

const shop = shopRepo();

function fixturePage(name) {
  const page = JSON.parse(readFileSync(join(FIXTURES, 'pages', `${name}.json`), 'utf8'));
  for (const repo of Object.values(page.repos)) {
    repo.sha = shop.sha;
    repo.path = shop.dir;
  }
  return page;
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

describe('foundation blocks', () => {
  test('each type has schema, render and meta, and prints its schema', () => {
    for (const type of TYPES) {
      for (const file of ['schema.json', 'render.js', 'meta.json']) {
        assert.ok(existsSync(join(COMPONENTS, type, file)), `${type}/${file}`);
      }
      const r = run(['schema', type], { components: null });
      assert.equal(r.code, 0, `${type}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).properties.type.const, type);
      assert.equal(JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8')).group, 'foundation');
    }
  });

  test('the foundation page validates and builds with fonts, licences, counts and metas', () => {
    const page = fixturePage('foundation');
    assert.deepEqual([...new Set(page.blocks.map((b) => b.type))].sort(), [...TYPES].sort());
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.equal(v.stdout, 'ok\n');
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.equal((r.html.match(/@font-face\{/g) || []).length, 4);
    assert.match(r.html, /SIL Open Font License/);
    const data = embedded(r.html);
    assert.equal(data.validation.anchors, 17);
    assert.equal(data.validation.inferred, 3);
    for (const type of TYPES) {
      const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
      assert.ok(r.html.includes(`verstat.register(${JSON.stringify(type)}, `), `${type} registered`);
      assert.ok(r.html.includes(`})(), {"group":"foundation","label":${JSON.stringify(meta.label)}`), `${type} meta`);
    }
  });

  test('a page with one brief block stays under 165 KB', () => {
    const page = fixturePage('foundation');
    page.blocks = page.blocks.slice(0, 1);
    page.route = page.route.slice(0, 1);
    delete page.glossary;
    delete page.openQuestions;
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    const size = Buffer.byteLength(r.html);
    assert.ok(size <= 165 * 1024, `one-brief page is ${size} bytes`);
  });

  test('the diff fixture page validates and builds', () => {
    const r = build(fixturePage('diff'));
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.html.includes('{"group":"changes","label":"fixture-diff","diffMode":true}'));
    assert.equal(embedded(r.html).blocks[1].rows[3].anchor.repo, 'shop@base');
  });

  test('a part with an unknown change mark is rejected', () => {
    const page = fixturePage('diff');
    page.blocks[1].rows[0].change = 'moved';
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /\$\.blocks\[1\]\.rows\[0\]\.change/);
  });

  test('every render.js loads through wrapRender', () => {
    for (const type of TYPES) {
      const registered = loadRender(type);
      assert.equal(registered.name, type);
      assert.equal(typeof registered.fn, 'function');
    }
  });

  test('empty lists validate and render nothing', () => {
    const page = fixturePage('foundation');
    const byType = Object.fromEntries(page.blocks.map((b) => [b.type, b]));
    byType['change-points'].points = [];
    byType['reviewer-focus'].items = [];
    byType['code-anchor'].items = [];
    byType['open-questions'].items = [];
    page.route = page.route.filter((s) => !['cp', 'review', 'where'].includes(s.block));
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 0, r.stderr);

    const ctx = (p) => ({ ...i18n(), page: p, el: () => ({}), on: () => {}, part: (n) => n, isInferred: () => false });
    const bare = { ...page, glossary: [], route: [], openQuestions: [] };
    assert.equal(loadRender('change-points').fn(byType['change-points'], ctx(page)), null);
    assert.equal(loadRender('reviewer-focus').fn(byType['reviewer-focus'], ctx(page)), null);
    assert.equal(loadRender('code-anchor').fn(byType['code-anchor'], ctx(page)), null);
    assert.equal(loadRender('open-questions').fn(byType['open-questions'], ctx(bare)), null);
    assert.equal(loadRender('glossary').fn(byType.glossary, ctx(bare)), null);
    assert.equal(loadRender('route').fn(byType.route, ctx(bare)), null);
  });

  test('a brief without an answer is rejected', () => {
    const page = fixturePage('foundation');
    delete page.blocks[0].answer;
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /\$\.blocks\[0\]/);
  });

  test('Mermaid ids keep different names apart', () => {
    const window = {};
    runInNewContext(readFileSync(join(ROOT, 'client', 'mermaid.js'), 'utf8'), { window });
    const { id, label } = window.verstat.mermaid;
    const names = ['café', 'über', 'a-b', 'a b', 'a_b', '1st', 'n1st', '_x', 'n_x', 'paid'];
    const ids = names.map(id);
    assert.equal(new Set(ids).size, names.length);
    for (const i of ids) assert.match(i, /^[A-Za-z][A-Za-z0-9_]*$/);
    assert.equal(id('paid'), 'npaid');
    assert.equal(label('a: "b"; #c'), 'a#58; #34;b#34;#59; #35;c');
  });
});
