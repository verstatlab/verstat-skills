import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pathLabels } from './helpers.mjs';

const labels = pathLabels();
const adr = (name) => {
  const m = name.match(/^(\d{4})-/);
  return m ? `ADR ${m[1]}` : name;
};
const of = (paths, short) => Object.fromEntries(labels(paths, short));

describe('pathLabels', () => {
  test('unique names stay bare', () => {
    assert.deepEqual(of(['docs/feed.md', 'src/app.js']), { 'docs/feed.md': 'feed.md', 'src/app.js': 'app.js' });
  });

  test('equal names grow by one folder, a name without a clash stays short', () => {
    assert.deepEqual(of(['skills/autopilot/SKILL.md', 'skills/run-task/SKILL.md', 'docs/feed.md']), {
      'skills/autopilot/SKILL.md': 'autopilot/SKILL.md',
      'skills/run-task/SKILL.md': 'run-task/SKILL.md',
      'docs/feed.md': 'feed.md',
    });
  });

  test('a root file against a nested one', () => {
    assert.deepEqual(of(['SKILL.md', 'a/SKILL.md']), { 'SKILL.md': 'SKILL.md', 'a/SKILL.md': 'a/SKILL.md' });
  });

  test('equal parent folders grow two levels', () => {
    assert.deepEqual(of(['a/b/README.md', 'c/b/README.md']), { 'a/b/README.md': 'a/b/README.md', 'c/b/README.md': 'c/b/README.md' });
  });

  test('the ADR rewrite applies alone and is dropped when it still collides', () => {
    assert.deepEqual(of(['docs/adr/0037-claims.md', 'docs/guide.md'], adr), { 'docs/adr/0037-claims.md': 'ADR 0037', 'docs/guide.md': 'guide.md' });
    assert.deepEqual(of(['adr/0037-a.md', 'adr/0037-b.md'], adr), { 'adr/0037-a.md': 'adr/0037-a.md', 'adr/0037-b.md': 'adr/0037-b.md' });
  });

  test('labels are always distinct', () => {
    const paths = ['SKILL.md', 'a/SKILL.md', 'x/a/SKILL.md', 'y/a/SKILL.md', 'adr/0001-x.md', 'old/adr/0001-y.md', 'README.md', 'b/README.md'];
    const out = labels(paths, adr);
    assert.equal(out.size, paths.length);
    assert.equal(new Set(out.values()).size, paths.length);
  });
});
