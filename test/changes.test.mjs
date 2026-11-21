import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { BIN, ROOT, commit, git, i18n, run, tempDir, writeFiles, writePage } from './helpers.mjs';

const TYPES = ['claimed-vs-done', 'commits', 'moved-code', 'noise', 'changes'];
const COMPONENTS = join(ROOT, 'components');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function shopRepo() {
  const dir = tempDir('verstat-shop-');
  cpSync(join(FIXTURES, 'repos', 'shop'), dir, { recursive: true });
  git(dir, 'init', '-q');
  return { dir, sha: commit(dir, 'shop') };
}

const shop = shopRepo();

function fixturePage() {
  const page = JSON.parse(readFileSync(join(FIXTURES, 'pages', 'changes.json'), 'utf8'));
  for (const repo of Object.values(page.repos)) {
    repo.sha = shop.sha;
    repo.path = shop.dir;
  }
  return page;
}

function blockOf(page, type) {
  return page.blocks.find((b) => b.type === type);
}

function loadRender(type) {
  const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
  let registered = null;
  runInNewContext(wrapRender(type, readFileSync(join(COMPONENTS, type, 'render.js'), 'utf8'), meta), {
    verstat: { register: (name, fn, m) => { registered = { name, fn, meta: m }; } },
  });
  return registered;
}

function facts(range, dir) {
  const r = run(['facts', 'diff', range, '--dir', dir], { components: null });
  return { ...r, json: r.code === 0 ? JSON.parse(r.stdout) : null };
}

const TOTALS = Array.from({ length: 20 }, (_, i) => (i === 0
  ? 'function calculateTotals(items, rate) {'
  : i === 19 ? '}' : `  const step${i} = items.length * rate + ${i};`));

const A_BASE = [
  "import { readFile } from 'node:fs';",
  "import { join } from 'node:path';",
  '',
  ...TOTALS,
  '',
  'function check(x) {',
  'if (x > 1) {',
  'console.log("big");',
  'console.log("bigger");',
  'console.log("biggest");',
  'return x;',
  '}',
  'return 0;',
  '}',
  '',
  'export { check };',
];

const A_HEAD = [
  "import { readFile } from 'node:fs';",
  "import { resolve } from 'node:path';",
  '',
  'function check(x) {',
  '  if (x > 1) {',
  '    console.log("big");',
  '    console.log("bigger");',
  '    console.log("biggest");',
  '    return x;',
  '  }',
  'return 0;',
  '}',
  '',
  '',
  '',
  'export { check };',
];

const B_BASE = ['export const name = "b";', ''];
const B_HEAD = ['export const name = "b";', '', 'export const math = {', ...TOTALS.map((l) => `  ${l}`), '};'];

function lines(list) {
  return `${list.join('\n')}\n`;
}

function diffRepo() {
  const dir = tempDir('verstat-facts-');
  git(dir, 'init', '-q');
  writeFiles(dir, {
    'a.js': lines(A_BASE),
    'b.js': lines(B_BASE),
    'main.go': lines(['package main', '', 'import (', '\t"fmt"', '\t"os"', ')', '', 'func main() {', '\tfmt.Println(os.Args)', '}']),
    'package-lock.json': lines(['{', '  "name": "x",', '  "version": "1.0.0",', '  "lockfileVersion": 3', '}']),
    'util.js': lines(['export function greet(name) {', '  return `Hello, ${name}`;', '}']),
  });
  const base = commit(dir, 'base');
  writeFiles(dir, { 'a.js': lines([...A_BASE.slice(0, 3), ...A_BASE.slice(24)]), 'b.js': lines(B_HEAD) });
  const moved = commit(dir, 'move totals');
  writeFiles(dir, {
    'a.js': lines(A_HEAD),
    'main.go': lines(['package main', '', 'import (', '\t"fmt"', '\t"strings"', ')', '', 'func main() {', '\tfmt.Println(os.Args)', '}']),
    'package-lock.json': lines(['{', '  "name": "x",', '  "version": "1.1.0",', '  "lockfileVersion": 3', '}']),
    'util.js': lines(['export function greet(name) {', '  return `Hi there, ${name}`;', '}']),
  });
  const head = commit(dir, 'tidy');
  return { dir, base, moved, head };
}

const repo = diffRepo();

