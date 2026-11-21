import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ROOT, commit, git, run, tempDir, writeFiles } from './helpers.mjs';

const window = {};
runInNewContext(readFileSync(join(ROOT, 'client', 'modules', 'commit-graph.js'), 'utf8'), { window });
const { commitGraph } = window.verstat;
const plain = (v) => JSON.parse(JSON.stringify(v));

function facts(range, dir) {
  const r = run(['facts', 'diff', range, '--dir', dir], { components: null });
  assert.equal(r.code, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function mergedRepo() {
  const dir = tempDir('verstat-commits-');
  git(dir, 'init', '-q', '-b', 'main');
  writeFiles(dir, { 'a.js': 'export const a = 1;\n' });
  const root = commit(dir, 'root');
  git(dir, 'checkout', '-q', '-b', 'feature');
  writeFiles(dir, { 'b.js': 'export const b = 2;\n' });
  const first = commit(dir, 'add b');
  git(dir, 'checkout', '-q', 'main');
  writeFiles(dir, { 'c.js': 'export const c = 3;\n' });
  const onMain = commit(dir, 'add c on main');
  git(dir, 'checkout', '-q', 'feature');
  git(dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'merge', '-q', '--no-edit', 'main');
  const merge = git(dir, 'rev-parse', 'HEAD');
  writeFiles(dir, { 'b.js': 'export const b = 4;\n' });
  const last = commit(dir, 'change b');
  return { dir, root, first, onMain, merge, last };
}

describe('commit facts', () => {
  test('a linear history gives each commit its one parent, oldest first', () => {
    const dir = tempDir('verstat-commits-');
    git(dir, 'init', '-q');
    writeFiles(dir, { 'a.txt': 'one\n' });
    const base = commit(dir, 'one');
    writeFiles(dir, { 'a.txt': 'two\n' });
    const second = commit(dir, 'two');
    writeFiles(dir, { 'a.txt': 'three\n' });
    const third = commit(dir, 'three');
    const json = facts(`${base}..${third}`, dir);
    assert.deepEqual(json.commits.map((c) => [c.sha, c.parents]), [[second, [base]], [third, [second]]]);
    assert.ok(json.commits.every((c) => !c.external));
  });

  test('a merge of the base branch has two parents and brings the merged commit in as external', () => {
    const repo = mergedRepo();
    const json = facts('main...feature', repo.dir);
    assert.equal(json.base, repo.onMain);
    assert.deepEqual(json.commits.map((c) => c.sha), [repo.first, repo.onMain, repo.merge, repo.last]);
    const external = json.commits[1];
    assert.equal(external.external, true);
    assert.equal(external.subject, 'add c on main');
    assert.deepEqual(external.parents, [repo.root]);
    assert.deepEqual([external.additions, external.deletions, external.files], [0, 0, []]);
    assert.deepEqual(json.commits[2].parents, [repo.first, repo.onMain]);
    assert.deepEqual(json.files.map((f) => f.path), ['b.js']);
  });

  test('a two-dot range from the fork point lists the base commit as an ordinary commit', () => {
    const repo = mergedRepo();
    const json = facts(`${repo.root}..feature`, repo.dir);
    assert.ok(json.commits.every((c) => !c.external));
    assert.ok(json.commits.some((c) => c.sha === repo.onMain));
  });
});

describe('commit graph', () => {
  test('a linear history is one lane in one colour', () => {
    const g = plain(commitGraph([
      { sha: 'c3', parents: ['c2'] },
      { sha: 'c2', parents: ['c1'] },
      { sha: 'c1', parents: ['c0'] },
    ]));
    assert.equal(g.lanes, 1);
    assert.deepEqual(g.rows.map((r) => [r.col, r.into, r.outs, r.pass]), [[0, [], [0], []], [0, [0], [0], []], [0, [0], [], []]]);
    assert.equal(new Set(g.rows.map((r) => r.color)).size, 1);
  });

  test('a merge opens a second lane for the merged branch in its own colour', () => {
    const g = plain(commitGraph([
      { sha: 'e', parents: ['m'] },
      { sha: 'm', parents: ['b', 'x'] },
      { sha: 'x', parents: ['o'], external: true },
      { sha: 'b', parents: ['a'] },
      { sha: 'a', parents: ['o'] },
    ]));
    assert.equal(g.lanes, 2);
    const [e, m, x, b, a] = g.rows;
    assert.deepEqual(m.outs, [0, 1]);
    assert.equal(x.col, 1);
    assert.deepEqual(x.pass, [0]);
    assert.deepEqual(x.outs, []);
    assert.deepEqual([b.col, a.col], [0, 0]);
    assert.equal(e.color, m.color);
    assert.equal(b.color, m.color);
    assert.notEqual(x.color, m.color);
    assert.equal(m.afterColors[1], x.color);
  });

  test('a merge whose first parent is off the list draws the merged branch in its own colour', () => {
    const g = plain(commitGraph([
      { sha: 'm', parents: ['o', 'x'] },
      { sha: 'x', parents: ['o'] },
    ]));
    const [m, x] = g.rows;
    assert.equal(m.outs.length, 1);
    assert.equal(x.col, m.outs[0]);
    assert.notEqual(x.color, m.color);
    assert.equal(m.afterColors[m.outs[0]], x.color);
  });

  test('commits without parents are drawn one under another without lines', () => {
    const g = plain(commitGraph([{ sha: 'a' }, { sha: 'b' }]));
    assert.deepEqual(g.rows.map((r) => [r.col, r.outs, r.color]), [[0, [], 0], [0, [], 0]]);
  });
});
