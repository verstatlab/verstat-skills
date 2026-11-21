import { isAbsolute, resolve } from 'node:path';
import { formatPath, hasOwn, validateSchema } from './jsonschema.mjs';
import { PAGE_SCHEMA_ID, SHA_PATTERN, pageSchema } from './page-schema.mjs';
import { componentSchema, unknownTypeMessage } from './components.mjs';
import { commitStatus, dirtyFiles, isBareRepo, isGitRepo, readFileAt } from './git.mjs';
import { changesDiffs } from './changes.mjs';
import { docDiffs } from './doc-changes.mjs';

export const ROUTE_SHORT_MINUTES = 5;

export function valueAt(root, segments) {
  let node = root;
  for (const s of segments) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[s];
  }
  return node;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function collectParts(block) {
  const ids = [];
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => visit(n, [...path, i]));
      return;
    }
    if (!isObject(node)) return;
    if (path.length > 0 && typeof node.id === 'string') ids.push({ id: node.id, path });
    for (const [k, v] of Object.entries(node)) visit(v, [...path, k]);
  };
  visit(block, []);
  return ids;
}

function findOccurrences(text, needle) {
  const found = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return found;
    found.push(at);
    from = at + 1;
  }
}

function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function matchSpan(text, start, find) {
  const lead = find.match(/^[\r\n]*/)[0];
  const core = find.slice(lead.length).replace(/[\r\n]+$/, '');
  const line = lineOf(text, start) + (core === '' ? 0 : (lead.match(/\n/g) || []).length);
  return [line, line + (core.match(/\n/g) || []).length];
}

function isPlace(v) {
  return (typeof v === 'string' && v !== '') || (isObject(v) && typeof v.find === 'string' && v.find !== '' && (v.nth === undefined || (Number.isInteger(v.nth) && v.nth >= 1)));
}

function spanLabel(spans) {
  return spans.length ? `:${spans.map(([from, to]) => (to > from ? `${from}-${to}` : `${from}`)).join(',')}` : '';
}

function anchorShapeError(anchor) {
  if (!isObject(anchor) || typeof anchor.repo !== 'string' || typeof anchor.path !== 'string') return 'an anchor needs string "repo" and "path"';
  const { find, nth, findEnd } = anchor;
  if (nth !== undefined && (!Number.isInteger(nth) || nth < 1)) return '"nth" must be an integer >= 1';
  if (findEnd !== undefined && (typeof findEnd !== 'string' || findEnd === '')) return '"findEnd" must be non-empty text';
  if (find === undefined) {
    if (nth !== undefined || findEnd !== undefined) return '"nth" and "findEnd" need a single "find"; an anchor without "find" is the whole file';
    return null;
  }
  if (typeof find === 'string') return find === '' ? '"find" must be non-empty text' : null;
  if (Array.isArray(find)) {
    if (nth !== undefined || findEnd !== undefined) return '"nth" and "findEnd" go with a single "find"; for a list, give a place as { "find", "nth" }';
    if (find.length < 2 || !find.every(isPlace)) return 'a list "find" needs at least 2 places, each non-empty text or { "find", "nth"? }';
    return null;
  }
  return '"find" must be text or a list of places';
}

