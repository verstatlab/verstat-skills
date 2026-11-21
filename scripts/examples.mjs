import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = join(root, 'examples', 'src');
const READY = '.examples-ready';
// The user's git config (hooks, am.* settings) must not change the replayed commits' shas.
const REPLAY_ENV = {
  GIT_COMMITTER_NAME: 'Verstat Lab',
  GIT_COMMITTER_EMAIL: 'verstatlab@gmail.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(dir, args, env) {
  return execFileSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 30,
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();
}

function has(dir, sha) {
  try {
    git(dir, ['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  }
  catch {
    return false;
  }
}

// Without the marker an entry was left half-made by an interrupted run, so it is made again.
function create(dir, steps) {
  if (existsSync(join(dir, READY))) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    steps();
    writeFileSync(join(dir, READY), '');
  }
  catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return dir;
}

function clone(cache, remote) {
  const dir = join(cache, 'remotes', remote.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_'));
  return create(dir, () => {
    git(dir, ['init', '-q', '--bare']);
    git(dir, ['remote', 'add', 'origin', remote]);
    git(dir, ['config', 'remote.origin.promisor', 'true']);
    git(dir, ['config', 'remote.origin.partialclonefilter', 'blob:none']);
  });
}

// The engine reads git with lazy fetching off: prefetch every blob of the diffed range.
function fetchRemote(dir, shas, range) {
  const missing = shas.filter((sha) => !has(dir, sha));
  if (missing.length) git(dir, ['fetch', '-q', '--filter=blob:none', 'origin', ...missing]);
  if (range) git(dir, ['log', '-p', '--format=%H', range]);
}

function replay(cache, name, patches) {
  const files = readdirSync(patches).filter((f) => f.endsWith('.patch')).sort().map((f) => join(patches, f));
  const digest = createHash('sha256');
  for (const file of files) digest.update(readFileSync(file));
  const dir = join(cache, 'replayed', `${name}-${digest.digest('hex').slice(0, 12)}`);
  return create(dir, () => {
    git(dir, ['init', '-q', '-b', 'main', '--template='], REPLAY_ENV);
    git(dir, ['am', '-q', '--keep-cr', '--committer-date-is-author-date', ...files], REPLAY_ENV);
  });
}

function headOf(dir) {
  try {
    return git(dir, ['rev-parse', 'HEAD']);
  }
  catch {
    return null;
  }
}

function checkout(cache, store, name, sha) {
  const dir = join(cache, 'checkouts', `${name.replace(/[^\w.-]+/g, '_')}-${sha.slice(0, 12)}`);
  if (existsSync(dir) && headOf(dir) === sha) return dir;
  rmSync(dir, { recursive: true, force: true });
  git(store, ['worktree', 'prune']);
  git(store, ['worktree', 'add', '-q', '--detach', dir, sha]);
  return dir;
}

function build(name, cache) {
  const pageFile = join(sources, name, 'page.json');
  const page = JSON.parse(readFileSync(pageFile, 'utf8'));
  const repoArgs = [];
  const byRemote = new Map();
  for (const [repo, { remote, sha }] of Object.entries(page.repos)) {
    const key = remote ?? '';
    if (!byRemote.has(key)) byRemote.set(key, []);
    byRemote.get(key).push({ repo, sha });
  }
  for (const [remote, repos] of byRemote) {
    let store;
    if (remote) {
      store = clone(cache, remote);
      const base = repos.find((r) => r.repo.endsWith('@base'));
      const head = repos.find((r) => !r.repo.endsWith('@base'));
      fetchRemote(store, repos.map((r) => r.sha), base && head ? `${base.sha}..${head.sha}` : null);
    }
    else {
      store = replay(cache, name, join(sources, name, 'patches'));
    }
    for (const { repo, sha } of repos) {
      if (!has(store, sha)) throw new Error(`${name}: ${repo} pins ${sha}, which ${remote || 'the replayed patches'} does not have`);
      repoArgs.push('--repo', `${repo}=${checkout(cache, store, repo, sha)}`);
    }
  }
  const out = join(root, 'examples', `${name}.html`);
  const run = spawnSync(process.execPath, [join(root, 'bin', 'verstat.mjs'), 'build', pageFile, '-o', out, ...repoArgs], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`${name}: the build failed (exit ${run.status})`);
  console.log(`built examples/${name}.html`);
}

const args = process.argv.slice(2);
let cache = join(tmpdir(), 'verstat-examples');
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cache') {
    if (!args[i + 1]) {
      console.error('--cache needs a directory');
      process.exit(2);
    }
    cache = resolve(args[++i]);
  }
  else names.push(args[i]);
}
const all = readdirSync(sources, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const name of names.length ? names : all) {
  if (!all.includes(name)) {
    console.error(`unknown example: ${name} (have: ${all.join(', ')})`);
    process.exit(2);
  }
  try {
    build(name, cache);
  }
  catch (err) {
    console.error(String(err.stderr || err.message).trim());
    process.exit(1);
  }
}
