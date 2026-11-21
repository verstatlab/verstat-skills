import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { pageStrings } from '../src/build.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = join(ROOT, 'bin', 'verstat.mjs');
export const FIXTURE_COMPONENTS = join(ROOT, 'test', 'fixtures', 'components');

const temps = [];
process.on('exit', () => cleanup());

export function tempDir(prefix = 'verstat-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

export function cleanup() {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
}

export function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

export function commit(dir, message = 'commit') {
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

export function appSource() {
  const lines = [];
  for (let n = 1; n <= 120; n++) {
    if (n === 50) lines.push('function start() {');
    else if (n === 70) lines.push('  const handler = makeHandler();');
    else if (n === 90) lines.push('  register(handler);');
    else if (n === 100) lines.push('// TODO cleanup');
    else lines.push(`// line ${n}`);
  }
  return `${lines.join('\n')}\n`;
}

export function makeRepo() {
  const dir = tempDir('verstat-repo-');
  git(dir, 'init', '-q');
  writeFiles(dir, { 'src/app.js': appSource(), 'README.md': '# target\n' });
  const sha = commit(dir, 'initial');
  return { dir, sha };
}

export function notePage(repo) {
  return {
    schema: 'verstat.page/1',
    skill: 'explain',
    question: 'How does the app start?',
    repos: { target: { sha: repo.sha, path: repo.dir } },
    glossary: [{ term: 'start', definition: 'The entry point.', anchor: { repo: 'target', path: 'src/app.js', find: 'function start() {' } }],
    blocks: [
      {
        id: 'n1',
        type: 'fixture-note',
        title: 'Entry',
        text: 'The app starts here.',
        anchor: { repo: 'target', path: 'src/app.js', find: 'function start() {' },
      },
      {
        id: 'n2',
        type: 'fixture-note',
        text: 'Claims about the start.',
        claims: [
          { id: 'p1', text: 'start is a plain function', symbol: 'start', anchor: { repo: 'target', path: 'src/app.js', find: 'function start() {' }, source: 'code' },
        ],
      },
    ],
    route: [
      { block: 'n1', minutes: 1, why: 'The answer.', modes: ['short', 'full'] },
      { block: 'n2', focus: 'p1', minutes: 2, why: 'The detail.', modes: ['full'] },
    ],
    openQuestions: ['Is start called twice?'],
  };
}

export function graphPage(repo) {
  return {
    schema: 'verstat.page/1',
    skill: 'explain',
    question: 'What calls what?',
    repos: { target: { sha: repo.sha, path: repo.dir } },
    blocks: [
      {
        id: 'g1',
        type: 'fixture-graph',
        nodes: [
          { id: 'a', label: 'start', anchor: { repo: 'target', path: 'src/app.js', find: 'function start() {' } },
          { id: 'b', label: 'handler' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    ],
  };
}

export function writePage(page, dir = tempDir('verstat-page-')) {
  const file = join(dir, 'page.json');
  writeFileSync(file, JSON.stringify(page, null, 2));
  return file;
}

export function run(args, { bin = BIN, cwd = ROOT, components = FIXTURE_COMPONENTS } = {}) {
  const full = components ? ['--components', components, ...args] : args;
  const r = spawnSync(process.execPath, [bin, ...full], { cwd, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function i18n(lang = 'en') {
  const strings = JSON.stringify(pageStrings(ROOT, lang));
  const window = {};
  const document = { getElementById: (id) => (id === 'verstat-strings' ? { textContent: strings } : null) };
  new Function('window', 'document', readFileSync(join(ROOT, 'client', 'i18n.js'), 'utf8'))(window, document);
  const { t, plural } = window.verstat;
  return { t, plural };
}
