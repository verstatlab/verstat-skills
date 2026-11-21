import { formatPath, hasOwn } from './jsonschema.mjs';
import { diffHunks, diffLines, isGenerated } from './facts.mjs';
import { commitStatus, readFileAt } from './git.mjs';

export const CHANGES_FRAGMENT_LINES = 400;
export const CHANGES_BLOCK_LINES = 8000;
const CHANGES_CONTEXT = 3;
const CHANGES_PAD = 2;
const CHANGES_KINDS = { '+': 'add', '-': 'del', ' ': 'context' };
const CHANGES_LISTED_MISSING = 5;

function chIsObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function chKey(line) {
  return line.sign === '-' ? `o${line.old}` : `n${line.new}`;
}

function chLineLabel(line) {
  return line.sign === '-' ? `−${line.old}` : `+${line.new}`;
}

function chPositions(lines, side) {
  const own = side === 'old' ? 'old' : 'new';
  const out = new Array(lines.length);
  let next = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i][own] !== undefined) next = lines[i][own];
    out[i] = lines[i][own] !== undefined ? lines[i][own] : next;
  }
  let prev = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][own] !== undefined) prev = lines[i][own];
    else if (out[i] === null) out[i] = prev === null ? 1 : prev + 1;
  }
  return out;
}

function chSelect(hunks, span, side) {
  const runs = [];
  for (const lines of hunks) {
    let from = -1;
    let to = -1;
    if (!span) {
      from = 0;
      to = lines.length - 1;
    } else {
      const pos = chPositions(lines, side);
      pos.forEach((p, i) => {
        if (p < span[0] || p > span[1]) return;
        if (from < 0) from = i;
        to = i;
      });
      if (from < 0 || !lines.slice(from, to + 1).some((l) => l.sign !== ' ')) continue;
      for (let n = 0; n < CHANGES_PAD && from > 0 && lines[from - 1].sign === ' '; n++) from--;
      for (let n = 0; n < CHANGES_PAD && to < lines.length - 1 && lines[to + 1].sign === ' '; n++) to++;
    }
    runs.push(lines.slice(from, to + 1));
  }
  return runs;
}

function chOut(line) {
  const out = { kind: CHANGES_KINDS[line.sign], text: line.text };
  if (line.old !== undefined) out.old = line.old;
  if (line.new !== undefined) out.new = line.new;
  return out;
}

function chResolve(at, ctx, segments) {
  const { text, where, resolveAnchor, err } = ctx;
  if (text === null) {
    err(segments, ctx.side === 'old'
      ? `"${where}" does not exist at the base: the change adds it; leave "side": "base" out`
      : `"${where}" does not exist at the head: the change deletes it; use "side": "base"`);
    return null;
  }
  const r = resolveAnchor(text, { find: at.find, findEnd: at.findEnd, nth: at.nth }, where);
  if (!r.spans) {
    err([...segments, ...r.field], r.message);
    return null;
  }
  return r.spans[0];
}

function chPlace(at) {
  return chIsObject(at) && typeof at.find === 'string' && at.find !== '';
}

