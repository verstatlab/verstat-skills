import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writeFiles, writePage } from './helpers.mjs';

const window = {};
runInNewContext(readFileSync(join(ROOT, 'client', 'modules', 'markdown.js'), 'utf8'), { window });
const md = window.verstat.markdown;
const plain = (v) => JSON.parse(JSON.stringify(v));
const linesOf = (text) => text.replace(/\n$/, '').split('\n');

const FILLER = ['', 'Filler one keeps hunks apart.', '', 'Filler two keeps hunks apart.', '', 'Filler three keeps hunks apart.', ''];

const BASE_DOC = [
  '# Title',
  '',
  'Intro paragraph',
  'on two lines.',
  ...FILLER,
  '## Options',
  '',
  '* first option',
  '* second option',
  ...FILLER,
  '| Key | Owner |',
  '|---|---|',
  '| status | tasks |',
  ...FILLER,
  '```sh',
  'run a',
  '```',
  ...FILLER,
].join('\n');

const HEAD_DOC = BASE_DOC
  .replace('* second option', '* second option, reworded\n* **third** option with `code`')
  .replace('| status | tasks |', '| status | tasks |\n| held | workflows |')
  .replace('run a', 'run a\nrun b');

function docRepo() {
  const dir = tempDir('verstat-docs-');
  git(dir, 'init', '-q');
  writeFiles(dir, { 'docs/guide.md': BASE_DOC, 'README.md': '# readme\n', 'src/app.js': 'export const a = 1;\n' });
  const base = commit(dir, 'base');
  writeFiles(dir, { 'docs/guide.md': HEAD_DOC, 'src/app.js': 'export const a = 2;\n' });
  const head = commit(dir, 'head');
  return { dir, base, head };
}

const repo = docRepo();

function docPage(files) {
  return {
    schema: 'verstat.page/1',
    skill: 'explain',
    question: 'What do the docs say now?',
    repos: { docs: { sha: repo.head, path: repo.dir }, 'docs@base': { sha: repo.base, path: repo.dir } },
    blocks: [{ id: 'docs', type: 'doc-changes', repo: 'docs', base: 'docs@base', files }],
  };
}

function build(page) {
  const file = writePage(page);
  const out = join(tempDir('verstat-out-'), 'page.html');
  const r = run(['build', file, '-o', out], { components: null });
  if (r.code !== 0) return { ...r, html: null, data: null };
  const html = readFileSync(out, 'utf8');
  const json = html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s)[1];
  return { ...r, html, data: JSON.parse(json) };
}

function validate(page) {
  return run(['validate', writePage(page)], { components: null });
}

describe('markdown parse', () => {
  test('finds every element with its lines', () => {
    const lines = [
      '# H1', '## H2', '### H3', '#### H4', '##### H5', '',
      'A paragraph', 'that wraps.', '',
      '- bullet', '  - nested', '3. third', '',
      '> quote', '> more', '',
      '```js', 'const a = 1;', '```', '',
      '| A | B |', '|---|---|', '| 1 | 2 |', '',
      '---', '',
      'Setext', '===',
    ];
    const blocks = plain(md.parse(lines));
    assert.deepEqual(blocks.map((b) => [b.type, b.start, b.end]), [
      ['h1', 1, 1], ['h2', 2, 2], ['h3', 3, 3], ['h4', 4, 4], ['h4', 5, 5],
      ['p', 7, 8], ['li', 10, 10], ['li', 11, 11], ['oli', 12, 12], ['quote', 14, 15],
      ['code', 17, 19], ['table', 21, 23], ['hr', 25, 25], ['h1', 27, 28],
    ]);
    assert.equal(blocks[5].text, 'A paragraph that wraps.');
    assert.equal(blocks[7].depth, 1);
    assert.equal(blocks[8].num, '3');
    assert.equal(blocks[9].text, 'quote more');
    assert.deepEqual(blocks[10].rows, [{ line: 18, text: 'const a = 1;' }]);
    assert.equal(blocks[10].lang, 'js');
    assert.deepEqual(blocks[11].rows.map((r) => [r.line, r.cells, !!r.head]), [[21, ['A', 'B'], true], [23, ['1', '2'], false]]);
  });

  test('inline runs: bold, italic, code, links', () => {
    assert.deepEqual(plain(md.inline('a **b `c`** _d_ [e](https://x.org) [f](./y) snake_case')), [
      { t: 'a ' }, { t: 'b ', b: true }, { t: 'c', b: true, code: true }, { t: ' ' }, { t: 'd', i: true }, { t: ' ' },
      { t: 'e', href: 'https://x.org' }, { t: ' ' }, { t: 'f', link: true }, { t: ' snake_case' },
    ]);
    assert.deepEqual(plain(md.inline('a_b **c** d_')), [{ t: 'a_b ' }, { t: 'c', b: true }, { t: ' d_' }]);
  });
});

