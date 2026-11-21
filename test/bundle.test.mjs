import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { bundle } from '../scripts/bundle.mjs';
import { BIN, ROOT, run, tempDir } from './helpers.mjs';

describe('bin/verstat.mjs', () => {
  test('is the bundle of src/ (run `npm run build` after changing src/)', () => {
    assert.equal(readFileSync(BIN, 'utf8'), bundle(join(ROOT, 'src', 'cli.mjs')));
  });

  test('imports nothing but node: builtins', () => {
    const specs = [...readFileSync(BIN, 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(specs.length > 0);
    for (const spec of specs) assert.match(spec, /^node:/);
  });

  test('runs from a copy of the plugin with no node_modules', () => {
    const copy = tempDir('verstat-plugin-');
    for (const dir of ['bin', 'client', 'vendor', '.claude-plugin']) cpSync(join(ROOT, dir), join(copy, dir), { recursive: true });
    assert.equal(existsSync(join(copy, 'node_modules')), false);
    const r = run(['schema', 'fixture-note'], { bin: join(copy, 'bin', 'verstat.mjs'), cwd: copy });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).properties.type.const, 'fixture-note');
  });

  test('refuses a top-level name that clashes with a node: import', () => {
    const dir = tempDir('verstat-bundle-');
    writeFileSync(join(dir, 'a.mjs'), "import { resolve } from 'node:path';\nimport { other } from './b.mjs';\nexport const x = resolve(other);\n");
    writeFileSync(join(dir, 'b.mjs'), "export function resolve() {}\nexport const other = '.';\n");
    assert.throws(() => bundle(join(dir, 'a.mjs')), /"resolve" is declared at top level in both the import from node:path and/);
    writeFileSync(join(dir, 'b.mjs'), "import { join as resolve } from 'node:path';\nexport const other = '.';\n");
    assert.throws(() => bundle(join(dir, 'a.mjs')), /"resolve" is imported from both/);
  });

  test('refuses an aliased or namespace relative import', () => {
    const dir = tempDir('verstat-bundle-');
    writeFileSync(join(dir, 'b.mjs'), 'export const other = 1;\n');
    writeFileSync(join(dir, 'a.mjs'), "import { other as o } from './b.mjs';\nexport const x = o;\n");
    assert.throws(() => bundle(join(dir, 'a.mjs')), /relative imports must be a plain \{ a, b \} list/);
    writeFileSync(join(dir, 'a.mjs'), "import * as b from './b.mjs';\nexport const x = b.other;\n");
    assert.throws(() => bundle(join(dir, 'a.mjs')), /relative imports must be a plain/);
  });
});
