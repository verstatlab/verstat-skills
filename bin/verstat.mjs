#!/usr/bin/env node
// Generated from src/ by scripts/bundle.mjs. Do not edit; change src/ and run `npm run build`.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// src/page-schema.mjs
const PAGE_SCHEMA_ID = 'verstat:page';
const SHA_PATTERN = '^(?:[0-9a-f]{7,40}|[0-9a-f]{64})$';

const pageSchema = {
  $id: PAGE_SCHEMA_ID,
  title: 'verstat page',
  description:
    'One page: the question it answers, the repositories its anchors point into, and the blocks that answer it. Each block is checked further by the schema of its type (`verstat schema <type>`).',
  type: 'object',
  required: ['schema', 'skill', 'question', 'repos', 'blocks'],
  additionalProperties: false,
  properties: {
    schema: { const: 'verstat.page/1' },
    skill: { type: 'string', minLength: 1, description: 'The skill that produced the page.' },
    question: { type: 'string', minLength: 1, description: 'The question the page answers.' },
    lang: {
      type: 'string',
      pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$',
      default: 'en',
      description:
        'The language the page texts are written in, as a BCP 47 tag (`en`, `uk`, `de`, `pt-BR`). Sets `<html lang>` and the language of the page UI; a language verstat has no UI dictionary for gets the English UI. Default `en`.',
    },
    repos: {
      type: 'object',
      description: 'Every repository anchors point into, by the name anchors use in `repo`.',
      additionalProperties: { $ref: '#/$defs/repo' },
    },
    glossary: { type: 'array', items: { $ref: '#/$defs/glossaryEntry' } },
    blocks: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/block' },
    },
    route: { type: 'array', items: { $ref: '#/$defs/routeStep' } },
    openQuestions: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  $defs: {
    repo: {
      type: 'object',
      required: ['sha'],
      additionalProperties: false,
      properties: {
        remote: { type: 'string' },
        sha: { type: 'string', pattern: SHA_PATTERN, description: 'The commit every anchor into this repo is read at.' },
        path: {
          type: 'string',
          minLength: 1,
          description: 'Local checkout of the repo: absolute, or relative to the page file. Overridden by `--repo <name>=<dir>`; defaults to the page file\'s directory.',
        },
      },
    },
    anchor: {
      type: 'object',
      description:
        'A place in code, read at the sha `repos.<repo>` pins: the whole file `path` (no `find`), the line(s) where `find` occurs, the range from `find` to `findEnd`, or several places when `find` is a list.',
      'x-anchor': true,
      required: ['repo', 'path'],
      additionalProperties: false,
      properties: {
        repo: { type: 'string', minLength: 1, description: 'A key of the page\'s `repos`.' },
        path: { type: 'string', minLength: 1, description: 'File path from the repo root.' },
        find: {
          description: 'Exact text that occurs in the file (may span lines), or a list of such texts for several places in the same file. Leave it out to anchor the whole file.',
          oneOf: [
            { type: 'string', minLength: 1 },
            { type: 'array', minItems: 2, items: { $ref: '#/$defs/anchorPlace' } },
          ],
        },
        nth: { type: 'integer', minimum: 1, description: 'Which occurrence of a single `find`, counting from 1; required when it occurs more than once.' },
        findEnd: {
          type: 'string',
          minLength: 1,
          description: 'With a single `find`: exact text that ends a range. Its first occurrence after the match of `find` is the range\'s last line.',
        },
      },
    },
    anchorPlace: {
      description: 'One place of a list `find`: the text, or `{ find, nth }` when the text occurs more than once.',
      oneOf: [
        { type: 'string', minLength: 1 },
        {
          type: 'object',
          required: ['find'],
          additionalProperties: false,
          properties: {
            find: { type: 'string', minLength: 1 },
            nth: { type: 'integer', minimum: 1 },
          },
        },
      ],
    },
    source: {
      enum: ['code', 'test', 'adr', 'doc', 'inferred'],
      description: 'Where a claim comes from. `inferred` is shown as a deduction, not a fact.',
    },
    change: {
      enum: ['added', 'removed', 'changed'],
      description: 'Diff mode: what happened to this part between the base and the head. A `changed` part may carry `before` with its old values.',
    },
    glossaryEntry: {
      type: 'object',
      required: ['term', 'definition'],
      additionalProperties: false,
      properties: {
        term: { type: 'string', minLength: 1 },
        code: { type: 'string', minLength: 1, description: 'The identifier the term goes by in code, shown next to it.' },
        aliases: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Other forms of the term the page text uses (inflections, plurals); they are highlighted too.',
        },
        definition: { type: 'string', minLength: 1 },
        anchor: { $ref: '#/$defs/anchor' },
        source: { $ref: '#/$defs/source' },
      },
    },
    block: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: { type: 'string', minLength: 1, description: 'Unique on the page; the route addresses blocks by it.' },
        type: { type: 'string', minLength: 1, description: 'A block type; `verstat schema <type>` prints its schema.' },
        title: { type: 'string' },
      },
    },
    routeStep: {
      type: 'object',
      required: ['block', 'minutes', 'why', 'modes'],
      additionalProperties: false,
      properties: {
        block: { type: 'string', minLength: 1, description: 'The `id` of a block on the page.' },
        focus: { type: 'string', minLength: 1, description: 'The `id` of a part inside that block.' },
        minutes: { type: 'number', minimum: 0 },
        why: { type: 'string', minLength: 1 },
        modes: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: ['short', 'full'] },
        },
      },
    },
  },
};