function resolveAnchor(text, anchor, where) {
  if (anchor.find === undefined) return { spans: [] };
  const places = typeof anchor.find === 'string'
    ? [{ find: anchor.find, nth: anchor.nth, field: [] }]
    : anchor.find.map((p, i) => (typeof p === 'string' ? { find: p, field: ['find', i] } : { find: p.find, nth: p.nth, field: ['find', i] }));
  const spans = [];
  for (const place of places) {
    const field = place.field.length ? place.field : ['find'];
    const hits = findOccurrences(text, place.find);
    if (hits.length === 0) return { field, message: `${JSON.stringify(place.find)} not found in ${where}` };
    let index = 0;
    if (place.nth !== undefined) {
      if (place.nth > hits.length) {
        return { field: place.field.length ? [...place.field, 'nth'] : ['nth'], message: `"nth" is ${place.nth}, but ${JSON.stringify(place.find)} occurs only ${hits.length} time(s) in ${where}` };
      }
      index = place.nth - 1;
    } else if (hits.length > 1) {
      return { field, message: `${JSON.stringify(place.find)} occurs ${hits.length} times in ${where}; add "nth" (1–${hits.length}) or a longer "find"` };
    }
    const span = matchSpan(text, hits[index], place.find);
    if (typeof anchor.find === 'string' && anchor.findEnd !== undefined) {
      const after = hits[index] + place.find.length;
      const end = text.indexOf(anchor.findEnd, after);
      if (end < 0) return { field: ['findEnd'], message: `${JSON.stringify(anchor.findEnd)} not found after "find" in ${where}` };
      span[1] = Math.max(span[1], matchSpan(text, end, anchor.findEnd)[1]);
    }
    spans.push(span);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return { spans: merged };
}

export function validatePage(page, options) {
  const { components, pageDir, repoDirs = {} } = options;
  const errors = [];
  const inferred = [];
  const anchors = [];
  const files = new Map();
  const err = (segments, message) => errors.push({ path: formatPath(segments), message });
  const documents = { [PAGE_SCHEMA_ID]: pageSchema };

  const top = validateSchema(pageSchema, page, { documents });
  errors.push(...top.errors.map(({ path, message }) => ({ path, message })));
  if (!isObject(page)) return { errors, inferred, anchors, files, changes: new Map() };
  const annotations = [...top.annotations];

  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const blockIds = new Map();
  const partsByBlock = new Map();
  blocks.forEach((block, i) => {
    if (!isObject(block)) return;
    if (typeof block.id === 'string') {
      if (blockIds.has(block.id)) err(['blocks', i, 'id'], `duplicate block id "${block.id}" (also blocks[${blockIds.get(block.id)}])`);
      else blockIds.set(block.id, i);
    }
    if (typeof block.type === 'string') {
      const component = components.get(block.type);
      if (!component) {
        err(['blocks', i, 'type'], unknownTypeMessage(block.type, components));
      } else {
        try {
          const r = validateSchema(componentSchema(component), block, { documents, basePath: ['blocks', i] });
          errors.push(...r.errors.map(({ path, message }) => ({ path, message })));
          annotations.push(...r.annotations);
        } catch (e) {
          err(['blocks', i, 'type'], `block type "${block.type}": ${e.message}`);
        }
      }
    }
    const seen = new Map();
    for (const part of collectParts(block)) {
      if (seen.has(part.id)) err(['blocks', i, ...part.path, 'id'], `duplicate part id "${part.id}" in block "${block.id}"`);
      else seen.set(part.id, part.path);
    }
    if (typeof block.id === 'string' && !partsByBlock.has(block.id)) partsByBlock.set(block.id, seen);
  });

  const routed = new Map();
  let shortMinutes = 0;
  (Array.isArray(page.route) ? page.route : []).forEach((step, i) => {
    if (!isObject(step)) return;
    if (Array.isArray(step.modes) && step.modes.includes('short') && typeof step.minutes === 'number') shortMinutes += step.minutes;
    if (typeof step.block !== 'string') return;
    if (routed.has(step.block)) {
      err(['route', i, 'block'], `block "${step.block}" is already a step (route[${routed.get(step.block)}]); one block is one step`);
      return;
    }
    routed.set(step.block, i);
    if (!blockIds.has(step.block)) {
      err(['route', i, 'block'], `no block with id "${step.block}" on the page`);
    } else if (typeof step.focus === 'string' && !partsByBlock.get(step.block).has(step.focus)) {
      err(['route', i, 'focus'], `block "${step.block}" has no part with id "${step.focus}"`);
    }
  });

  if (shortMinutes > ROUTE_SHORT_MINUTES) {
    err(['route'], `the "short" steps add up to ${shortMinutes} minutes; keep them within ${ROUTE_SHORT_MINUTES} (about 3)`);
  }

  const repos = isObject(page.repos) ? page.repos : {};
  for (const name of Object.keys(repoDirs)) {
    if (!hasOwn(repos, name)) err(['repos'], `--repo ${name}=… names no repo in "repos"`);
  }
  const repoState = new Map();
  for (const [name, repo] of Object.entries(repos)) {
    if (name.includes(':')) {
      err(['repos', name], `repo name "${name}" must not contain ":"`);
      continue;
    }
    if (!isObject(repo) || typeof repo.sha !== 'string' || !new RegExp(SHA_PATTERN).test(repo.sha)) continue;
    const dir = hasOwn(repoDirs, name)
      ? resolve(repoDirs[name])
      : typeof repo.path === 'string'
        ? (isAbsolute(repo.path) ? repo.path : resolve(pageDir, repo.path))
        : pageDir;
    const state = { dir, sha: repo.sha, ok: false };
    repoState.set(name, state);
    if (!isGitRepo(dir)) {
      err(['repos', name], `no git repository at ${dir} (set "path" or pass --repo ${name}=<dir>)`);
      continue;
    }
    const commit = commitStatus(dir, repo.sha);
    if (commit.status !== 'ok') {
      const why = {
        ambiguous: `sha ${repo.sha} is ambiguous in ${dir}; use more characters`,
        shadowed: `sha ${repo.sha} is not a commit id in ${dir} (it names a branch, a tag or a tag object); pin the commit id`,
        missing: `commit ${repo.sha} not found in ${dir}`,
      }[commit.status];
      err(['repos', name, 'sha'], why);
      continue;
    }
    state.oid = commit.oid;
    if (isBareRepo(dir)) {
      state.ok = true;
      continue;
    }
    const dirty = dirtyFiles(dir);
    if (dirty === null) {
      err(['repos', name], `cannot read the working tree status of ${dir}`);
      continue;
    }
    if (dirty.length) {
      const shown = dirty.slice(0, 5).join(', ') + (dirty.length > 5 ? `, … (${dirty.length} files)` : '');
      err(['repos', name], `working tree of ${dir} is dirty (uncommitted changes to tracked files: ${shown}); anchors are read at ${repo.sha}, commit or stash first`);
      continue;
    }
    state.ok = true;
  }

  const anchorPaths = new Set();
  const containsByPath = new Map();
  for (const a of annotations) {
    if (a.keyword === 'x-anchor-contains') containsByPath.set(a.path, a.value);
  }
  for (const a of annotations) {
    if (a.keyword !== 'x-anchor' || a.value !== true || anchorPaths.has(a.path)) continue;
    anchorPaths.add(a.path);
    const anchor = valueAt(page, a.segments);
    const shape = anchorShapeError(anchor);
    if (shape) {
      const reported = errors.some((e) => e.path === a.path || e.path.startsWith(`${a.path}.`) || e.path.startsWith(`${a.path}[`));
      if (!reported) err(a.segments, shape);
      continue;
    }
    if (!hasOwn(repos, anchor.repo)) {
      err([...a.segments, 'repo'], `repo "${anchor.repo}" is not declared in "repos"`);
      continue;
    }
    const state = repoState.get(anchor.repo);
    if (!state || !state.ok) continue;
    const key = `${anchor.repo}:${anchor.path}`;
    if (!files.has(key)) files.set(key, readFileAt(state.dir, state.oid, anchor.path));
    const text = files.get(key);
    if (text === null) {
      err([...a.segments, 'path'], `file "${anchor.path}" does not exist in ${anchor.repo}@${state.sha}`);
      continue;
    }
    if (text.includes('\0')) {
      err([...a.segments, 'path'], `file "${anchor.path}" is binary; anchor a text file`);
      continue;
    }
    const resolved = resolveAnchor(text, anchor, `${anchor.repo}:${anchor.path}@${state.sha}`);
    if (!resolved.spans) {
      err([...a.segments, ...resolved.field], resolved.message);
      continue;
    }
    const { spans } = resolved;
    const line = spans.length ? spans[0][0] : null;
    const endLine = spans.length ? spans[0][1] : null;
    anchors.push({ path: a.path, segments: a.segments, repo: anchor.repo, file: anchor.path, sha: state.oid, line, endLine, spans, list: Array.isArray(anchor.find) });

    if (containsByPath.has(a.path)) {
      const fields = [].concat(containsByPath.get(a.path));
      const holderSegments = a.segments.slice(0, -1);
      const holder = valueAt(page, holderSegments);
      if (!isObject(holder)) {
        err(a.segments, '"x-anchor-contains" needs the anchor to be a field of an object (fix the block schema)');
        continue;
      }
      const all = text.split('\n');
      const lines = spans.map(([from, to]) => all.slice(from - 1, to).join('\n')).join('\n');
      const values = fields.map((f) => [f, hasOwn(holder, f) ? holder[f] : undefined]);
      const confirmed = spans.length > 0 && values.some(([, v]) => typeof v === 'string' && v !== '' && lines.includes(v));
      if (!spans.length) {
        inferred.push({
          path: formatPath(holderSegments),
          segments: holderSegments,
          reason: `${anchor.path} is anchored as a whole file, which confirms nothing; anchor the line with "find"`,
        });
      } else if (!confirmed) {
        const wanted = values
          .map(([f, v]) => (typeof v === 'string' && v !== '' ? `${f} ${JSON.stringify(v)}` : `${f} (no text)`))
          .join(' or ');
        inferred.push({
          path: formatPath(holderSegments),
          segments: holderSegments,
          reason: `${anchor.path}${spanLabel(spans)} does not contain ${wanted}`,
        });
      }
    }
  }

  const changes = changesDiffs(page, repoState, anchors, errors, { resolveAnchor });
  const docs = docDiffs(page, repoState, errors);
  return { errors, inferred, anchors, files, changes, docs };
}
