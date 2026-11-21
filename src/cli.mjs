import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { pageSchema } from './page-schema.mjs';
import { componentSchema, inlineSharedRefs, loadComponents, unknownTypeMessage } from './components.mjs';
import { validatePage } from './validate.mjs';
import { buildPage } from './build.mjs';
import { diffFacts, isFactsError } from './facts.mjs';

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

export function pluginRoot() {
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

export function main(argv) {
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
