import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const gitEnvs = new Map();
const CHUNK_BYTES = 64 * 1024 * 1024;
const REPO_SELECTING_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX', 'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM',
];

function plainEnv(base) {
  const env = { ...base };
  for (const name of REPO_SELECTING_VARS) delete env[name];
  return env;
}

function filterNames(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'config', '-z', '--get-regexp', '^filter\\.'], {
      env: plainEnv(process.env),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString('utf8');
    return out
      .split('\0')
      .map((entry) => entry.split('\n')[0].match(/^filter\.(.+)\.[^.]+$/))
      .filter(Boolean)
      .map((m) => m[1]);
  } catch {
    return [];
  }
}

export function gitEnv(names, base = process.env) {
  const settings = [['core.fsmonitor', 'false']];
  for (const name of new Set(names)) {
    for (const key of ['clean', 'smudge', 'process']) settings.push([`filter.${name}.${key}`, '']);
    settings.push([`filter.${name}.required`, 'false']);
  }
  const first = Number.parseInt(base.GIT_CONFIG_COUNT, 10) || 0;
  const env = { ...plainEnv(base), GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_COUNT: String(first + settings.length) };
  settings.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${first + i}`] = key;
    env[`GIT_CONFIG_VALUE_${first + i}`] = value;
  });
  return env;
}

function git(dir, args, input) {
  if (!gitEnvs.has(dir)) gitEnvs.set(dir, gitEnv(filterNames(dir)));
  return execFileSync('git', ['-C', dir, ...args], {
    input,
    env: gitEnvs.get(dir),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 1024,
  });
}

export function tryGit(dir, args, input) {
  try {
    return { ok: true, out: git(dir, args, input) };
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('git is not installed or not on PATH');
    return { ok: false, out: null };
  }
}

export function isBareRepo(dir) {
  const r = tryGit(dir, ['rev-parse', '--is-bare-repository']);
  return r.ok && r.out.toString('utf8').trim() === 'true';
}

export function isGitRepo(dir) {
  return tryGit(dir, ['rev-parse', '--git-dir']).ok;
}

export function commitStatus(dir, sha) {
  const found = tryGit(dir, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
  const oid = found.ok ? found.out.toString('utf8').trim() : null;
  if (oid && oid.startsWith(sha)) return { status: 'ok', oid };
  if (oid) return { status: 'shadowed', oid: null };
  const r = tryGit(dir, ['rev-parse', `--disambiguate=${sha}`]);
  const candidates = r.ok ? r.out.toString('utf8').split('\n').filter((l) => l.trim() !== '') : [];
  const types = candidates.length
    ? tryGit(dir, ['cat-file', '--batch-check=%(objecttype)'], `${candidates.join('\n')}\n`)
    : { ok: false };
  const commits = types.ok ? types.out.toString('utf8').split('\n').filter((t) => t === 'commit').length : 0;
  return { status: commits > 1 ? 'ambiguous' : 'missing', oid: null };
}

export function readFileAt(dir, sha, path) {
  const clean = path.replace(/^\.\//, '');
  const r = tryGit(dir, ['cat-file', 'blob', `${sha}:${clean}`]);
  return r.ok ? r.out.toString('utf8') : null;
}

function worktreeEntry(file) {
  try {
    const stat = lstatSync(file);
    return { link: stat.isSymbolicLink(), size: stat.size };
  } catch {
    return null;
  }
}

function worktreeBytes(file, link) {
  try {
    return link ? Buffer.from(readlinkSync(file)) : readFileSync(file);
  } catch {
    return null;
  }
}

export function dirtyFiles(dir) {
  const top = tryGit(dir, ['rev-parse', '--show-toplevel']);
  const listed = tryGit(dir, ['diff-index', '--ignore-submodules=dirty', '--name-only', '-z', 'HEAD', '--']);
  if (!top.ok || !listed.ok) return null;
  const root = top.out.toString('utf8').trim();
  const paths = listed.out.toString('utf8').split('\0').filter((p) => p !== '');
  const dirty = paths.filter((p) => p.includes('\n'));
  const candidates = paths.filter((p) => !p.includes('\n'));
  if (candidates.length === 0) return dirty;

  const checked = tryGit(dir, ['cat-file', '--batch-check'], `${candidates.map((p) => `HEAD:${p}`).join('\n')}\n`);
  if (!checked.ok) return null;
  const sizes = checked.out.toString('utf8').split('\n');
  const chunks = [[]];
  let budget = 0;
  candidates.forEach((p, i) => {
    const m = sizes[i] && sizes[i].match(/^[0-9a-f]+ blob (\d+)$/);
    const entry = m ? worktreeEntry(join(root, p)) : null;
    const size = m ? Number(m[1]) : -1;
    if (!entry || entry.size !== size) {
      dirty.push(p);
      return;
    }
    if (budget + size > CHUNK_BYTES && chunks[chunks.length - 1].length) {
      chunks.push([]);
      budget = 0;
    }
    chunks[chunks.length - 1].push([p, entry.link]);
    budget += size;
  });

  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const read = tryGit(dir, ['cat-file', '--batch'], `${chunk.map(([p]) => `HEAD:${p}`).join('\n')}\n`);
    if (!read.ok) return null;
    let at = 0;
    for (const [p, link] of chunk) {
      const eol = read.out.indexOf(10, at);
      const size = Number(read.out.toString('utf8', at, eol).split(' ')[2]);
      const committed = read.out.subarray(eol + 1, eol + 1 + size);
      at = eol + 1 + size + 1;
      const current = worktreeBytes(join(root, p), link);
      if (!current || !current.equals(committed)) dirty.push(p);
    }
  }
  return dirty;
}