describe('changes blocks', () => {
  test('each type has schema, render and meta in the changes group, and prints its schema', () => {
    for (const type of TYPES) {
      for (const file of ['schema.json', 'render.js', 'meta.json']) {
        assert.ok(existsSync(join(COMPONENTS, type, file)), `${type}/${file}`);
      }
      const r = run(['schema', type], { components: null });
      assert.equal(r.code, 0, `${type}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).properties.type.const, type);
      assert.equal(JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8')).group, 'changes');
    }
  });

  test('the changes page validates and builds with every type registered', () => {
    const page = fixturePage();
    for (const type of TYPES) assert.ok(blockOf(page, type), type);
    const v = run(['validate', writePage(page)], { components: null });
    assert.equal(v.code, 0, v.stderr);
    const out = join(tempDir('verstat-build-'), 'page.html');
    const r = run(['build', writePage(page), '-o', out], { components: null });
    assert.equal(r.code, 0, r.stderr);
    const html = readFileSync(out, 'utf8');
    for (const type of TYPES) {
      const meta = JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
      assert.ok(html.includes(`verstat.register(${JSON.stringify(type)}, `), `${type} registered`);
      assert.ok(html.includes(`})(), {"group":"changes","label":${JSON.stringify(meta.label)}`), `${type} meta`);
    }
    assert.match(html, /\.vs-ch-frag/);
    const data = JSON.parse(html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s)[1]);
    assert.equal(data.validation.anchors, 4);
    assert.equal(data.validation.inferred, 1);
  });

  test('a found or partial claim needs an anchor, a missing one does not', () => {
    for (const [status, code] of [['found', 1], ['partial', 1], ['missing', 0]]) {
      const page = fixturePage();
      const claims = blockOf(page, 'claimed-vs-done').claims;
      claims[0].status = status;
      delete claims[0].anchor;
      const r = run(['validate', writePage(page)], { components: null });
      assert.equal(r.code, code, `${status}: ${r.stderr}`);
      if (code) assert.match(r.stderr, /\$\.blocks\[1\]\.claims\[0\]/);
    }
  });

  test('a bad sha, status or noise kind is rejected', () => {
    const edits = [
      (p) => { blockOf(p, 'commits').commits[0].sha = 'xyz1234'; },
      (p) => { blockOf(p, 'commits').commits[0].sha = 'abcdef'; },
      (p) => { blockOf(p, 'claimed-vs-done').claims[0].status = 'done'; },
      (p) => { blockOf(p, 'noise').items[0].kind = 'misc'; },
      (p) => { blockOf(p, 'changes').files.push({ id: 'f1', path: 'x.js' }); },
      (p) => { blockOf(p, 'moved-code').items[0].extra = 1; },
    ];
    for (const edit of edits) {
      const page = fixturePage();
      edit(page);
      assert.equal(run(['validate', writePage(page)], { components: null }).code, 1, String(edit));
    }
  });

  test('a SHA-256 commit sha is accepted', () => {
    const page = fixturePage();
    blockOf(page, 'commits').commits[0].sha = 'a'.repeat(64);
    const r = run(['validate', writePage(page)], { components: null });
    assert.equal(r.code, 0, r.stderr);
  });

  test('every render loads through wrapRender and renders nothing for an empty list', () => {
    const page = fixturePage();
    const ctx = { ...i18n(), page, el: () => ({}), on: () => {}, onFocus: () => {}, part: (n) => n, isInferred: () => false };
    const empty = {
      'claimed-vs-done': { claims: [] },
      commits: { commits: [] },
      'moved-code': { items: [] },
      noise: { items: [] },
      changes: { files: [] },
    };
    for (const type of TYPES) {
      const registered = loadRender(type);
      assert.equal(registered.name, type);
      assert.equal(registered.fn({ ...blockOf(page, type), ...empty[type] }, ctx), null, type);
    }
    for (const [type, list] of Object.entries(empty)) Object.assign(blockOf(page, type), list);
    page.route = page.route.filter((s) => !['claims', 'commits', 'notes', 'moved', 'noise'].includes(s.block));
    assert.equal(run(['validate', writePage(page)], { components: null }).code, 0);
  });
});

describe('verstat facts diff', () => {
  const { json } = facts(`${repo.base}..${repo.head}`, repo.dir);

  test('lists files and commits with their counts', () => {
    assert.equal(json.base, repo.base);
    assert.equal(json.head, repo.head);
    assert.deepEqual(json.files.map((f) => f.path), ['a.js', 'b.js', 'main.go', 'package-lock.json', 'util.js']);
    for (const f of json.files) {
      const [add, del] = git(repo.dir, 'diff', '--numstat', repo.base, repo.head, '--', f.path).split('\t');
      assert.deepEqual([f.status, f.additions, f.deletions], ['modified', Number(add), Number(del)], f.path);
    }
    assert.deepEqual(json.commits.map((c) => [c.sha, c.subject]), [[repo.moved, 'move totals'], [repo.head, 'tidy']]);
    assert.deepEqual(json.commits[0].files, ['a.js', 'b.js']);
    assert.deepEqual(json.commits[1].files, ['a.js', 'main.go', 'package-lock.json', 'util.js']);
    assert.equal(json.commits[0].additions, 22);
    assert.equal(json.commits[0].deletions, 21);
  });

  test('finds the moved function once, with both spans, across re-indentation', () => {
    assert.equal(json.moved.length, 1);
    const [m] = json.moved;
    assert.deepEqual(m.from, { path: 'a.js', start: 4, end: 23 });
    assert.deepEqual(m.to, { path: 'b.js', start: 4, end: 23 });
    assert.equal(m.lines, 20);
    assert.equal(m.title, 'function calculateTotals(items, rate) {');
    assert.equal(m.body.split('\n')[0], '  function calculateTotals(items, rate) {');
  });

  test('sorts imports, whitespace and generated files into noise, and leaves the real edit out', () => {
    const byKind = Object.fromEntries(json.noise.map((n) => [n.kind, n]));
    assert.deepEqual(Object.keys(byKind), ['imports', 'whitespace', 'generated']);
    assert.deepEqual(byKind.imports.paths, ['a.js', 'main.go']);
    assert.equal(byKind.imports.lines, 4);
    assert.match(byKind.imports.body, /^- \t"os"$/m);
    assert.match(byKind.imports.body, /^\+ \t"strings"$/m);
    assert.deepEqual(byKind.whitespace.paths, ['a.js']);
    assert.equal(byKind.whitespace.lines, 14);
    assert.deepEqual(byKind.generated.paths, ['package-lock.json']);
    assert.equal(byKind.generated.lines, 2);
    assert.equal(byKind.imports.title, 'Imports');
    const all = json.noise.map((n) => n.body).join('\n');
    assert.doesNotMatch(all, /greet|Hi there|calculateTotals|step\d/);
    assert.deepEqual(json.totals, { additions: 34, deletions: 31, moved: 20, noise: 20 });
  });

  test('a three-dot range uses the merge base', () => {
    const r = facts(`${repo.base}...${repo.head}`, repo.dir);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.base, repo.base);
    assert.deepEqual(r.json.moved, json.moved);
  });

  test('reads the current directory without --dir and changes nothing', () => {
    const r = run(['facts', 'diff', `${repo.base}..${repo.head}`], { components: null, cwd: repo.dir });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).moved, json.moved);
    assert.equal(git(repo.dir, 'status', '--porcelain'), '');
  });

  test('a rename is one moved item; two moved lines or a three-line file are not', () => {
    git(repo.dir, 'mv', 'main.go', 'cmd.go');
    git(repo.dir, 'mv', 'util.js', 'helpers.js');
    writeFiles(repo.dir, {
      'a.js': lines(A_HEAD.filter((l) => !l.includes('"big"') && !l.includes('"bigger"'))),
      'b.js': lines([...B_HEAD, '    console.log("big");', '    console.log("bigger");']),
    });
    const renamed = commit(repo.dir, 'rename');
    const r = facts(`${repo.head}..${renamed}`, repo.dir);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json.files.map((f) => [f.path, f.status]), [
      ['a.js', 'modified'], ['b.js', 'modified'], ['cmd.go', 'added'], ['helpers.js', 'added'], ['main.go', 'deleted'], ['util.js', 'deleted'],
    ]);
    assert.equal(r.json.moved.length, 1);
    assert.deepEqual([r.json.moved[0].from.path, r.json.moved[0].to.path, r.json.moved[0].lines], ['main.go', 'cmd.go', 10]);
  });

  test('odd file names keep their path, and whitespace that changes meaning is not noise', () => {
    const dir = tempDir('verstat-facts-odd-');
    git(dir, 'init', '-q');
    writeFiles(dir, {
      'my file.js': lines(["import a from 'a';", 'run(a);', "import('./one').then(go);"]),
      'q"a.txt': lines(['one']),
      'job.py': lines(['def job(x):', '    if x:', '        a()', '    c()']),
      'str.js': lines(['const s = "a b";', 'const t = "Hello  world";', 'const u = x;   ']),
      'wrap.ts': lines(["import { x } from './x';", 'use(x);']),
      'wrap.py': lines(['from m import a', 'run(a)']),
      'swap.js': lines(['if (a) {', 'x = 1;', 'y = 2;', '}', "export const msg = 'from cache';", "export { a } from './a';"]),
      'q.go': lines(['package q', '', 'import (', '\t"fmt"', ')', '', 'var s = "a" +', '\t"b"']),
      'm.php': lines(['<?php', 'use App\\One;', '', 'class M {', '    use SoftDeletes;', '}']),
    });
    const base = commit(dir, 'base');
    writeFiles(dir, {
      'my file.js': lines(["import b from 'b';", 'run(a);', "import('./two').then(go);"]),
      'q"a.txt': lines(['two']),
      'job.py': lines(['def job(x):', '    if x:', '        a()', '        c()']),
      'str.js': lines(['const s = "ab";', 'const t = "Hello world";', 'const u = x;']),
      'wrap.ts': lines(['import {  // see {docs}', '  x, // (old)', '  yyyyyy,', '  zzzzzz,', "} from './x';", 'use(x);', 'export {', '  x,', '};', 'function wipe() {', '  deleteEverything();', '}']),
      'wrap.py': lines(['from m import (  # keep (legacy)', '    a,  # keep (legacy)', '    b,', ')', 'run(a)']),
      'swap.js': lines(['if (b) {', '  y = 2;', '  x = 1;', '}', "export const msg = 'from disk';", "export { b } from './b';"]),
      'q.go': lines(['package q', '', 'import (', '\t"fmt"', '\t"strings"', ')', '', 'var s = "a" +', '\t"DROP"']),
      'm.php': lines(['<?php', 'use App\\Two;', '', 'class M {', '    use Notifiable;', '}']),
    });
    const head = commit(dir, 'head');
    const r = facts(`${base}..${head}`, dir);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json.commits[0].files, r.json.files.map((f) => f.path));
    assert.ok(r.json.commits[0].files.includes('q"a.txt'));
    const byKind = Object.fromEntries(r.json.noise.map((n) => [n.kind, n]));
    assert.deepEqual(byKind.imports.paths, ['m.php', 'my file.js', 'q.go', 'swap.js', 'wrap.py', 'wrap.ts']);
    for (const member of ['  yyyyyy,', "} from './x';", '    b,', ')']) assert.ok(byKind.imports.body.split('\n').includes(`+ ${member}`), member);
    assert.doesNotMatch(byKind.imports.body, /use\(x\)|run\(a\)|^\+ export \{$|wipe|deleteEverything/m);
    assert.match(byKind.imports.body, /^\+ export \{ b \} from '.\/b';$/m);
    assert.doesNotMatch(byKind.imports.body, /msg/);
    assert.equal(byKind.whitespace.body.split('\n').filter((l) => /^[-+] +[xy] =/.test(l)).length, 2);
    assert.match(byKind.imports.body, /^\+ \t"strings"$/m);
    assert.match(byKind.imports.body, /^\+ use App\\Two;$/m);
    assert.doesNotMatch(byKind.imports.body, /DROP|"b"|SoftDeletes|Notifiable|import\('/);
    assert.deepEqual(byKind.whitespace.paths, ['str.js', 'swap.js']);
    assert.equal(byKind.whitespace.lines, 4);
    assert.doesNotMatch(byKind.whitespace.body, /c\(\)|"ab"|Hello/);
  });

  test('a signature line from log.showSignature is not a commit', () => {
    const r = spawnSync(process.execPath, [BIN, 'facts', 'diff', `${repo.base}..${repo.head}`, '--dir', repo.dir], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'log.showSignature', GIT_CONFIG_VALUE_0: 'true' },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).commits.map((c) => c.subject), ['move totals', 'tidy']);
  });

  test('diff settings in the checkout do not change the line numbers', () => {
    const dir = tempDir('verstat-facts-config-');
    git(dir, 'init', '-q');
    const body = ['function f() {', '  one();', '  two();', '}'];
    const tail = ['x1();', 'x2();', 'x3();', 'x4();', 'x5();', 'x6();'];
    writeFiles(dir, { 'sub/x.js': lines(['a();', 'b();', 'c();', 'd();', 'e();', 'f();', 'g();', 'h();', 'i();', '', ...body, ...tail]), 'top.txt': lines(['top']) });
    const base = commit(dir, 'base');
    writeFiles(dir, { 'sub/x.js': lines(['a();', 'b();', 'c();', 'd();', 'e();', 'f();', 'g();', 'h();', 'I();', '', ...tail, ...body]), 'top.txt': lines(['TOP']) });
    const head = commit(dir, 'move');
    git(dir, 'config', 'diff.interHunkContext', '5');
    git(dir, 'config', 'diff.relative', 'true');
    const r = facts(`${base}..${head}`, join(dir, 'sub'));
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json.files.map((f) => f.path), ['sub/x.js', 'top.txt']);
    assert.equal(r.json.moved.length, 1);
    assert.deepEqual([r.json.moved[0].from.start, r.json.moved[0].from.end], [11, 14]);
  });

  test('a large rename is one moved item and stays fast', () => {
    const dir = tempDir('verstat-facts-big-');
    git(dir, 'init', '-q');
    const big = Array.from({ length: 6000 }, (_, i) => (i % 10 === 9 ? '}' : `  value${i} = compute(${i});`));
    writeFiles(dir, { 'big.js': lines(big), 'a😀"q.txt': lines(['one']) });
    const base = commit(dir, 'base');
    git(dir, 'mv', 'big.js', 'moved.js');
    writeFiles(dir, { 'a😀"q.txt': lines(['two']) });
    const head = commit(dir, 'rename');
    const started = Date.now();
    const r = facts(`${base}..${head}`, dir);
    const took = Date.now() - started;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.moved.length, 1);
    assert.equal(r.json.moved[0].lines, 6000);
    assert.ok(took < 5000, `facts diff took ${took} ms`);
    assert.ok(r.json.commits[0].files.includes('a😀"q.txt'), JSON.stringify(r.json.commits[0].files));
  });

  test('a renamed folder of many files is one moved item per file and stays fast', () => {
    const dir = tempDir('verstat-facts-folder-');
    git(dir, 'init', '-q');
    const files = {};
    for (let f = 0; f < 60; f++) {
      files[`old/f${f}.js`] = lines(Array.from({ length: 400 }, (_, i) => (i % 7 === 6 ? '}' : i % 11 === 10 ? '' : `  item${f}_${i} = make(${i});`)));
    }
    writeFiles(dir, files);
    const base = commit(dir, 'base');
    git(dir, 'mv', 'old', 'new');
    const head = commit(dir, 'rename folder');
    const started = Date.now();
    const r = facts(`${base}..${head}`, dir);
    const took = Date.now() - started;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.moved.length, 60);
    assert.ok(r.json.moved.every((m) => m.from.path.replace('old/', 'new/') === m.to.path && m.lines >= 399), JSON.stringify(r.json.moved.slice(0, 2)));
    assert.ok(took < 5000, `facts diff took ${took} ms`);
  });

  test('short tails and closers moved between files are not moves', () => {
    const dir = tempDir('verstat-facts-tail-');
    git(dir, 'init', '-q');
    writeFiles(dir, {
      'a.js': lines(['function a(x) {', '  try {', '    return load(x);', '  } catch (err) {', '    return null;', '  }', '}']),
      'b.js': lines(['function b(y) {', '  return save(y);', '}']),
      'm.m': lines(['#import "Foo.h"', 'int main() {}']),
      'a.test.js': lines(["describe('a', () => {", "  describe('b', () => {", "    it('c', () => {", '      expect(1).toBe(1);', '    });', '  });', '});']),
      'b.test.js': lines(['// b']),
      'a.rb': lines(['module A', '  class B', '    def c', '      run', '    end', '  end', 'end']),
      'b.rb': lines(['# b']),
      'n.md': lines(['- one', '- two', '', 'para one', '', 'para two']),
    });
    const base = commit(dir, 'base');
    writeFiles(dir, {
      'a.js': lines(['function a(x) {', '  return load(x);', '}']),
      'b.js': lines(['function b(y) {', '  try {', '    return save(y);', '  } catch (err) {', '    return null;', '  }', '}']),
      'm.m': lines(['#import "Foo.h"', '#import "Bar.h"', '@import Baz;', 'int main() {}']),
      'a.test.js': lines(['// a']),
      'b.test.js': lines(['// b', "describe('x', () => {", "  describe('y', () => {", "    it('z', () => {", '      expect(2).toBe(2);', '    });', '  });', '});']),
      'a.rb': lines(['# a']),
      'b.rb': lines(['# b', 'module X', '  class Y', '    def z', '      stop', '    end', '  end', 'end']),
      'n.md': lines(['- one', '  - two', '', 'para one', 'para two']),
    });
    const head = commit(dir, 'swap');
    const r = facts(`${base}..${head}`, dir);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json.moved, []);
    assert.deepEqual(r.json.noise.find((n) => n.kind === 'whitespace').paths, ['a.js', 'b.js']);
    const imports = r.json.noise.find((n) => n.kind === 'imports');
    assert.deepEqual(imports.paths, ['m.m']);
    assert.equal(imports.lines, 2);
  });

  test('a move that starts on a very common line is still found', () => {
    const dir = tempDir('verstat-facts-common-');
    git(dir, 'init', '-q');
    const moved = ['  done();', '  alpha_one();', '  alpha_two();', '  alpha_three();', '  alpha_four();'];
    writeFiles(dir, {
      'third.js': lines(Array.from({ length: 55 }, () => '  done();')),
      'old.js': lines(['function a() {', '  start();', ...moved, '}']),
      'new.js': lines(['// new']),
    });
    const base = commit(dir, 'base');
    git(dir, 'rm', '-q', 'third.js');
    writeFiles(dir, { 'old.js': lines(['function a() {', '  start();', '}']), 'new.js': lines(['// new', 'function b() {', ...moved, '}']) });
    const head = commit(dir, 'move');
    const r = facts(`${base}..${head}`, dir);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.moved.length, 1, JSON.stringify(r.json.moved));
    assert.deepEqual([r.json.moved[0].from.path, r.json.moved[0].to.path], ['old.js', 'new.js']);
    assert.ok(r.json.moved[0].lines >= 4);
  });

  test('a bad range, unknown revision or non-repo is a usage error with no output', () => {
    const cases = [
      [['facts', 'diff', repo.base, '--dir', repo.dir], /range/],
      [['facts', 'diff', `..${repo.head}`, '--dir', repo.dir], /range/],
      [['facts', 'diff', 'a..b..c', '--dir', repo.dir], /range/],
      [['facts', 'diff', `${repo.base}..nosuchref`, '--dir', repo.dir], /unknown revision "nosuchref"/],
      [['facts', 'diff', 'HEAD~1..HEAD', '--dir', tempDir('verstat-empty-')], /not a git repository/],
      [['facts', 'summary'], /facts needs/],
      [['facts'], /facts needs/],
      [['validate', 'page.json', '--dir', '.'], /--dir only applies to facts/],
      [['facts', 'diff', `${repo.base}..${repo.head}`, '--dir', repo.dir, '--json'], /facts takes only --dir/],
      [['facts', 'diff', `${repo.base}..${repo.head}`, '--repo', `x=${repo.dir}`], /facts takes only --dir/],
    ];
    for (const [args, message] of cases) {
      const r = run(args, { components: null });
      assert.equal(r.code, 2, args.join(' '));
      assert.equal(r.stdout, '', args.join(' '));
      assert.match(r.stderr, message, args.join(' '));
    }
  });

  test('its moved and noise items validate as moved-code and noise blocks', () => {
    const page = fixturePage();
    blockOf(page, 'moved-code').items = json.moved;
    blockOf(page, 'noise').items = json.noise;
    const r = run(['validate', writePage(page)], { components: null });
    assert.equal(r.code, 0, r.stderr);
  });
});