// src/jsonschema.mjs
const ANNOTATION_KEYWORDS = ['x-anchor', 'x-anchor-contains'];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateSchema(schema, instance, options = {}) {
  const ctx = {
    documents: options.documents || {},
    errors: [],
    annotations: [],
  };
  const base = options.basePath || [];
  walk(schema, instance, base, schema, ctx);
  return { errors: ctx.errors, annotations: ctx.annotations };
}

function formatPath(segments) {
  let out = '$';
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`;
    else if (/^[A-Za-z_$][\w$-]*$/.test(s)) out += `.${s}`;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

function resolveSchemaRef(ref, root, documents) {
  const hash = ref.indexOf('#');
  const base = hash < 0 ? ref : ref.slice(0, hash);
  const fragment = hash < 0 ? '' : ref.slice(hash + 1);
  const doc = base ? (hasOwn(documents, base) ? documents[base] : null) : root;
  if (!doc) return null;
  let node = doc;
  if (fragment) {
    if (!fragment.startsWith('/')) return null;
    for (const raw of fragment.slice(1).split('/')) {
      const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
      if (node === null || typeof node !== 'object' || !hasOwn(node, key)) return null;
      node = node[key];
    }
  }
  return { node, root: doc };
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function fail(ctx, path, message) {
  ctx.errors.push({ path: formatPath(path), segments: path, message });
}

function branch(schema, instance, path, root, ctx) {
  const sub = { documents: ctx.documents, errors: [], annotations: [] };
  walk(schema, instance, path, root, sub);
  return sub;
}

function walk(schema, instance, path, root, ctx) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    fail(ctx, path, 'no value is allowed here');
    return;
  }
  if (typeof schema !== 'object' || schema === null) return;

  for (const keyword of ANNOTATION_KEYWORDS) {
    if (hasOwn(schema, keyword)) {
      ctx.annotations.push({ path: formatPath(path), segments: path, keyword, value: schema[keyword] });
    }
  }

  if (typeof schema.$ref === 'string') {
    const target = resolveSchemaRef(schema.$ref, root, ctx.documents);
    if (!target) fail(ctx, path, `schema reference ${schema.$ref} does not resolve`);
    else walk(target.node, instance, path, target.root, ctx);
  }

  if (hasOwn(schema, 'type')) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(instance, t))) {
      fail(ctx, path, `expected ${types.join(' or ')}, got ${typeOf(instance)}`);
      return;
    }
  }

  if (hasOwn(schema, 'const') && !deepEqual(instance, schema.const)) {
    fail(ctx, path, `must be ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => deepEqual(v, instance))) {
    fail(ctx, path, `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }

  if (typeof instance === 'string') {
    if (typeof schema.minLength === 'number' && [...instance].length < schema.minLength) {
      fail(ctx, path, `must be at least ${schema.minLength} character(s) long`);
    }
    if (typeof schema.maxLength === 'number' && [...instance].length > schema.maxLength) {
      fail(ctx, path, `must be at most ${schema.maxLength} character(s) long`);
    }
    if (typeof schema.pattern === 'string') {
      let re = null;
      try {
        re = new RegExp(schema.pattern, 'u');
      } catch {
        fail(ctx, path, `schema pattern /${schema.pattern}/ is not a valid regular expression`);
      }
      if (re && !re.test(instance)) fail(ctx, path, `must match /${schema.pattern}/`);
    }
  }

  if (typeof instance === 'number') {
    if (typeof schema.minimum === 'number' && instance < schema.minimum) {
      fail(ctx, path, `must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && instance > schema.maximum) {
      fail(ctx, path, `must be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(instance)) {
    if (typeof schema.minItems === 'number' && instance.length < schema.minItems) {
      fail(ctx, path, `must have at least ${schema.minItems} item(s)`);
    }
    if (typeof schema.maxItems === 'number' && instance.length > schema.maxItems) {
      fail(ctx, path, `must have at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems === true) {
      for (let i = 0; i < instance.length; i++) {
        for (let j = 0; j < i; j++) {
          if (deepEqual(instance[i], instance[j])) fail(ctx, [...path, i], `duplicates item ${j}`);
        }
      }
    }
    if (schema.items !== undefined) {
      instance.forEach((item, i) => walk(schema.items, item, [...path, i], root, ctx));
    }
  }

  if (typeOf(instance) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!hasOwn(instance, key)) fail(ctx, path, `missing required field "${key}"`);
      }
    }
    const props = schema.properties || {};
    for (const [key, value] of Object.entries(instance)) {
      if (hasOwn(props, key)) {
        walk(props[key], value, [...path, key], root, ctx);
      } else if (schema.additionalProperties === false) {
        fail(ctx, [...path, key], `unknown field "${key}"`);
      } else if (typeof schema.additionalProperties === 'object') {
        walk(schema.additionalProperties, value, [...path, key], root, ctx);
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) walk(sub, instance, path, root, ctx);
  }

  if (Array.isArray(schema.anyOf)) {
    const results = schema.anyOf.map((sub) => branch(sub, instance, path, root, ctx));
    const passing = results.filter((r) => r.errors.length === 0);
    if (passing.length === 0) {
      fail(ctx, path, `does not match any allowed shape (${closestErrors(results)})`);
    } else {
      for (const r of passing) ctx.annotations.push(...r.annotations);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const results = schema.oneOf.map((sub) => branch(sub, instance, path, root, ctx));
    const passing = results.filter((r) => r.errors.length === 0);
    if (passing.length === 1) {
      ctx.annotations.push(...passing[0].annotations);
    } else if (passing.length === 0) {
      fail(ctx, path, `does not match any allowed shape (${closestErrors(results)})`);
    } else {
      fail(ctx, path, `matches ${passing.length} shapes, expected exactly one`);
    }
  }
}