describe('markdown fragment', () => {
  const hunk = (pairs) => pairs.map(([kind, old, now, text]) => ({ kind, ...(old ? { old } : {}), ...(now ? { new: now } : {}), text }));

  test('a changed paragraph shows the old one removed, then the new one added, under its section heading', () => {
    const old = ['## Section', '', 'Old text.', '', 'Tail.'];
    const now = ['## Section', '', 'New text.', '', 'Tail.'];
    const items = plain(md.fragment(old, now, hunk([['context', 2, 2, ''], ['del', 3, 0, 'Old text.'], ['add', 0, 3, 'New text.'], ['context', 4, 4, ''], ['context', 5, 5, 'Tail.']])));
    assert.deepEqual(items.map((i) => [i.type, i.sign, i.text]), [['h2', ' ', 'Section'], ['p', '-', 'Old text.'], ['p', '+', 'New text.'], ['p', ' ', 'Tail.']]);
    assert.equal(items[0].section, true);
  });

  test('a table and a code block are marked per row', () => {
    const old = ['| K | V |', '|---|---|', '| a | 1 |', '', '```', 'x', '```'];
    const now = ['| K | V |', '|---|---|', '| a | 1 |', '| b | 2 |', '', '```', 'x', 'y', '```'];
    const items = plain(md.fragment(old, now, hunk([
      ['context', 3, 3, '| a | 1 |'], ['add', 0, 4, '| b | 2 |'], ['context', 4, 5, ''], ['context', 5, 6, '```'], ['context', 6, 7, 'x'], ['add', 0, 8, 'y'], ['context', 7, 9, '```'],
    ])));
    assert.deepEqual(items.map((i) => i.type), ['table', 'code']);
    assert.deepEqual(items[0].rows.map((r) => [r.sign, r.cells, !!r.head]), [[' ', ['K', 'V'], true], [' ', ['a', '1'], false], ['+', ['b', '2'], false]]);
    assert.deepEqual(items[1].rows.map((r) => [r.sign, r.text]), [[' ', 'x'], ['+', 'y']]);
  });

  test('a line removed inside a paragraph marks the new paragraph too', () => {
    const old = ['line one', 'line two', 'line three'];
    const now = ['line one', 'line three'];
    const items = plain(md.fragment(old, now, hunk([['context', 1, 1, 'line one'], ['del', 2, 0, 'line two'], ['context', 3, 2, 'line three']])));
    assert.deepEqual(items.map((i) => [i.sign, i.text]), [['-', 'line one line two line three'], ['+', 'line one line three']]);
  });

  test('two tables in one hunk stay two tables', () => {
    const old = ['| A | B |', '|---|---|', '| 1 | 2 |', '', '| X | Y | Z |', '|---|---|---|', '| 7 | 8 | 9 |'];
    const now = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |', '', '| X | Y | Z |', '|---|---|---|', '| 7 | 8 | 9 |'];
    const items = plain(md.fragment(old, now, hunk([
      ['context', 3, 3, '| 1 | 2 |'], ['add', 0, 4, '| 3 | 4 |'], ['context', 4, 5, ''], ['context', 5, 6, '| X | Y | Z |'], ['context', 6, 7, '|---|---|---|'],
    ])));
    assert.deepEqual(items.map((i) => i.type), ['table', 'table']);
    assert.deepEqual(items[0].rows.map((r) => r.cells), [['A', 'B'], ['1', '2'], ['3', '4']]);
    assert.deepEqual(items[1].rows.filter((r) => r.head).map((r) => r.cells), [['X', 'Y', 'Z']]);
  });
});

