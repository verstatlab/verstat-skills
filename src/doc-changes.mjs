import { formatPath, hasOwn } from './jsonschema.mjs';
import { diffHunks } from './facts.mjs';
import { commitStatus, readFileAt } from './git.mjs';

export const DOC_CONTEXT = 3;
export const DOC_VERSION_LINES = 4000;
const DOC_PATH = /\.(?:md|markdown)$/i;
const DOC_KINDS = { '+': 'add', '-': 'del', ' ': 'context' };

function docIsObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function docVersion(dir, oid, path) {
  const text = readFileAt(dir, oid, path);
  if (text === null) return null;
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length > DOC_VERSION_LINES ? undefined : lines;
}

function docLine(l) {
  const line = { kind: DOC_KINDS[l.sign], text: l.text };
  if (l.old !== undefined) line.old = l.old;
  if (l.new !== undefined) line.new = l.new;
  return line;
}

export function docDiffs(page, repoState, errors) {
  const docs = new Map();
  const err = (segments, message) => errors.push({ path: formatPath(segments), message });
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const repos = docIsObject(page.repos) ? page.repos : {};
  blocks.forEach((block, b) => {
    if (!docIsObject(block) || block.type !== 'doc-changes' || !Array.isArray(block.files)) return;
    if (typeof block.repo !== 'string' || typeof block.base !== 'string') return;
    for (const key of ['repo', 'base']) {
      if (!hasOwn(repos, block[key])) err(['blocks', b, key], `repo "${block[key]}" is not declared in "repos"`);
    }
    if (!hasOwn(repos, block.repo) || !hasOwn(repos, block.base)) return;
    const head = repoState.get(block.repo);
    if (!head || !head.ok) return;
    const baseSha = docIsObject(repos[block.base]) ? repos[block.base].sha : null;
    const found = typeof baseSha === 'string' ? commitStatus(head.dir, baseSha) : { status: 'missing' };
    if (found.status !== 'ok') {
      err(['blocks', b, 'base'], `base sha ${baseSha} not found in the ${block.repo} checkout (${head.dir}); fetch it there`);
      return;
    }

    const hunksByPath = diffHunks(head.dir, found.oid, head.oid, DOC_CONTEXT);
    const data = { files: new Map(), fragments: new Map() };
    const listed = new Map();
    block.files.forEach((file, f) => {
      if (!docIsObject(file) || typeof file.path !== 'string') return;
      const at = ['blocks', b, 'files', f, 'path'];
      if (listed.has(file.path)) {
        err(at, `"${file.path}" is listed twice (also files[${listed.get(file.path)}])`);
        return;
      }
      listed.set(file.path, f);
      if (!DOC_PATH.test(file.path)) {
        err(at, `"${file.path}" is not a Markdown file (.md, .markdown); show code in the blocks for code`);
        return;
      }
      const raw = hunksByPath.get(file.path);
      if (!raw) {
        err(at, `"${file.path}" is not changed between ${block.base} and ${block.repo}`);
        return;
      }
      const hunks = raw.map((lines) => ({ lines: lines.map(docLine) }));
      const old = docVersion(head.dir, found.oid, file.path);
      const now = docVersion(head.dir, head.oid, file.path);
      const all = hunks.flatMap((h) => h.lines);
      const diff = {
        status: old === null ? 'added' : now === null ? 'deleted' : 'modified',
        additions: all.filter((l) => l.kind === 'add').length,
        deletions: all.filter((l) => l.kind === 'del').length,
        old: old || null,
        new: now || null,
        hunks,
      };
      if (old === undefined || now === undefined) diff.large = true;
      data.files.set(f, diff);

      const taken = new Map();
      (Array.isArray(file.fragments) ? file.fragments : []).forEach((fragment, j) => {
        if (!docIsObject(fragment) || typeof fragment.find !== 'string' || fragment.find === '') return;
        const where = ['blocks', b, 'files', f, 'fragments', j, 'find'];
        const hits = hunks.map((h, k) => (h.lines.some((l) => l.text.includes(fragment.find)) ? k : -1)).filter((k) => k >= 0);
        if (hits.length === 0) {
          err(where, `${JSON.stringify(fragment.find)} is in no changed fragment of "${file.path}" (a changed line or the ${DOC_CONTEXT} lines around it)`);
          return;
        }
        if (hits.length > 1) {
          err(where, `${JSON.stringify(fragment.find)} is in ${hits.length} fragments of "${file.path}"; give a longer text from one of them`);
          return;
        }
        if (taken.has(hits[0])) {
          err(where, `fragments[${taken.get(hits[0])}] already describes this fragment of "${file.path}"`);
          return;
        }
        taken.set(hits[0], j);
        data.fragments.set(`${f}:${j}`, hits[0]);
      });
    });
    if (typeof block.id === 'string') docs.set(block.id, data);
  });
  return docs;
}