function chPairDiff(page, repoState, repo, base, cache) {
  const key = `${repo}\0${base}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  const repos = chIsObject(page.repos) ? page.repos : {};
  const head = repoState.get(repo);
  const baseRepo = repos[base];
  if (head && head.ok && chIsObject(baseRepo) && typeof baseRepo.sha === 'string') {
    const found = commitStatus(head.dir, baseRepo.sha);
    if (found.status !== 'ok') {
      out = { error: `base sha ${baseRepo.sha} not found in the ${repo} checkout (${head.dir}); fetch it there` };
    } else {
      const diff = diffLines(head.dir, found.oid, head.oid);
      const byPath = new Map();
      for (const hunk of diff.hunks) {
        if (!byPath.has(hunk.path)) byPath.set(hunk.path, []);
        byPath.get(hunk.path).push(...hunk.lines);
      }
      const real = new Set();
      const realLines = new Map();
      for (const file of diff.files) {
        const lines = byPath.get(file.path) || [];
        if (file.binary || lines.length === 0 || lines.some((l) => !l.used)) real.add(file.path);
        realLines.set(file.path, lines.filter((l) => !l.used));
      }
      out = {
        head,
        baseOid: found.oid,
        files: new Map(diff.files.map((f) => [f.path, f])),
        real,
        realLines,
        hunks: diffHunks(head.dir, found.oid, head.oid, CHANGES_CONTEXT),
      };
    }
  }
  cache.set(key, out);
  return out;
}

function chPairs(page) {
  const repos = chIsObject(page.repos) ? page.repos : {};
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const pairs = new Map();
  const add = (repo, base) => {
    if (!hasOwn(repos, repo) || !hasOwn(repos, base)) return;
    if (!pairs.has(repo)) pairs.set(repo, new Set());
    pairs.get(repo).add(base);
  };
  for (const block of blocks) {
    if (chIsObject(block) && block.type === 'changes' && typeof block.repo === 'string' && typeof block.base === 'string') add(block.repo, block.base);
  }
  if (page.skill === 'explain-pr') for (const name of Object.keys(repos)) add(name, `${name}@base`);
  return pairs;
}

function chIsFragmentTest(a, blocks) {
  const s = a.segments;
  return s.length === 8 && s[0] === 'blocks' && s[2] === 'files' && s[4] === 'fragments' && s[6] === 'test' && s[7] === 'anchor'
    && chIsObject(blocks[s[1]]) && blocks[s[1]].type === 'changes';
}

function chPathOf(entry) {
  if (typeof entry === 'string') return entry;
  if (chIsObject(entry) && typeof entry.path === 'string') return entry.path;
  return null;
}

function chCovered(page, anchors, repo, pairCount) {
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const covered = new Set();
  blocks.forEach((block) => {
    if (!chIsObject(block) || !Array.isArray(block.files)) return;
    const mine = block.repo === repo || (block.repo === undefined && pairCount === 1);
    if (block.type === 'doc-changes' && mine) {
      for (const f of block.files) if (chPathOf(f) !== null) covered.add(chPathOf(f));
    }
    if (block.type === 'test-coverage' && block.mode === 'diff') {
      for (const f of block.files) {
        const p = chPathOf(f);
        const r = chIsObject(f) && typeof f.repo === 'string' ? f.repo : undefined;
        if (p !== null && (r === repo || (r === undefined && pairCount === 1))) covered.add(p);
      }
    }
  });
  for (const a of anchors) if (chIsFragmentTest(a, blocks) && a.repo === repo) covered.add(a.file);
  return covered;
}

function chTestCoverage(page, errors, pairs, diffs) {
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const err = (segments, message) => errors.push({ path: formatPath(segments), message });
  blocks.forEach((block, b) => {
    if (!chIsObject(block) || block.type !== 'test-coverage') return;
    if (block.mode !== 'diff') {
      if (!Array.isArray(block.behaviors)) err(['blocks', b], '"behaviors" is required unless "mode" is "diff"');
      if (block.files !== undefined) err(['blocks', b, 'files'], '"files" goes with "mode": "diff"');
      return;
    }
    if (block.behaviors !== undefined) err(['blocks', b, 'behaviors'], 'in "mode": "diff" the rows come from the fragments of the "changes" blocks; leave "behaviors" out');
    if (!Array.isArray(block.files)) {
      err(['blocks', b], '"mode": "diff" needs "files": the test files the change touches (may be empty)');
      return;
    }
    block.files.forEach((f, i) => {
      const path = chPathOf(f);
      if (path === null) return;
      const repo = chIsObject(f) && typeof f.repo === 'string' ? f.repo : (pairs.size === 1 ? [...pairs.keys()][0] : null);
      if (pairs.size === 0) {
        err(['blocks', b, 'files', i], 'this page diffs no repo: "mode": "diff" needs a "changes" block or an explain-pr page with <name>@base');
        return;
      }
      if (repo === null) {
        err(['blocks', b, 'files', i], 'the page diffs more than one repo; give the file its "repo"');
        return;
      }
      if (!pairs.has(repo)) {
        err(['blocks', b, 'files', i], `repo "${repo}" has no diff on this page`);
        return;
      }
      const changed = [...pairs.get(repo)].some((base) => {
        const d = diffs(repo, base);
        return !d || d.error || d.files.has(path);
      });
      if (!changed) err(['blocks', b, 'files', i], `"${path}" is not changed in ${repo}`);
    });
  });
}

export function changesDiffs(page, repoState, anchors, errors, { resolveAnchor }) {
  const result = new Map();
  const err = (segments, message) => errors.push({ path: formatPath(segments), message });
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const repos = chIsObject(page.repos) ? page.repos : {};
  const cache = new Map();
  const diffs = (repo, base) => chPairDiff(page, repoState, repo, base, cache);
  const texts = new Map();
  const textAt = (dir, oid, path) => {
    const key = `${oid}:${path}`;
    if (!texts.has(key)) texts.set(key, readFileAt(dir, oid, path));
    return texts.get(key);
  };
  const layered = new Map();

  blocks.forEach((block, b) => {
    if (!chIsObject(block) || block.type !== 'changes' || !Array.isArray(block.files)) return;
    if (typeof block.repo !== 'string' || typeof block.base !== 'string') return;
    for (const key of ['repo', 'base']) {
      if (!hasOwn(repos, block[key])) err(['blocks', b, key], `repo "${block[key]}" is not declared in "repos"`);
    }
    if (!hasOwn(repos, block.repo) || !hasOwn(repos, block.base)) return;
    const diff = diffs(block.repo, block.base);
    if (!diff) return;
    if (diff.error) {
      err(['blocks', b, 'base'], diff.error);
      return;
    }
    const { head } = diff;
    const data = { files: new Map() };
    let budget = CHANGES_BLOCK_LINES;
    const seen = new Map();

    block.files.forEach((file, f) => {
      if (!chIsObject(file) || typeof file.path !== 'string') return;
      const at = ['blocks', b, 'files', f];
      if (seen.has(file.path)) {
        err([...at, 'path'], `"${file.path}" is listed twice (also files[${seen.get(file.path)}])`);
        return;
      }
      seen.set(file.path, f);
      const layerKey = `${block.repo}\0${file.path}`;
      if (layered.has(layerKey)) {
        err([...at, 'path'], `"${file.path}" is already in the layer "${layered.get(layerKey)}"; a file is in one layer`);
        return;
      }
      layered.set(layerKey, typeof block.id === 'string' ? block.id : `blocks[${b}]`);
      const changed = diff.files.get(file.path);
      if (!changed) {
        err([...at, 'path'], `"${file.path}" is not changed between ${block.base} and ${block.repo}`);
        return;
      }
      const out = { diff: { status: changed.status, additions: changed.additions, deletions: changed.deletions }, fragments: new Map(), notes: new Map() };
      data.files.set(f, out);
      const fragments = Array.isArray(file.fragments) ? file.fragments : [];
      if (changed.binary || isGenerated(file.path)) {
        out.diff[changed.binary ? 'binary' : 'generated'] = true;
        fragments.forEach((_, k) => err([...at, 'fragments', k], `"${file.path}" is ${changed.binary ? 'binary' : 'a generated lock file'}: it has no lines to split; leave "fragments" empty`));
        return;
      }
      const hunks = diff.hunks.get(file.path) || [];
      const claimed = new Map();
      const ctx = { resolveAnchor, err };
      fragments.forEach((fragment, k) => {
        if (!chIsObject(fragment)) return;
        const fat = [...at, 'fragments', k];
        let span = null;
        let side = 'new';
        if (fragment.at !== undefined) {
          if (!chPlace(fragment.at)) return;
          side = fragment.at.side === 'base' ? 'old' : 'new';
          const oid = side === 'old' ? diff.baseOid : head.oid;
          span = chResolve(fragment.at, { ...ctx, text: textAt(head.dir, oid, file.path), where: `${side === 'old' ? block.base : block.repo}:${file.path}`, side }, [...fat, 'at']);
          if (!span) return;
        }
        const runs = chSelect(hunks, span, side);
        const all = runs.flat();
        const keys = all.filter((l) => l.sign !== ' ').map(chKey);
        if (!keys.length) {
          err(fragment.at !== undefined ? [...fat, 'at'] : fat, `the fragment covers no changed line of "${file.path}"; its lines must take in at least one added or removed line`);
          return;
        }
        const clash = keys.find((key) => claimed.has(key));
        if (clash) {
          const line = all.find((l) => l.sign !== ' ' && chKey(l) === clash);
          err(fat, `changed line ${chLineLabel(line)} of "${file.path}" is also in fragment "${claimed.get(clash)}"; fragments do not overlap`);
          return;
        }
        for (const key of keys) claimed.set(key, typeof fragment.id === 'string' ? fragment.id : `fragments[${k}]`);

        if (typeof fragment.commit === 'string' && /^[0-9a-f]{7,64}$/.test(fragment.commit) && commitStatus(head.dir, fragment.commit).status !== 'ok') {
          err([...fat, 'commit'], `commit ${fragment.commit} not found in the ${block.repo} checkout`);
        }

        const selOld = new Set(all.filter((l) => l.old !== undefined && l.sign !== '+').map((l) => l.old));
        const selNew = new Set(all.filter((l) => l.new !== undefined && l.sign !== '-').map((l) => l.new));
        const noted = [];
        (Array.isArray(fragment.notes) ? fragment.notes : []).forEach((note, n) => {
          if (!chIsObject(note) || !chPlace(note.at)) return;
          const nat = [...fat, 'notes', n, 'at'];
          const nside = note.at.side === 'base' ? 'old' : 'new';
          const oid = nside === 'old' ? diff.baseOid : head.oid;
          const nspan = chResolve(note.at, { ...ctx, text: textAt(head.dir, oid, file.path), where: `${nside === 'old' ? block.base : block.repo}:${file.path}`, side: nside }, nat);
          if (!nspan) return;
          const pool = nside === 'old' ? selOld : selNew;
          for (let line = nspan[0]; line <= nspan[1]; line++) {
            if (!pool.has(line)) {
              err(nat, `line ${line} of ${nside === 'old' ? block.base : block.repo}:${file.path} is not a line of this fragment; a note sits on a line of its fragment`);
              return;
            }
          }
          noted.push({ side: nside, from: nspan[0], to: nspan[1] });
          out.notes.set(`${k}:${n}`, { line: nspan[1], side: nside === 'old' ? 'base' : 'repo' });
        });

        const limit = Math.min(CHANGES_FRAGMENT_LINES, Math.max(0, budget));
        const lines = [];
        let shown = 0;
        let flat = 0;
        const hit = (l) => noted.some((x) => {
          const n = x.side === 'old' ? (l.sign !== '+' ? l.old : undefined) : (l.sign !== '-' ? l.new : undefined);
          return n !== undefined && n >= x.from && n <= x.to;
        });
        runs.forEach((run, r) => {
          const keep = new Set();
          run.forEach((l, i) => {
            if (flat + i < limit) keep.add(i);
            else if (hit(l)) for (let j = Math.max(0, i - CHANGES_PAD); j <= Math.min(run.length - 1, i + CHANGES_PAD); j++) keep.add(j);
          });
          flat += run.length;
          let last = -1;
          run.forEach((l, i) => {
            if (!keep.has(i)) return;
            if (lines.length && (last < 0 ? r > 0 : i !== last + 1)) lines.push({ kind: 'gap' });
            lines.push(chOut(l));
            shown++;
            last = i;
          });
        });
        budget -= shown;
        const fd = {
          lines,
          additions: all.filter((l) => l.sign === '+').length,
          deletions: all.filter((l) => l.sign === '-').length,
        };
        if (shown < all.length) fd.truncated = { shown, total: all.length };
        out.fragments.set(k, fd);
      });

      const missing = (diff.realLines.get(file.path) || []).filter((l) => !claimed.has(chKey(l)));
      if (missing.length) {
        const shown = missing.slice(0, CHANGES_LISTED_MISSING).map(chLineLabel).join(', ');
        const more = missing.length > CHANGES_LISTED_MISSING ? ` and ${missing.length - CHANGES_LISTED_MISSING} more` : '';
        err([...at, 'fragments'], `changed lines of "${file.path}" are in no fragment: ${shown}${more}; add a fragment (an "at" that takes them in, or none for the whole diff of the file)`);
      }
    });
    if (typeof block.id === 'string') result.set(block.id, data);
  });

  for (const a of anchors) {
    if (!chIsFragmentTest(a, blocks)) continue;
    if (!a.spans.length) err(a.segments, 'a fragment\'s test anchors the test itself: give it a "find" (and "findEnd" for its last line)');
    else if (a.list) err(a.segments, 'a fragment\'s test is one place: a "find" on its first line and "findEnd" on its last, not a list');
  }

  const pairs = chPairs(page);
  chTestCoverage(page, errors, pairs, diffs);
  for (const [repo, bases] of pairs) {
    const covered = chCovered(page, anchors, repo, pairs.size);
    for (const block of blocks) {
      if (chIsObject(block) && block.type === 'changes' && block.repo === repo && Array.isArray(block.files)) {
        for (const f of block.files) if (chIsObject(f) && typeof f.path === 'string') covered.add(f.path);
      }
    }
    for (const base of bases) {
      const diff = diffs(repo, base);
      if (!diff || diff.error) continue;
      const missing = [...diff.real].filter((path) => !covered.has(path));
      if (!missing.length) continue;
      const shown = missing.slice(0, CHANGES_LISTED_MISSING).map((p) => `"${p}"`).join(', ');
      const more = missing.length > CHANGES_LISTED_MISSING ? ` and ${missing.length - CHANGES_LISTED_MISSING} more` : '';
      err(['blocks'], `changed files of ${base}..${repo} are on no layer: ${shown}${more}; put code in a "changes" block, documentation in "doc-changes", tests in "test-coverage" with "mode": "diff" ("files"); only moved code and noise may be left out`);
    }
  }
  return result;
}