describe('doc-changes block', () => {
  test('build embeds both versions and the hunks exactly as git diff prints them', () => {
    const r = build(docPage([{ id: 'guide', path: 'docs/guide.md', fragments: [
      { id: 'f1', find: 'third', kind: 'read', title: 'Third option' },
      { id: 'f2', find: 'held | workflows', kind: 'skim', title: 'New row' },
    ] }]));
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /vs\.read = /);
    const file = r.data.blocks[0].files[0];
    assert.deepEqual(file.diff.old, linesOf(BASE_DOC));
    assert.deepEqual(file.diff.new, linesOf(HEAD_DOC));
    assert.equal(file.diff.status, 'modified');
    const gitDiff = execFileSync('git', ['-C', repo.dir, 'diff', '--no-color', '-U3', repo.base, repo.head, '--', 'docs/guide.md'], { encoding: 'utf8' });
    const hunks = gitDiff.split('\n').slice(4).join('\n').split(/^@@.*$\n/m).filter(Boolean).map((h) => h.replace(/\n$/, '').split('\n'));
    const ours = file.diff.hunks.map((h) => h.lines.map((l) => `${{ add: '+', del: '-', context: ' ' }[l.kind]}${l.text}`));
    assert.equal(ours.length, 3);
    assert.deepEqual(ours, hunks);
    assert.equal(file.diff.additions, 4);
    assert.equal(file.diff.deletions, 1);
    assert.deepEqual(file.fragments.map((f) => f.hunk), [0, 1]);
    assert.match(r.html, /vs\.markdown = /);
  });

  test('a version over the size limit is not embedded and the file is marked large', () => {
    const dir = tempDir('verstat-docs-large-');
    git(dir, 'init', '-q');
    const long = Array.from({ length: 4100 }, (_, i) => `Line ${i + 1}.`).join('\n\n');
    writeFiles(dir, { 'big.md': '# Big\n\nshort\n' });
    const base = commit(dir, 'base');
    writeFiles(dir, { 'big.md': `# Big\n\n${long}\n` });
    const head = commit(dir, 'head');
    const page = docPage([{ id: 'big', path: 'big.md' }]);
    page.repos = { docs: { sha: head, path: dir }, 'docs@base': { sha: base, path: dir } };
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    const { diff } = r.data.blocks[0].files[0];
    assert.equal(diff.large, true);
    assert.equal(diff.new, null);
    assert.deepEqual(diff.old, ['# Big', '', 'short']);
    assert.ok(diff.hunks.length > 0);
  });

  test('each document tab carries a reading box keyed like a file of a layer', () => {
    const { code, stderr, data } = build(docPage([{ id: 'guide', path: 'docs/guide.md' }]));
    assert.equal(code, 0, stderr);
    let registered = null;
    const meta = JSON.parse(readFileSync(join(ROOT, 'components', 'doc-changes', 'meta.json'), 'utf8'));
    runInNewContext(wrapRender('doc-changes', readFileSync(join(ROOT, 'components', 'doc-changes', 'render.js'), 'utf8'), meta), {
      verstat: { register: (name, fn) => { registered = fn; } },
      window,
      document: { createTextNode: (t) => t },
    });
    const el = (tag, attrs = {}, children = []) => ({
      tag, attrs, children: [].concat(children).filter((c) => c !== null && c !== undefined), hidden: !!attrs.hidden,
      classList: { toggle() {}, add() {}, remove() {} },
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      replaceChildren(...c) { this.children = c; },
    });
    const boxes = [];
    const ctx = {
      ...i18n(),
      page: data, el, part: (n) => n, on: () => {}, onFocus: () => {},
      read: { key: (repoName, path) => `${repoName}/${path}`, box: (k) => { boxes.push(k); return el('box'); } },
    };
    const root = registered(data.blocks[0], ctx);
    assert.ok(root);
    assert.deepEqual(boxes, ['docs/docs/guide.md']);
    const tabs = root.children[0];
    assert.equal(tabs.attrs.role, 'group');
    assert.ok(tabs.children.every((wrap) => wrap.attrs.class === 'vs-dc-tabwrap' && wrap.children[1].tag === 'box'));
  });

  test('the markdown module stays off pages without the block', () => {
    const r = build({ ...docPage([]), blocks: [{ id: 'b', type: 'brief', answer: 'x' }] });
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.html, /vs\.markdown = /);
  });

  test('rejects a path that is not Markdown, not changed or listed twice', () => {
    const r = validate(docPage([
      { id: 'a', path: 'src/app.js' },
      { id: 'b', path: 'README.md' },
      { id: 'c', path: 'docs/guide.md' },
      { id: 'd', path: 'docs/guide.md' },
    ]));
    assert.equal(r.code, 1);
    assert.match(r.stderr, /files\[0\]\.path: "src\/app\.js" is not a Markdown file/);
    assert.match(r.stderr, /files\[1\]\.path: "README\.md" is not changed/);
    assert.match(r.stderr, /files\[3\]\.path: "docs\/guide\.md" is listed twice/);
  });

  test('rejects a fragment whose text is in no hunk, in several hunks, or in a hunk already taken', () => {
    const r = validate(docPage([{ id: 'g', path: 'docs/guide.md', fragments: [
      { id: 'f1', find: 'not in the diff', kind: 'read', title: 'x' },
      { id: 'f2', find: 'Filler', kind: 'read', title: 'x' },
      { id: 'f3', find: 'third', kind: 'read', title: 'x' },
      { id: 'f4', find: 'reworded', kind: 'read', title: 'x' },
    ] }]));
    assert.equal(r.code, 1);
    assert.match(r.stderr, /fragments\[0\]\.find: "not in the diff" is in no changed fragment/);
    assert.match(r.stderr, /fragments\[1\]\.find: "Filler" is in \d+ fragments/);
    assert.match(r.stderr, /fragments\[3\]\.find: fragments\[2\] already describes/);
  });

  test('the schema keeps the engine fields out of the page', () => {
    const r = validate(docPage([{ id: 'g', path: 'docs/guide.md', diff: {} }]));
    assert.equal(r.code, 1);
    assert.match(r.stderr, /diff/);
  });
});