function closestErrors(results) {
  if (results.length === 0) return 'the schema lists no shapes';
  const best = results.reduce((a, b) => (b.errors.length < a.errors.length ? b : a));
  return best.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
}

// src/components.mjs
function loadComponents(dirs) {
  const components = new Map();
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      const folder = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(folder).isDirectory();
      } catch {
        continue;
      }
      if (components.has(name) || !isDir || name === 'page') continue;
      if (!existsSync(join(folder, 'schema.json'))) continue;
      components.set(name, { type: name, dir: folder });
    }
  }
  return components;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

function componentSchema(component) {
  if (!component.schema) component.schema = readJson(join(component.dir, 'schema.json'));
  return component.schema;
}

function componentMeta(component) {
  if (!component.meta) {
    const file = join(component.dir, 'meta.json');
    const meta = existsSync(file) ? readJson(file) : {};
    const deps = meta.deps === undefined ? [] : meta.deps;
    if (!Array.isArray(deps) || deps.some((d) => typeof d !== 'string')) {
      throw new Error(`${file}: "deps" must be an array of library names`);
    }
    const modules = meta.modules === undefined ? [] : meta.modules;
    if (!Array.isArray(modules) || modules.some((m) => typeof m !== 'string' || !/^[a-z][a-z0-9-]*$/.test(m))) {
      throw new Error(`${file}: "modules" must be an array of client module names (client/modules/<name>.js)`);
    }
    for (const key of ['group', 'label']) {
      if (meta[key] !== undefined && (typeof meta[key] !== 'string' || !meta[key])) throw new Error(`${file}: "${key}" must be a non-empty string`);
    }
    if (meta.diffMode !== undefined && typeof meta.diffMode !== 'boolean') throw new Error(`${file}: "diffMode" must be true or false`);
    if (meta.frame !== undefined && meta.frame !== 'bare') throw new Error(`${file}: "frame" can only be "bare"`);
    component.meta = { ...meta, deps, modules };
  }
  return component.meta;
}

