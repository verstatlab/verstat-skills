import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_COMPONENTS, run, tempDir } from './helpers.mjs';

describe('schema', () => {
  test('prints a block schema with the shared anchor definition inlined', () => {
    const r = run(['schema', 'fixture-note']);
    assert.equal(r.code, 0, r.stderr);
    const schema = JSON.parse(r.stdout);
    assert.equal(schema.properties.type.const, 'fixture-note');
    const anchor = schema.properties.anchor;
    assert.equal(anchor['x-anchor'], true);
    assert.deepEqual(anchor.required, ['repo', 'path']);
    assert.equal(schema.properties.claims.items.properties.anchor['x-anchor-contains'], 'symbol');
    assert.deepEqual(schema.properties.claims.items.properties.source.enum, ['code', 'test', 'adr', 'doc', 'inferred']);
    assert.doesNotMatch(r.stdout, /verstat:page#/);
  });

  test('prints the page schema', () => {
    const r = run(['schema', 'page']);
    assert.equal(r.code, 0);
    const schema = JSON.parse(r.stdout);
    assert.deepEqual(schema.required, ['schema', 'skill', 'question', 'repos', 'blocks']);
    assert.ok(schema.$defs.anchor);
    assert.deepEqual(schema.$defs.change.enum, ['added', 'removed', 'changed']);
    assert.equal(schema.$defs.glossaryEntry.properties.code.type, 'string');
    assert.equal(schema.$defs.glossaryEntry.properties.aliases.items.type, 'string');
  });

  test('an unknown type exits non-zero and names it', () => {
    const r = run(['schema', 'no-such-type']);
    assert.equal(r.code, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^unknown block type "no-such-type"; known: .*\bfixture-note\b/);
  });

  test('without --components no fixture type is known', () => {
    const r = run(['schema', 'fixture-note'], { components: null });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown block type "fixture-note"/);
  });

  test('an unknown command prints usage and exits 2', () => {
    const r = run(['explode']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown command "explode"/);
  });

  test('a broken symlink among block types is skipped', () => {
    const dir = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(dir, 'fixture-note'), { recursive: true });
    symlinkSync(join(dir, 'nowhere'), join(dir, 'broken'));
    const r = run(['schema', 'fixture-note'], { components: dir });
    assert.equal(r.code, 0, r.stderr);
  });

  test('a block type folder named page is not a block type', () => {
    const dir = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(dir, 'page'), { recursive: true });
    const r = run(['schema', 'nope'], { components: dir });
    assert.match(r.stderr, /^unknown block type "nope"; known: /);
    assert.doesNotMatch(r.stderr, /\bpage\b/);
  });

  test('extra arguments and a misplaced -o are usage errors', () => {
    const extra = run(['validate', 'a.json', 'b.json']);
    assert.equal(extra.code, 2);
    assert.match(extra.stderr, /unexpected argument "b\.json"/);
    const out = run(['validate', 'a.json', '-o', 'x.html']);
    assert.equal(out.code, 2);
    assert.match(out.stderr, /-o\/--out only applies to build/);
  });
});
