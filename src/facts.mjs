import { Buffer } from 'node:buffer';
import { basename, extname } from 'node:path';
import { isGitRepo, tryGit } from './git.mjs';

const FACTS_GENERATED = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'Cargo.lock',
  'composer.lock', 'poetry.lock', 'Gemfile.lock',
]);
const FACTS_NOISE_TITLES = {
  imports: 'Imports',
  whitespace: 'Whitespace and formatting',
  generated: 'Generated files',
};
const FACTS_BODY_LINES = 60;
const FACTS_TITLE_CHARS = 80;
const FACTS_MIN_MOVED = 3;
const FACTS_MAX_SAME_KEY = 50;
const FACTS_INDENTED = new Set([
  '.py', '.yaml', '.yml', '.haml', '.pug', '.jade', '.slim', '.coffee', '.md', '.markdown', '.rst', '.hs', '.elm', '.fs',
  '.nim', '.sass', '.styl',
]);
const FACTS_CLOSER = /^(?:[)\]}>;,.\s]+|end|fi|done|esac|<\/[\w.-]+>)[;,)]*$/i;

const FACTS_GO_GROUP_LINE = /^\s*(?:[\w.]+\s+)?"[^"]+"\s*$/;
const FACTS_JS_EXTS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte'];
const FACTS_WRAPPED = [
  [FACTS_JS_EXTS, /^\s*(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{[^}]*$/, /\}\s*from\s*['"`]/],
  [['.py'], /^\s*from\s+\S+\s+import\s*\([^)]*$/, /^\s*\)\s*$/],
];
const FACTS_JS = /^\s*(?:import\b(?!\s*[(.])|export\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"`]|(?:(?:const|let|var)\s+[^=]+=\s*)?require\(\s*['"`])/;
const FACTS_IMPORTS = [
  [FACTS_JS_EXTS, [FACTS_JS]],
  [['.py'], [/^\s*(?:import\s+\S|from\s+\S+\s+import\b)/]],
  [['.java', '.kt', '.kts', '.scala'], [/^\s*import\s+\S/]],
  [['.go'], [/^\s*import\s*(?:[\w.]+\s+)?"[^"]*"\s*$/]],
  [['.php'], [/^use\s+[^;]+;\s*$/]],
  [['.rs'], [/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+[^;]+;\s*$/]],
  [['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.m', '.mm'], [/^\s*(?:#\s*(?:include|import)\b|@import\s)/]],
];

class FactsError extends Error {}

function factsGit(dir, args) {
  const r = tryGit(dir, ['-c', 'core.quotepath=false', '-c', 'diff.interHunkContext=0', '-c', 'diff.relative=false', ...args]);
  if (!r.ok) throw new Error(`git ${args[0]} failed in ${dir}`);
  return r.out.toString('utf8');
}

function factsRev(dir, rev) {
  if (rev === '' || rev.startsWith('-')) throw new FactsError(`bad revision "${rev}"`);
  const r = tryGit(dir, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  if (!r.ok) throw new FactsError(`unknown revision "${rev}"`);
  return r.out.toString('utf8').trim();
}

function factsRange(dir, range) {
  const usage = `expected a range <base>..<head> or <base>...<head>, got "${range}"`;
  if (typeof range !== 'string') throw new FactsError(usage);
  const three = range.split('...');
  const parts = three.length === 2 ? three : range.split('..');
  if (parts.length !== 2 || parts.some((p) => p === '' || p.includes('..'))) throw new FactsError(usage);
  const left = factsRev(dir, parts[0]);
  const head = factsRev(dir, parts[1]);
  if (three.length !== 2) return { base: left, head };
  const mb = tryGit(dir, ['merge-base', left, head]);
  if (!mb.ok) throw new FactsError(`"${parts[0]}" and "${parts[1]}" have no merge base`);
  return { base: mb.out.toString('utf8').trim(), head };
}

function factsCount(value) {
  return value === '-' ? 0 : Number(value);
}

function factsFiles(dir, base, head) {
  const numstat = factsGit(dir, ['diff', '--numstat', '--no-renames', '-z', '--no-ext-diff', '--no-textconv', base, head, '--']);
  const status = factsGit(dir, ['diff', '--name-status', '--no-renames', '-z', '--no-ext-diff', base, head, '--']);
  const kinds = new Map();
  const fields = status.split('\0');
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === '') break;
    kinds.set(fields[i + 1], { A: 'added', D: 'deleted' }[fields[i][0]] || 'modified');
  }
  return numstat.split('\0').filter((e) => e !== '').map((entry) => {
    const [add, del, ...rest] = entry.split('\t');
    const path = rest.join('\t');
    const file = { path, status: kinds.get(path) || 'modified', additions: factsCount(add), deletions: factsCount(del) };
    if (add === '-') file.binary = true;
    return file;
  });
}

function factsCommits(dir, base, head) {
  const out = factsGit(dir, ['log', '--no-show-signature', '--topo-order', '--reverse', '--no-renames', '--no-ext-diff', '--no-textconv', '--format=%x1e%H%x1f%h%x1f%P%x1f%s', '--numstat', `${base}..${head}`, '--']);
  const commits = out.split('\x1e').filter((c) => /^[0-9a-f]{40,64}\x1f/.test(c)).map((chunk) => {
    const [header, ...lines] = chunk.split('\n');
    const [sha, short, parents, subject] = header.split('\x1f');
    const commit = { sha, short, parents: parents.split(' ').filter(Boolean), subject, additions: 0, deletions: 0, files: [] };
    for (const line of lines) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      commit.additions += factsCount(m[1]);
      commit.deletions += factsCount(m[2]);
      commit.files.push(factsUnquote(m[3]));
    }
    return commit;
  });
  const listed = new Set(commits.map((c) => c.sha));
  const withMerged = [];
  for (const commit of commits) {
    for (const parent of commit.parents.slice(1)) {
      if (listed.has(parent)) continue;
      listed.add(parent);
      withMerged.push(factsExternal(dir, parent));
    }
    withMerged.push(commit);
  }
  return withMerged;
}

function factsExternal(dir, sha) {
  const [short, parents, subject] = factsGit(dir, ['log', '-1', '--no-show-signature', '--format=%h%x1f%P%x1f%s', sha, '--']).replace(/\n$/, '').split('\x1f');
  return { sha, short, parents: parents.split(' ').filter(Boolean), subject, external: true, additions: 0, deletions: 0, files: [] };
}

function factsUnquote(name) {
  if (!name.startsWith('"')) return name;
  const bytes = [];
  const s = Array.from(name.slice(1, -1));
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      bytes.push(...Buffer.from(s[i], 'utf8'));
      continue;
    }
    const next = s[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(s.slice(i, i + 3).join(''), 8));
      i += 2;
    } else bytes.push({ n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 }[next] ?? next.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

function factsParse(dir, base, head, context) {
  const out = factsGit(dir, [
    'diff', '--no-renames', `-U${context}`, '--no-color', '--no-ext-diff', '--no-textconv',
    '--src-prefix=a/', '--dst-prefix=b/', base, head, '--',
  ]);
  const hunks = [];
  let oldPath = null;
  let path = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('diff --git ')) {
      oldPath = null;
      path = null;
      hunk = null;
    } else if (!hunk && line.startsWith('--- ')) {
      const name = factsUnquote(line.slice(4).replace(/\t$/, ''));
      oldPath = name === '/dev/null' ? null : name.replace(/^a\//, '');
    } else if (!hunk && line.startsWith('+++ ')) {
      const name = factsUnquote(line.slice(4).replace(/\t$/, ''));
      path = name === '/dev/null' ? oldPath : name.replace(/^b\//, '');
    } else if (line.startsWith('@@ ')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!m || !path) continue;
      oldLine = Number(m[1]);
      newLine = Number(m[2]);
      hunk = { path, lines: [] };
      hunks.push(hunk);
    } else if (hunk && line.startsWith('-')) {
      hunk.lines.push({ sign: '-', text: line.slice(1), old: oldLine++ });
    } else if (hunk && line.startsWith('+')) {
      hunk.lines.push({ sign: '+', text: line.slice(1), new: newLine++ });
    } else if (hunk && line.startsWith(' ')) {
      hunk.lines.push({ sign: ' ', text: line.slice(1), old: oldLine++, new: newLine++ });
    }
  }
  return hunks;
}

function factsPatch(dir, base, head) {
  const hunks = [];
  for (const parsed of factsParse(dir, base, head, 0)) {
    let hunk = null;
    for (const line of parsed.lines) {
      if (line.sign === ' ') {
        hunk = null;
        continue;
      }
      if (!hunk) {
        hunk = { index: hunks.length, path: parsed.path, lines: [] };
        hunks.push(hunk);
      }
      hunk.lines.push({ ...line, key: line.text.trim(), hunk: hunk.index });
    }
  }
  return hunks;
}

export function diffHunks(dir, base, head, context) {
  const byPath = new Map();
  for (const hunk of factsParse(dir, base, head, context)) {
    if (!byPath.has(hunk.path)) byPath.set(hunk.path, []);
    byPath.get(hunk.path).push(hunk.lines);
  }
  return byPath;
}

function factsRuns(hunks, sign) {
  const runs = [];
  for (const hunk of hunks) {
    let run = null;
    for (const line of hunk.lines) {
      if (line.sign !== sign) {
        run = null;
        continue;
      }
      if (!run) {
        run = { hunk: hunk.index, path: hunk.path, lines: [] };
        runs.push(run);
      }
      run.lines.push(line);
    }
  }
  return runs;
}

function factsSolid(key) {
  return key.length > 2 && !FACTS_CLOSER.test(key);
}

function factsMatches(removed, added) {
  const positions = new Map();
  removed.forEach((run, r) => run.lines.forEach((line, i) => {
    if (!factsSolid(line.key) || line.used) return;
    if (!positions.has(line.key)) positions.set(line.key, []);
    positions.get(line.key).push([r, i]);
  }));
  const tried = (key) => {
    const starts = positions.get(key);
    return !!starts && starts.length <= FACTS_MAX_SAME_KEY;
  };
  const matches = [];
  added.forEach((run, a) => run.lines.forEach((line, j) => {
    if (line.used || !tried(line.key)) return;
    for (const [r, i] of positions.get(line.key)) {
      const from = removed[r];
      if (from.hunk === run.hunk) continue;
      let covered = false;
      for (let b = 1; i - b >= 0 && j - b >= 0; b++) {
        const x = from.lines[i - b];
        const y = run.lines[j - b];
        if (x.used || y.used || x.key !== y.key) break;
        if (tried(x.key)) {
          covered = true;
          break;
        }
      }
      if (covered) continue;
      let n = 0;
      let solid = 0;
      let end = 0;
      while (i + n < from.lines.length && j + n < run.lines.length) {
        const x = from.lines[i + n];
        const y = run.lines[j + n];
        if (x.used || y.used || x.key !== y.key) break;
        n++;
        if (x.key !== '') end = n;
        if (factsSolid(x.key)) solid++;
      }
      if (solid >= FACTS_MIN_MOVED) matches.push({ r, i, a, j, length: end });
    }
  }));
  return matches.sort((x, y) => y.length - x.length);
}

function factsBody(lines) {
  return lines.length > FACTS_BODY_LINES ? [...lines.slice(0, FACTS_BODY_LINES), '…'].join('\n') : lines.join('\n');
}

function factsTitle(text) {
  const t = text.trim();
  return t.length > FACTS_TITLE_CHARS ? `${t.slice(0, FACTS_TITLE_CHARS - 1)}…` : t;
}

function factsMoves(hunks) {
  const removed = factsRuns(hunks, '-');
  const added = factsRuns(hunks, '+');
  const moved = [];
  for (let taken = true; taken;) {
    taken = false;
    for (const best of factsMatches(removed, added)) {
      const from = removed[best.r].lines.slice(best.i, best.i + best.length);
      const to = added[best.a].lines.slice(best.j, best.j + best.length);
      if ([...from, ...to].some((line) => line.used)) continue;
      taken = true;
      for (const line of [...from, ...to]) line.used = 'moved';
      moved.push({
        id: `moved-${moved.length + 1}`,
        title: factsTitle(to.find((l) => l.text.trim() !== '').text),
        from: { path: removed[best.r].path, start: from[0].old, end: from[from.length - 1].old },
        to: { path: added[best.a].path, start: to[0].new, end: to[to.length - 1].new },
        lines: best.length,
        body: factsBody(to.map((l) => l.text)),
      });
    }
  }
  return moved;
}

function factsWhitespace(hunks) {
  for (const hunk of hunks) {
    const name = basename(hunk.path);
    const indented = FACTS_INDENTED.has(extname(name).toLowerCase()) || /^(?:GNU)?makefile$/i.test(name);
    const squash = (text) => (indented ? text.replace(/\s+$/, '') : text.trim());
    const free = hunk.lines.filter((l) => !l.used);
    const adds = free.filter((l) => l.sign === '+');
    let after = 0;
    for (const del of free.filter((l) => l.sign === '-')) {
      const key = squash(del.text);
      if (key === '') continue;
      const at = adds.findIndex((l, k) => k >= after && !l.used && squash(l.text) === key);
      if (at < 0) continue;
      del.used = 'whitespace';
      adds[at].used = 'whitespace';
      after = at + 1;
    }
    const rest = free.filter((l) => !l.used);
    if (!indented && rest.every((l) => l.text.trim() === '')) for (const line of rest) line.used = 'whitespace';
  }
}

function factsGoGroups(dir, rev, path) {
  const r = tryGit(dir, ['cat-file', 'blob', `${rev}:${path}`]);
  const inside = new Set();
  if (!r.ok) return inside;
  let open = false;
  r.out.toString('utf8').split('\n').forEach((text, i) => {
    if (open && /^\s*\)/.test(text)) open = false;
    else if (open) inside.add(i + 1);
    else if (/^\s*import\s*\(\s*(?:\/\/.*)?$/.test(text)) open = true;
  });
  return inside;
}

function factsWrapEnd(lines, k, closer) {
  for (let n = k + 1; n < lines.length && lines[n].sign === lines[k].sign; n++) {
    const code = lines[n].text.replace(/\s*(?:\/\/|#).*$/, '');
    if (closer.test(code)) return n;
    if (/[{}()]/.test(code)) return -1;
  }
  return -1;
}

function factsImports(hunks, dir, base, head) {
  const groups = new Map();
  const inGroup = (rev, path, n) => {
    const key = `${rev}:${path}`;
    if (!groups.has(key)) groups.set(key, factsGoGroups(dir, rev, path));
    return groups.get(key).has(n);
  };
  for (const hunk of hunks) {
    const ext = extname(hunk.path).toLowerCase();
    const rule = FACTS_IMPORTS.find(([exts]) => exts.includes(ext));
    if (!rule) continue;
    const wrapped = FACTS_WRAPPED.find(([exts]) => exts.includes(ext));
    let rest = 0;
    hunk.lines.forEach((line, k) => {
      if (rest > 0) {
        rest--;
        if (!line.used) line.used = 'imports';
        return;
      }
      if (wrapped && !line.used && wrapped[1].test(line.text.replace(/\s*(?:\/\/|#).*$/, ''))) {
        const close = factsWrapEnd(hunk.lines, k, wrapped[2]);
        if (close > k) {
          line.used = 'imports';
          rest = close - k;
          return;
        }
      }
      if (line.used) return;
      const grouped = ext === '.go' && FACTS_GO_GROUP_LINE.test(line.text)
        && (line.sign === '-' ? inGroup(base, hunk.path, line.old) : inGroup(head, hunk.path, line.new));
      if (grouped || rule[1].some((re) => re.test(line.text))) line.used = 'imports';
    });
  }
}

function factsNoiseItem(kind, hunks) {
  const paths = [];
  const text = [];
  let lines = 0;
  for (const hunk of hunks) {
    const mine = hunk.lines.filter((l) => l.used === kind);
    if (!mine.length) continue;
    if (paths[paths.length - 1] !== hunk.path) text.push(hunk.path);
    if (!paths.includes(hunk.path)) paths.push(hunk.path);
    for (const l of mine) text.push(`${l.sign} ${l.text}`);
    lines += mine.length;
  }
  if (!lines) return null;
  return { id: `noise-${kind}`, kind, title: FACTS_NOISE_TITLES[kind], paths, lines, body: factsBody(text) };
}

export function diffLines(dir, base, head) {
  const files = factsFiles(dir, base, head);
  const hunks = factsPatch(dir, base, head);
  for (const hunk of hunks) {
    if (FACTS_GENERATED.has(basename(hunk.path))) for (const line of hunk.lines) line.used = 'generated';
  }
  const moved = factsMoves(hunks.filter((h) => !FACTS_GENERATED.has(basename(h.path))));
  const status = new Map(files.map((f) => [f.path, f.status]));
  const edited = hunks.filter((h) => status.get(h.path) === 'modified');
  factsWhitespace(edited);
  factsImports(edited, dir, base, head);
  const noise = ['imports', 'whitespace', 'generated'].map((kind) => factsNoiseItem(kind, hunks)).filter(Boolean);
  return { files, hunks, moved, noise };
}

export function isGenerated(path) {
  return FACTS_GENERATED.has(basename(path));
}

export function diffFacts(dir, range) {
  if (!isGitRepo(dir)) throw new FactsError(`${dir} is not a git repository`);
  const { base, head } = factsRange(dir, range);
  const commits = factsCommits(dir, base, head);
  const { files, moved, noise } = diffLines(dir, base, head);
  return {
    range,
    base,
    head,
    files,
    commits,
    moved,
    noise,
    totals: {
      additions: files.reduce((n, f) => n + f.additions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
      moved: moved.reduce((n, m) => n + m.lines, 0),
      noise: noise.reduce((n, m) => n + m.lines, 0),
    },
  };
}

export function isFactsError(err) {
  return err instanceof FactsError;
}
