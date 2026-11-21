import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, test } from 'node:test';
import { commitStatus, gitEnv } from '../src/git.mjs';
import { BIN, FIXTURE_COMPONENTS, commit, git, makeRepo, notePage, run, tempDir, writeFiles, writePage } from './helpers.mjs';

const repo = makeRepo();

function validate(page, ...extra) {
  return run(['validate', writePage(page), ...extra]);
}

function edited(edit) {
  const page = notePage(repo);
  edit(page);
  return page;
}

function assertRejected(r, path, pattern) {
  assert.equal(r.code, 1, r.stdout + r.stderr);
  const line = r.stderr.split('\n').find((l) => l.startsWith(`error: ${path}: `));
  assert.ok(line, `no error at ${path} in:\n${r.stderr}`);
  assert.match(line, pattern);
}

describe('validate', () => {
  test('a valid page passes', () => {
    const r = validate(notePage(repo));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, 'ok\n');
    assert.equal(r.stderr, '');
  });

  test('--json reports ok, errors and inferred', () => {
    const r = validate(notePage(repo), '--json');
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.stdout), { ok: true, errors: [], inferred: [] });
  });

  test('rejects a file missing at the sha', () => {
    const r = validate(edited((p) => { p.blocks[0].anchor.path = 'src/missing.js'; }));
    assertRejected(r, '$.blocks[0].anchor.path', /does not exist in target@/);
  });

  test('reads the pinned sha, not the checkout', () => {
    const later = makeRepo();
    writeFiles(later.dir, { 'src/new.js': 'function start() {}\n' });
    commit(later.dir, 'later');
    const page = notePage(later);
    page.blocks[0].anchor.path = 'src/new.js';
    assertRejected(validate(page), '$.blocks[0].anchor.path', /does not exist/);
  });

  test('rejects find not found', () => {
    const r = validate(edited((p) => { p.blocks[0].anchor.find = 'function stop() {'; }));
    assertRejected(r, '$.blocks[0].anchor.find', /not found in target:src\/app\.js@/);
  });

  test('rejects an ambiguous find without nth', () => {
    const r = validate(edited((p) => { p.blocks[0].anchor.find = 'handler'; }));
    assertRejected(r, '$.blocks[0].anchor.find', /occurs 2 times.*add "nth"/);
  });

  test('nth picks one occurrence, counted from 1', () => {
    const ok = validate(edited((p) => { Object.assign(p.blocks[0].anchor, { find: 'handler', nth: 2 }); }));
    assert.equal(ok.code, 0, ok.stderr);
    const past = validate(edited((p) => { Object.assign(p.blocks[0].anchor, { find: 'handler', nth: 3 }); }));
    assertRejected(past, '$.blocks[0].anchor.nth', /occurs only 2 time/);
    const zero = validate(edited((p) => { Object.assign(p.blocks[0].anchor, { find: 'handler', nth: 0 }); }));
    assertRejected(zero, '$.blocks[0].anchor.nth', /must be >= 1/);
  });

  test('rejects a dirty working tree, ignores untracked files', () => {
    const own = makeRepo();
    const page = notePage(own);
    writeFileSync(join(own.dir, 'scratch.txt'), 'untracked\n');
    assert.equal(validate(page).code, 0);
    writeFileSync(join(own.dir, 'README.md'), '# changed\n');
    const r = validate(page);
    assertRejected(r, '$.repos.target', /working tree .* is dirty.*README\.md/);
    assert.equal(r.stderr.trim().split('\n').length, 1, 'one error per repo, not per anchor');
    git(own.dir, 'add', 'README.md');
    assertRejected(validate(page), '$.repos.target', /dirty/);
  });

  test('rejects a route step to a missing block', () => {
    const r = validate(edited((p) => { p.route[0].block = 'nope'; }));
    assertRejected(r, '$.route[0].block', /no block with id "nope"/);
  });

  test('rejects a route focus on a missing part', () => {
    const r = validate(edited((p) => { p.route[1].focus = 'nope'; }));
    assertRejected(r, '$.route[1].focus', /block "n2" has no part with id "nope"/);
  });

  test('rejects a block failing its schema', () => {
    const r = validate(edited((p) => { delete p.blocks[0].text; }));
    assertRejected(r, '$.blocks[0]', /missing required field "text"/);
  });

  test('rejects an unknown block type', () => {
    const r = validate(edited((p) => { p.blocks[1].type = 'mystery'; }));
    assertRejected(r, '$.blocks[1].type', /unknown block type "mystery"; known: .*\bfixture-note\b/);
  });

  test('rejects duplicate block and part ids', () => {
    const r = validate(edited((p) => {
      p.blocks[1].id = 'n1';
      p.route = [];
    }));
    assertRejected(r, '$.blocks[1].id', /duplicate block id "n1"/);
    const parts = validate(edited((p) => { p.blocks[1].claims.push({ ...p.blocks[1].claims[0] }); }));
    assertRejected(parts, '$.blocks[1].claims[1].id', /duplicate part id "p1"/);
  });

  test('rejects an anchor into an undeclared repo', () => {
    const r = validate(edited((p) => { p.blocks[0].anchor.repo = 'other'; }));
    assertRejected(r, '$.blocks[0].anchor.repo', /"other" is not declared/);
  });

  test('checks glossary anchors too', () => {
    const r = validate(edited((p) => { p.glossary[0].anchor.find = 'nowhere'; }));
    assertRejected(r, '$.glossary[0].anchor.find', /not found/);
  });

  test('reports every problem, not only the first', () => {
    const r = validate(edited((p) => {
      p.blocks[0].anchor.find = 'function stop() {';
      p.route[0].block = 'nope';
    }));
    assertRejected(r, '$.blocks[0].anchor.find', /not found/);
    assertRejected(r, '$.route[0].block', /nope/);
  });

  test('--repo locates a checkout; without it the page directory is used', () => {
    const page = edited((p) => { delete p.repos.target.path; });
    const r = validate(page, '--repo', `target=${repo.dir}`);
    assert.equal(r.code, 0, r.stderr);
    assertRejected(validate(page), '$.repos.target', /no git repository|not found/);
  });

  test('an unconfirmed content check yields inferred, not a rejection', () => {
    const page = edited((p) => { p.blocks[1].claims[0].symbol = 'shutdown'; });
    const r = validate(page);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /^ok\ninferred: \$\.blocks\[1\]\.claims\[0\] — src\/app\.js:50 does not contain symbol "shutdown"\n$/);
    const json = JSON.parse(validate(page, '--json').stdout);
    assert.equal(json.ok, true);
    assert.deepEqual(json.inferred.map((c) => c.path), ['$.blocks[1].claims[0]']);
    const missing = validate(edited((p) => { delete p.blocks[1].claims[0].symbol; }));
    assert.equal(missing.code, 0);
    assert.match(missing.stdout, /inferred: \$\.blocks\[1\]\.claims\[0\] — .*symbol \(no text\)/);
  });

  test('a confirmed content check is a fact', () => {
    const r = validate(notePage(repo));
    assert.doesNotMatch(r.stdout, /inferred/);
  });

  test('a page that is not JSON fails cleanly', () => {
    const file = writePage({});
    writeFileSync(file, '{ nope');
    const r = run(['validate', file]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error: \$: .*not valid JSON/);
  });

  test('a repo name that is an Object.prototype key is not declared', () => {
    const r = validate(edited((p) => { p.blocks[0].anchor.repo = 'constructor'; }));
    assertRejected(r, '$.blocks[0].anchor.repo', /"constructor" is not declared/);
    const named = validate(edited((p) => {
      p.repos.constructor = p.repos.target;
      delete p.repos.target;
      p.glossary[0].anchor.repo = 'constructor';
      p.blocks[0].anchor.repo = 'constructor';
      p.blocks[1].claims[0].anchor.repo = 'constructor';
    }));
    assert.equal(named.code, 0, named.stderr);
  });

  test('a content check on an anchor outside an object is a schema error', () => {
    const components = tempDir('verstat-components-');
    writeFiles(components, {
      'fixture-list/schema.json': JSON.stringify({
        type: 'object',
        properties: { anchors: { type: 'array', items: { $ref: 'verstat:page#/$defs/anchor', 'x-anchor-contains': 'id' } } },
      }),
    });
    const page = edited((p) => {
      p.blocks.push({ id: 'l1', type: 'fixture-list', anchors: [{ repo: 'target', path: 'src/app.js', find: 'function start() {' }] });
    });
    const r = run(['--components', components, 'validate', writePage(page)]);
    assertRejected(r, '$.blocks[2].anchors[0]', /"x-anchor-contains" needs the anchor to be a field of an object/);
  });

  test('a page that is JSON null is a page error', () => {
    const file = writePage(null);
    const r = run(['validate', file]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error: \$: expected object, got null$/m);
  });

  test('an anchor marked by a block schema of its own is checked for shape', () => {
    const components = tempDir('verstat-components-');
    writeFiles(components, {
      'fixture-raw/schema.json': JSON.stringify({ type: 'object', properties: { at: { 'x-anchor': true } } }),
    });
    const page = edited((p) => {
      p.blocks.push({ id: 'r1', type: 'fixture-raw', at: { repo: 'target', find: 'function start() {' } });
    });
    const r = run(['--components', components, 'validate', writePage(page)]);
    assertRejected(r, '$.blocks[2].at', /an anchor needs string "repo" and "path"/);
    const shared = validate(edited((p) => { delete p.blocks[0].anchor.path; }));
    assert.equal(shared.stderr.trim().split('\n').length, 1, 'the shared anchor schema reports it once');
  });

  test('only commits make a short sha ambiguous', () => {
    const own = makeRepo();
    const blobs = execFileSync('git', ['-C', own.dir, 'hash-object', '-w', '--stdin-paths'], {
      input: Array.from({ length: 1500 }, (_, i) => writeBlob(own.dir, i)).join('\n'),
      encoding: 'utf8',
    }).trim().split('\n');
    const seen = new Set();
    const prefix = blobs.map((b) => b.slice(0, 4)).find((p) => (seen.has(p) ? true : (seen.add(p), false)));
    assert.ok(prefix, 'two blobs share a 4-character prefix');
    assert.equal(commitStatus(own.dir, prefix).status, 'missing', 'blobs alone do not make a sha ambiguous');
    const tree = git(own.dir, 'rev-parse', `${own.sha}^{tree}`);
    const commits = execFileSync('git', ['-C', own.dir, 'hash-object', '-t', 'commit', '-w', '--stdin-paths'], {
      input: Array.from({ length: 1500 }, (_, i) => writeObject(own.dir, `c-${i}`, `tree ${tree}\nauthor t <t@e> 0 +0000\ncommitter t <t@e> 0 +0000\n\n${i}\n`)).join('\n'),
      encoding: 'utf8',
    }).trim().split('\n');
    const seenCommits = new Set();
    const commitPrefix = commits.map((c) => c.slice(0, 4)).find((p) => (seenCommits.has(p) ? true : (seenCommits.add(p), false)));
    assert.ok(commitPrefix, 'two commits share a 4-character prefix');
    assert.equal(commitStatus(own.dir, commitPrefix).status, 'ambiguous');
    assert.equal(commitStatus(own.dir, 'deadbeefdeadbeef').status, 'missing');
    assert.deepEqual(commitStatus(own.dir, own.sha), { status: 'ok', oid: own.sha });
  });

  test("a checkout's core.fsmonitor command is not run", () => {
    const own = makeRepo();
    const marker = join(tempDir('verstat-marker-'), 'ran');
    git(own.dir, 'config', 'core.fsmonitor', `touch '${marker}'; false`);
    const r = validate(notePage(own));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(existsSync(marker), false);
  });

  test("a checkout's clean filter is not run, and a touched file is not dirty", () => {
    const own = makeRepo();
    const marker = join(tempDir('verstat-marker-'), 'ran');
    writeFiles(own.dir, { '.gitattributes': '*.md filter=x\n' });
    commit(own.dir, 'attributes');
    git(own.dir, 'config', 'filter.x.clean', `touch '${marker}'; cat`);
    const page = notePage(own);
    const later = new Date(Date.now() + 5000);
    utimesSync(join(own.dir, 'README.md'), later, later);
    const r = validate(page);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(existsSync(marker), false);
    writeFileSync(join(own.dir, 'README.md'), '# changed\n');
    assertRejected(validate(page), '$.repos.target', /dirty.*README\.md/);
    assert.equal(existsSync(marker), false);
  });

  test('a --repo name that is not in repos is an error', () => {
    const r = validate(notePage(repo), '--repo', `targt=${repo.dir}`);
    assertRejected(r, '$.repos', /--repo targt=… names no repo in "repos"/);
  });

  for (const driver of ['x', 'x=y']) test(`a clean filter (${driver}) is not run for a racily clean index entry`, () => {
    const own = makeRepo();
    const marker = join(tempDir('verstat-marker-'), 'ran');
    writeFiles(own.dir, { '.gitattributes': `*.md filter=${driver}\n` });
    commit(own.dir, 'attributes');
    const past = new Date('2026-01-01T00:00:00Z');
    utimesSync(join(own.dir, 'README.md'), past, past);
    git(own.dir, 'update-index', '--refresh');
    utimesSync(join(own.dir, '.git', 'index'), past, past);
    git(own.dir, 'config', `filter.${driver}.clean`, `touch '${marker}'; cat`);
    utimesSync(join(own.dir, '.git', 'index'), past, past);
    const r = validate(notePage(own));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(existsSync(marker), false);
  });

  test("a submodule's clean filter is not run", () => {
    const sub = makeRepo();
    const marker = join(tempDir('verstat-marker-'), 'ran');
    writeFiles(sub.dir, { '.gitattributes': '*.md filter=z\n' });
    commit(sub.dir, 'attributes');
    const own = makeRepo();
    git(own.dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.dir, 'sub');
    const sha = commit(own.dir, 'submodule');
    const inner = join(own.dir, 'sub');
    const past = new Date('2026-01-01T00:00:00Z');
    utimesSync(join(inner, 'README.md'), past, past);
    git(inner, 'update-index', '--refresh');
    utimesSync(join(own.dir, '.git', 'modules', 'sub', 'index'), past, past);
    git(inner, 'config', 'filter.z.clean', `touch '${marker}'; cat`);
    const r = validate(notePage({ dir: own.dir, sha }));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(existsSync(marker), false);
  });

  test('git runs with lazy fetch off and overrides appended to existing GIT_CONFIG_*', () => {
    const env = gitEnv(['a=b'], { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'x' });
    assert.equal(env.GIT_NO_LAZY_FETCH, '1');
    assert.equal(env.GIT_CONFIG_KEY_0, 'user.name');
    assert.equal(env.GIT_CONFIG_KEY_1, 'core.fsmonitor');
    assert.equal(env.GIT_CONFIG_KEY_2, 'filter.a=b.clean');
    assert.equal(env.GIT_CONFIG_VALUE_2, '');
    assert.equal(env.GIT_CONFIG_COUNT, '6');
  });

  test('GIT_DIR from the environment does not redirect the engine', () => {
    const other = makeRepo();
    const r = spawnSync(process.execPath, [BIN, '--components', FIXTURE_COMPONENTS, 'validate', writePage(notePage(repo))], {
      encoding: 'utf8',
      env: { ...process.env, GIT_DIR: join(other.dir, '.git'), GIT_INDEX_FILE: join(other.dir, '.git', 'index') },
    });
    assert.equal(r.status, 0, r.stderr);
  });

  test('a malformed block type schema is reported against the block', () => {
    const components = tempDir('verstat-components-');
    writeFiles(components, {
      'fixture-bad/schema.json': JSON.stringify({ type: 'object', properties: { id: { pattern: '(' }, kind: { oneOf: [] } } }),
    });
    const page = edited((p) => { p.blocks.push({ id: 'b1', type: 'fixture-bad', kind: 1 }); });
    const r = run(['--components', components, 'validate', writePage(page)]);
    assertRejected(r, '$.blocks[2].id', /schema pattern \/\(\/ is not a valid regular expression/);
    assertRejected(r, '$.blocks[2].kind', /the schema lists no shapes/);
  });

  test('overlapping matches of find count as separate occurrences', () => {
    const own = makeRepo();
    writeFiles(own.dir, { 'src/braces.js': 'a() {\n}\n}\n}\n' });
    const sha = commit(own.dir, 'braces');
    const page = notePage({ dir: own.dir, sha });
    Object.assign(page.blocks[0].anchor, { path: 'src/braces.js', find: '}\n}' });
    assertRejected(validate(page), '$.blocks[0].anchor.find', /occurs 2 times/);
    page.blocks[0].anchor.nth = 2;
    const r = run(['build', writePage(page), '-o', join(tempDir('verstat-build-'), 'p.html')]);
    assert.equal(r.code, 0, r.stderr);
  });

  test('a 64-character sha passes the page schema', () => {
    const r = validate(edited((p) => { p.repos.target.sha = 'a'.repeat(64); }));
    assertRejected(r, '$.repos.target.sha', /commit a{64} not found/);
    assert.doesNotMatch(r.stderr, /must match/);
  });

  test('a repo name with ":" is rejected and an invalid sha is reported once', () => {
    const colon = validate(edited((p) => {
      p.repos['t:x'] = p.repos.target;
    }));
    assertRejected(colon, '$.repos["t:x"]', /must not contain ":"/);
    const head = validate(edited((p) => { p.repos.target.sha = 'HEAD'; }));
    assertRejected(head, '$.repos.target.sha', /must match/);
    assert.equal(head.stderr.trim().split('\n').length, 1, head.stderr);
  });

  test('a short sha shadowed by a branch of the same name is rejected', () => {
    const own = makeRepo();
    const short = own.sha.slice(0, 7);
    writeFiles(own.dir, { 'src/app.js': 'nothing here\n' });
    commit(own.dir, 'later');
    git(own.dir, 'branch', short);
    const page = notePage({ dir: own.dir, sha: short });
    assertRejected(validate(page), '$.repos.target.sha', /is not a commit id .*branch, a tag/);
    git(own.dir, 'branch', '-D', short);
    const r = run(['build', writePage(page), '-o', join(tempDir('verstat-build-'), 'p.html')]);
    assert.equal(r.code, 0, r.stderr);
  });

  test('an anchor without find is the whole file; the file must exist', () => {
    assert.equal(validate(edited((p) => { p.blocks[0].anchor = { repo: 'target', path: 'README.md' }; })).code, 0);
    assertRejected(validate(edited((p) => { p.blocks[0].anchor = { repo: 'target', path: 'docs/none.md' }; })), '$.blocks[0].anchor.path', /does not exist/);
  });

  test('an anchor into a binary file is rejected', () => {
    const own = makeRepo();
    writeFiles(own.dir, { 'img/logo.bin': 'PNG\0\0data' });
    const sha = commit(own.dir, 'binary');
    const page = notePage({ dir: own.dir, sha });
    page.blocks[0].anchor = { repo: 'target', path: 'img/logo.bin' };
    assertRejected(validate(page), '$.blocks[0].anchor.path', /is binary/);
  });

  test('find with findEnd is a range; findEnd must occur after find', () => {
    const ok = validate(edited((p) => { p.blocks[0].anchor.findEnd = '// line 55'; }));
    assert.equal(ok.code, 0, ok.stderr);
    assertRejected(validate(edited((p) => { p.blocks[0].anchor.findEnd = '// line 45'; })), '$.blocks[0].anchor.findEnd', /"\/\/ line 45" not found after "find"/);
  });

  test('a list find is several places in one file; every place must resolve', () => {
    const many = (find) => edited((p) => { p.blocks[0].anchor.find = find; });
    const ok = validate(many(['function start() {', { find: '// line 1', nth: 2 }, '  register(handler);']));
    assert.equal(ok.code, 0, ok.stderr);
    assertRejected(validate(many(['function start() {', 'nowhere()'])), '$.blocks[0].anchor.find[1]', /"nowhere\(\)" not found/);
    assertRejected(validate(many(['function start() {', '// line 1'])), '$.blocks[0].anchor.find[1]', /occurs \d+ times/);
    assertRejected(validate(many(['function start() {', { find: '// TODO cleanup', nth: 2 }])), '$.blocks[0].anchor.find[1].nth', /occurs only 1 time/);
  });

  test('nth and findEnd go only with a single find', () => {
    assertRejected(validate(edited((p) => { p.blocks[0].anchor = { repo: 'target', path: 'src/app.js', nth: 1 }; })), '$.blocks[0].anchor', /need a single "find"/);
    assertRejected(
      validate(edited((p) => { p.blocks[0].anchor.find = ['function start() {', '// TODO cleanup']; p.blocks[0].anchor.findEnd = 'x'; })),
      '$.blocks[0].anchor',
      /go with a single "find"/,
    );
  });

  test('a content check reads every line of a range', () => {
    const page = edited((p) => {
      p.blocks[1].claims[0].anchor.findEnd = '  const handler = makeHandler();';
      p.blocks[1].claims[0].symbol = 'makeHandler';
    });
    const r = validate(page, '--json');
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).inferred, []);
    page.blocks[1].claims[0].symbol = 'register';
    assert.match(JSON.parse(validate(page, '--json').stdout).inferred[0].reason, /src\/app\.js:50-70 does not contain symbol "register"/);
    page.blocks[1].claims[0].anchor = { repo: 'target', path: 'src/app.js' };
    page.blocks[1].claims[0].symbol = 'start';
    assert.match(JSON.parse(validate(page, '--json').stdout).inferred[0].reason, /anchored as a whole file, which confirms nothing/);
  });

  test('newlines around find do not move its line span', () => {
    const page = edited((p) => {
      p.blocks[0].anchor.find = '\nfunction start() {\n';
    });
    const r = run(['build', writePage(page), '-o', join(tempDir('verstat-build-'), 'p.html')]);
    assert.equal(r.code, 0, r.stderr);
    const html = readFileSync(join(r.stdout.match(/^wrote (.*)$/m)[1]), 'utf8');
    const data = JSON.parse(html.match(/id="verstat-page">(.*?)<\/script>/s)[1]);
    assert.deepEqual([data.blocks[0].anchor.line, data.blocks[0].anchor.endLine], [50, 50]);
  });

  test('replace refs do not change what the pinned sha reads as', () => {
    const own = makeRepo();
    const original = git(own.dir, 'rev-parse', `${own.sha}:src/app.js`);
    const forged = execFileSync('git', ['-C', own.dir, 'hash-object', '-w', '--stdin'], { input: 'forged claim here\n', encoding: 'utf8' }).trim();
    git(own.dir, 'replace', original, forged);
    const page = notePage(own);
    page.blocks[0].anchor.find = 'forged claim';
    assertRejected(validate(page), '$.blocks[0].anchor.find', /not found/);
  });

  test('a mistyped --components dir or an empty --repo dir is a usage error', () => {
    const missing = run(['validate', writePage(notePage(repo))], { components: join(tempDir(), 'nope') });
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /--components: no such directory/);
    const empty = validate(notePage(repo), '--repo', 'target=');
    assert.equal(empty.code, 2);
    assert.match(empty.stderr, /--repo expects <name>=<dir>/);
  });

  test('a bare clone is a valid checkout', () => {
    const bare = join(tempDir('verstat-bare-'), 'repo.git');
    execFileSync('git', ['clone', '-q', '--bare', repo.dir, bare]);
    const r = validate(notePage({ dir: bare, sha: repo.sha }));
    assert.equal(r.code, 0, r.stderr);
  });

  test('--repo works for a repo named __proto__', () => {
    const page = JSON.parse(JSON.stringify(notePage(repo)).replaceAll('"target"', '"__proto__"'));
    page.repos.__proto__.path = '/nonexistent';
    const r = validate(page, '--repo', `__proto__=${repo.dir}`);
    assert.equal(r.code, 0, r.stderr);
  });
});

function writeBlob(dir, i) {
  return writeObject(dir, `blob-${i}`, `${i}\n`);
}

function writeObject(dir, name, content) {
  const file = join(dir, '.git', name);
  writeFileSync(file, content);
  return file;
}