function componentRender(component) {
  const file = join(component.dir, 'render.js');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function unknownTypeMessage(type, components) {
  const known = [...components.keys()].sort();
  return `unknown block type "${type}"; known: ${known.length ? known.join(', ') : '(none)'}`;
}

function inlineSharedRefs(schema) {
  const documents = { [PAGE_SCHEMA_ID]: pageSchema };
  const visit = (node, foreign) => {
    if (Array.isArray(node)) return node.map((n) => visit(n, foreign));
    if (node === null || typeof node !== 'object') return node;
    const out = {};
    let merged = null;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const shared = value.startsWith(`${PAGE_SCHEMA_ID}#`);
        if (shared || (foreign && value.startsWith('#'))) {
          const target = resolveSchemaRef(value, pageSchema, documents);
          if (target) {
            merged = visit(target.node, true);
            continue;
          }
        }
      }
      out[key] = visit(value, foreign);
    }
    return merged ? { ...merged, ...out } : out;
  };
  return visit(schema, false);
}

// src/git.mjs
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

function gitEnv(names, base = process.env) {
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

function tryGit(dir, args, input) {
  try {
    return { ok: true, out: git(dir, args, input) };
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('git is not installed or not on PATH');
    return { ok: false, out: null };
  }
}

function isBareRepo(dir) {
  const r = tryGit(dir, ['rev-parse', '--is-bare-repository']);
  return r.ok && r.out.toString('utf8').trim() === 'true';
}

function isGitRepo(dir) {
  return tryGit(dir, ['rev-parse', '--git-dir']).ok;
}

function commitStatus(dir, sha) {
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

function readFileAt(dir, sha, path) {
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

function dirtyFiles(dir) {
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

// src/facts.mjs
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

function diffHunks(dir, base, head, context) {
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

function diffLines(dir, base, head) {
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

function isGenerated(path) {
  return FACTS_GENERATED.has(basename(path));
}

function diffFacts(dir, range) {
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

function isFactsError(err) {
  return err instanceof FactsError;
}

// src/changes.mjs
const CHANGES_FRAGMENT_LINES = 400;
const CHANGES_BLOCK_LINES = 8000;
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

function changesDiffs(page, repoState, anchors, errors, { resolveAnchor }) {
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

// src/doc-changes.mjs
const DOC_CONTEXT = 3;
const DOC_VERSION_LINES = 4000;
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

function docDiffs(page, repoState, errors) {
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

// src/validate.mjs
const ROUTE_SHORT_MINUTES = 5;

function valueAt(root, segments) {
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

function collectParts(block) {
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

function validatePage(page, options) {
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

// src/vendor.mjs
function readVendorManifest(vendorDir) {
  const file = join(vendorDir, 'vendor.json');
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readChecksums(vendorDir) {
  const file = join(vendorDir, 'SHA256SUMS');
  const sums = new Map();
  if (!existsSync(file)) return sums;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (m) sums.set(m[2], m[1]);
  }
  return sums;
}

function verifiedBytes(vendorDir, sums, rel) {
  const file = join(vendorDir, rel);
  if (!existsSync(file)) throw new Error(`vendor file ${rel} is missing`);
  const data = readFileSync(file);
  const expected = sums.get(rel);
  if (!expected) throw new Error(`vendor file ${rel} has no checksum in vendor/SHA256SUMS`);
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expected) throw new Error(`vendor file ${rel} does not match its checksum in vendor/SHA256SUMS`);
  return data;
}

function verifiedFile(vendorDir, sums, rel) {
  return verifiedBytes(vendorDir, sums, rel).toString('utf8');
}

function loadVendorLibs(vendorDir, names) {
  const manifest = readVendorManifest(vendorDir);
  const sums = readChecksums(vendorDir);
  return names.map((name) => {
    if (!hasOwn(manifest, name)) throw new Error(`unknown vendor library "${name}" (not in vendor/vendor.json)`);
    const lib = manifest[name];
    if (lib.kind === 'font') throw new Error(`vendor entry "${name}" is a font; fonts are embedded in every page and cannot be a block dep`);
    if (!Array.isArray(lib.files) || typeof lib.license !== 'string') {
      throw new Error(`vendor library "${name}" needs "files" (an array) and "license" (a path) in vendor/vendor.json`);
    }
    const scripts = lib.files.filter((rel) => !rel.endsWith('.css'));
    const sheets = lib.files.filter((rel) => rel.endsWith('.css'));
    return {
      name,
      package: lib.package || name,
      version: lib.version,
      scripts: scripts.map((rel) => ({ file: rel, code: verifiedFile(vendorDir, sums, rel) })),
      styles: sheets.map((rel) => ({ file: rel, css: verifiedFile(vendorDir, sums, rel) })),
      license: verifiedFile(vendorDir, sums, lib.license),
    };
  });
}

function loadVendorFonts(vendorDir) {
  const manifest = readVendorManifest(vendorDir);
  const sums = readChecksums(vendorDir);
  const fonts = [];
  for (const [name, entry] of Object.entries(manifest)) {
    if (entry.kind !== 'font') continue;
    if (!Array.isArray(entry.faces) || typeof entry.license !== 'string') {
      throw new Error(`vendor font "${name}" needs "faces" (an array) and "license" (a path) in vendor/vendor.json`);
    }
    fonts.push({
      name,
      label: entry.label || name,
      faces: entry.faces.map((face) => {
        if (!face || typeof face.file !== 'string' || typeof face.family !== 'string' || !Number.isInteger(face.weight)) {
          throw new Error(`vendor font "${name}": each face needs "file", "family" (strings) and "weight" (an integer)`);
        }
        if (face.style !== undefined && face.style !== 'normal' && face.style !== 'italic') {
          throw new Error(`vendor font "${name}": a face's "style" is "normal" or "italic"`);
        }
        return {
          family: face.family,
          weight: face.weight,
          style: face.style || 'normal',
          data: verifiedBytes(vendorDir, sums, face.file).toString('base64'),
        };
      }),
      license: verifiedFile(vendorDir, sums, entry.license),
    });
  }
  return fonts;
}

// src/build.mjs
function engineVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function fileLines(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function escapeScript(text) {
  return text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

function scriptTag(code, what) {
  if (/<\/script|<!--/i.test(code)) {
    throw new Error(`${what} contains "</script" or "<!--", which would end its inline <script>; split the text, e.g. '<' + '!--'`);
  }
  return `<script>\n${code}\n</script>`;
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => join(dir, f));
}

function replaceMarker(html, marker, content) {
  const token = `<!--verstat:${marker}-->`;
  const at = html.indexOf(token);
  if (at < 0) throw new Error(`client/shell.html has no ${token} marker`);
  return html.slice(0, at) + content + html.slice(at + token.length);
}

const CLIENT_META = ['group', 'label', 'diffMode', 'frame'];

function clientMeta(meta) {
  const out = {};
  for (const key of CLIENT_META) if (meta && meta[key] !== undefined) out[key] = meta[key];
  return out;
}

function fontFaces(fonts) {
  const faces = [];
  for (const font of fonts) {
    for (const face of font.faces) {
      faces.push(
        `@font-face{font-family:${JSON.stringify(face.family)};font-style:${face.style};font-weight:${face.weight};font-display:swap;` +
          `src:url(data:font/woff2;base64,${face.data}) format("woff2")}`,
      );
    }
  }
  return faces.length ? `<style>\n${faces.join('\n')}\n</style>` : '';
}

function wrapRender(type, source, meta) {
  if (!/^export default /m.test(source)) {
    throw new Error(`render.js of "${type}" has no "export default"`);
  }
  if (/^\s*(import|export)\s/m.test(source.replace(/^export default /m, ''))) {
    throw new Error(`render.js of "${type}" may only have one "export default" and no imports`);
  }
  const declaration = /^export default (async\s+)?function(\s*\*)?\s*([\w$]*)/m;
  const fn = source.match(declaration);
  const exported = fn && fn[3] ? fn[3] : 'verstatRender';
  const body = fn
    ? source.replace(declaration, (_, async = '', star = '') => `${async}function${star} ${exported}`)
    : source.replace(/^export default /m, ';const verstatRender = ');
  return `verstat.register(${JSON.stringify(type)}, (() => {\n${body}\n;return ${exported};\n})(), ${JSON.stringify(clientMeta(meta))});`;
}

function countInferred(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countInferred(v), 0);
  if (!value || typeof value !== 'object') return 0;
  return (value.source === 'inferred' ? 1 : 0) + Object.values(value).reduce((n, v) => n + countInferred(v), 0);
}

function readStrings(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

const CLIENT_STRINGS = ['core', 'group', 'route', 'anchors', 'mermaid', 'flow', 'read'];

function only(strings, namespaces) {
  if (!namespaces) return strings;
  const out = {};
  for (const [key, value] of Object.entries(strings)) if (namespaces.has(key.split('.')[0])) out[key] = value;
  return out;
}

function pageStrings(root, lang = 'en', types = null) {
  const dir = join(root, 'locales');
  const namespaces = types ? new Set([...CLIENT_STRINGS, ...types]) : null;
  const en = only(readStrings(join(dir, 'en.json')) || {}, namespaces);
  const candidates = [lang, lang.split('-')[0]].filter((l, i, all) => /^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(l) && all.indexOf(l) === i);
  for (const ui of candidates) {
    if (ui === 'en') break;
    const strings = readStrings(join(dir, `${ui}.json`));
    if (strings) return { lang, ui, strings: only(strings, namespaces), en };
  }
  return { lang, ui: 'en', strings: en };
}

function buildPage(page, result, { root, components }) {
  const data = JSON.parse(JSON.stringify(page));

  const embedded = new Map();
  for (const a of result.anchors) {
    const anchor = valueAt(data, a.segments);
    if (a.spans.length) {
      anchor.line = a.line;
      anchor.endLine = a.endLine;
      if (a.spans.length > 1) anchor.spans = a.spans;
    }
    const key = `${a.repo}:${a.file}`;
    if (!embedded.has(key)) embedded.set(key, a.sha);
  }
  for (const claim of result.inferred) {
    const holder = valueAt(data, claim.segments);
    if (holder && typeof holder === 'object') holder.source = 'inferred';
  }
  for (const [id, changes] of result.changes || []) {
    const block = data.blocks.find((b) => b.id === id);
    for (const [index, file] of changes.files) {
      const target = block.files[index];
      target.diff = file.diff;
      for (const [k, diff] of file.fragments) target.fragments[k].diff = diff;
      for (const [key, at] of file.notes) {
        const [k, n] = key.split(':').map(Number);
        Object.assign(target.fragments[k].notes[n], at);
      }
    }
  }
  for (const [id, doc] of result.docs || []) {
    const block = data.blocks.find((b) => b.id === id);
    for (const [index, diff] of doc.files) block.files[index].diff = diff;
    for (const [key, hunk] of doc.fragments) {
      const [f, j] = key.split(':').map(Number);
      block.files[f].fragments[j].hunk = hunk;
    }
  }
  data.code = {};
  for (const [key, sha] of embedded) data.code[key] = { sha, lines: fileLines(result.files.get(key)) };
  data.engine = { version: engineVersion(root) };
  data.validation = { anchors: result.anchors.length, inferred: countInferred(data.blocks) + countInferred(data.glossary) };

  const types = [...new Set(data.blocks.map((b) => b.type))].sort();
  const deps = [];
  const modules = [];
  for (const type of types) {
    const meta = componentMeta(components.get(type));
    for (const dep of meta.deps) if (!deps.includes(dep)) deps.push(dep);
    for (const name of meta.modules) if (!modules.includes(name)) modules.push(name);
  }
  const order = Object.keys(readVendorManifest(join(root, 'vendor')));
  deps.sort((a, b) => (order.indexOf(a) < 0 ? Infinity : order.indexOf(a)) - (order.indexOf(b) < 0 ? Infinity : order.indexOf(b)));
  const libs = loadVendorLibs(join(root, 'vendor'), deps);
  const fonts = loadVendorFonts(join(root, 'vendor'));

  const clientDir = join(root, 'client');
  let html = readFileSync(join(clientDir, 'shell.html'), 'utf8');

  const styleOf = (css, what) => {
    if (/<\/style/i.test(css)) throw new Error(`${what} contains "</style", which would end its inline <style>`);
    return css;
  };
  const moduleFiles = modules.map((name) => {
    const js = join(clientDir, 'modules', `${name}.js`);
    if (!existsSync(js)) throw new Error(`client module "${name}" is missing: client/modules/${name}.js`);
    const css = join(clientDir, 'modules', `${name}.css`);
    return { name, js: readFileSync(js, 'utf8'), css: existsSync(css) ? readFileSync(css, 'utf8') : null };
  });
  const styles = [
    ...libs.flatMap((lib) => lib.styles.map((s) => styleOf(s.css, `vendor file ${s.file}`))),
    ...listFiles(clientDir, '.css').map((f) => styleOf(readFileSync(f, 'utf8'), `client/${basename(f)}`)),
    ...moduleFiles.filter((m) => m.css !== null).map((m) => styleOf(m.css, `client/modules/${m.name}.css`)),
  ];
  const head = [fontFaces(fonts), styles.length ? `<style>\n${styles.join('\n')}\n</style>` : ''].filter(Boolean).join('\n');

  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const strings = JSON.stringify(pageStrings(root, page.lang || 'en', types)).replace(/</g, '\\u003c');
  const dataTag = `<script type="application/json" id="verstat-page">${json}</script>\n<script type="application/json" id="verstat-strings">${strings}</script>`;

  const scripts = [];
  for (const lib of libs) {
    for (const { file, code } of lib.scripts) scripts.push(scriptTag(code.replace(/^\/\/# sourceMappingURL=.*$/gm, ''), `vendor file ${file}`));
  }
  for (const f of listFiles(clientDir, '.js')) scripts.push(scriptTag(readFileSync(f, 'utf8'), `client/${basename(f)}`));
  for (const m of moduleFiles) scripts.push(scriptTag(m.js, `client/modules/${m.name}.js`));
  for (const type of types) {
    const source = componentRender(components.get(type));
    if (source !== null) scripts.push(scriptTag(wrapRender(type, source, componentMeta(components.get(type))), `render.js of "${type}"`));
  }

  const notices = [
    ...libs.map((l) => `${l.package} ${l.version}\n\n${l.license.trim()}`),
    ...fonts.map((f) => `${f.label}\n\n${f.license.trim()}`),
  ];
  const licenses = notices.length
    ? `<script type="text/plain" id="verstat-licenses">\n${escapeScript(notices.join('\n\n----\n\n'))}\n</script>`
    : '';

  html = html.replace(/<html lang="[^"]*">/, `<html lang="${page.lang || 'en'}">`);
  html = replaceMarker(html, 'head', head);
  html = replaceMarker(html, 'data', dataTag);
  html = replaceMarker(html, 'scripts', scripts.join('\n'));
  html = replaceMarker(html, 'licenses', licenses);
  return html;
}

// src/cli.mjs
const USAGE = `usage:
  verstat schema <type|page>              print the JSON Schema of a block type (or of the page)
  verstat validate <page.json> [--json]   check a page against its schemas and repos
  verstat build <page.json> [-o out.html] validate, then write one self-contained HTML file
  verstat facts diff <base>..<head> [--dir <checkout>]
                                          print what a diff holds (files, commits, moved code, noise) as JSON

options:
  --components <dir>     extra block type folder, searched before the plugin's components/ (repeatable)
  --repo <name>=<dir>    local checkout of a repo named in the page's "repos" (repeatable)
  --dir <checkout>       the repo facts reads (default: the current directory)`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { components: [], repos: Object.create(null), json: false, out: null, dir: null, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--components') {
      const dir = resolve(value());
      if (!existsSync(dir)) throw new UsageError(`--components: no such directory ${dir}`);
      opts.components.push(dir);
    }
    else if (arg === '--repo') {
      const v = value();
      const eq = v.indexOf('=');
      if (eq < 1 || eq === v.length - 1) throw new UsageError(`--repo expects <name>=<dir>, got "${v}"`);
      opts.repos[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (arg === '-o' || arg === '--out') opts.out = value();
    else if (arg === '--dir') opts.dir = value();
    else if (arg === '--json') opts.json = true;
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
}

function pluginRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function readPage(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new UsageError(`cannot read ${file}: ${err.code || err.message}`);
  }
  try {
    return { page: JSON.parse(text) };
  } catch (err) {
    return { parseError: `${file} is not valid JSON: ${err.message}` };
  }
}

function report(result, { json, out }) {
  const ok = result.errors.length === 0;
  if (json) {
    const payload = {
      ok,
      errors: result.errors,
      inferred: result.inferred.map(({ path, reason }) => ({ path, reason })),
    };
    if (out && ok) payload.out = out;
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return ok;
  }
  for (const e of result.errors) process.stderr.write(`error: ${e.path}: ${e.message}\n`);
  if (ok) process.stdout.write(out ? `wrote ${out}\n` : 'ok\n');
  for (const c of result.inferred) process.stdout.write(`inferred: ${c.path} — ${c.reason}\n`);
  return ok;
}

function check(file, opts, components) {
  const { page, parseError } = readPage(file);
  if (parseError) {
    return { page, result: { errors: [{ path: '$', message: parseError }], inferred: [], anchors: [], files: new Map() } };
  }
  const result = validatePage(page, { components, pageDir: dirname(resolve(file)), repoDirs: opts.repos });
  return { page, result };
}

function main(argv) {
  const opts = parseArgs(argv);
  const [command, target] = opts.positional;
  const limit = command === 'facts' ? 3 : 2;
  if (opts.positional.length > limit) throw new UsageError(`unexpected argument "${opts.positional[limit]}"\n${USAGE}`);
  if (opts.out && command !== 'build') throw new UsageError('-o/--out only applies to build');
  if (opts.dir !== null && command !== 'facts') throw new UsageError('--dir only applies to facts');
  if (opts.help || !command) {
    process.stdout.write(`${USAGE}\n`);
    return opts.help ? 0 : 2;
  }
  if (command === 'facts') {
    if (target !== 'diff') throw new UsageError(`facts needs "diff <base>..<head>"\n${USAGE}`);
    if (opts.json || opts.components.length || Object.keys(opts.repos).length) {
      throw new UsageError('facts takes only --dir (--json, --components and --repo do not apply)');
    }
    const range = opts.positional[2];
    if (!range) throw new UsageError('facts diff needs a range <base>..<head>');
    let facts;
    try {
      facts = diffFacts(resolve(opts.dir || '.'), range);
    } catch (err) {
      if (isFactsError(err)) throw new UsageError(err.message);
      throw err;
    }
    process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
    return 0;
  }

  const root = pluginRoot();
  const components = loadComponents([...opts.components, join(root, 'components')]);

  if (command === 'schema') {
    if (!target) throw new UsageError('schema needs a block type');
    if (target === 'page') {
      process.stdout.write(`${JSON.stringify(pageSchema, null, 2)}\n`);
      return 0;
    }
    const component = components.get(target);
    if (!component) throw new UsageError(unknownTypeMessage(target, components));
    process.stdout.write(`${JSON.stringify(inlineSharedRefs(componentSchema(component)), null, 2)}\n`);
    return 0;
  }

  if (command === 'validate') {
    if (!target) throw new UsageError('validate needs a page file');
    const { result } = check(target, opts, components);
    return report(result, { json: opts.json }) ? 0 : 1;
  }

  if (command === 'build') {
    if (!target) throw new UsageError('build needs a page file');
    const { page, result } = check(target, opts, components);
    const out = resolve(opts.out || join(dirname(target), `${basename(target, extname(target))}.html`));
    if (result.errors.length === 0) {
      try {
        const html = buildPage(page, result, { root, components });
        const temp = `${out}.tmp-${process.pid}`;
        try {
          writeFileSync(temp, html);
          renameSync(temp, out);
        } catch (err) {
          rmSync(temp, { force: true });
          throw err;
        }
      } catch (err) {
        result.errors.push({ path: '$', message: `build failed: ${err.message}` });
      }
    }
    return report(result, { json: opts.json, out }) ? 0 : 1;
  }

  throw new UsageError(`unknown command "${command}"\n${USAGE}`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${err instanceof UsageError ? '' : 'error: '}${err.message}\n`);
  process.exitCode = err instanceof UsageError ? 2 : 1;
}
