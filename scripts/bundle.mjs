import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/;
const TOP_LEVEL = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+))/;

export function bundle(entry) {
  const order = [];
  const seen = new Set();
  const nodeImports = new Map();

  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const name = relative(root, file);
    const body = [];
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(IMPORT);
      if (m) {
        const [, clause, spec] = m;
        if (spec.startsWith('.')) {
          if (!/^\{\s*[\w$]+(\s*,\s*[\w$]+)*\s*\}$/.test(clause)) {
            throw new Error(`${name}: relative imports must be a plain { a, b } list, got "${clause}"`);
          }
          visit(resolve(dirname(file), spec));
        }
        else if (spec.startsWith('node:')) addNodeImport(nodeImports, spec, clause, name);
        else throw new Error(`${name}: only relative and node: imports are allowed, got "${spec}"`);
        continue;
      }
      if (/^import[\s{]/.test(line)) throw new Error(`${name}: multi-line or bare import not supported: ${line}`);
      if (/^export\s/.test(line)) {
        if (!/^export\s+(async\s+)?(function|class|const|let)\s/.test(line)) {
          throw new Error(`${name}: unsupported export form: ${line}`);
        }
        body.push(line.replace(/^export\s+/, ''));
        continue;
      }
      body.push(line);
    }
    order.push({ name, body: body.join('\n').trim() });
  };
  visit(resolve(entry));

  const declared = new Map();
  const bound = new Map();
  for (const [spec, { named, other }] of nodeImports) {
    const bindings = [
      ...[...named].map((part) => {
        const [imported, local = imported] = part.split(/\s+as\s+/);
        return [local, `${spec} ${imported}`];
      }),
      ...[...other].map((clause) => [clause.replace(/^\*\s+as\s+/, ''), `${spec} ${clause.startsWith('*') ? '*' : 'default'}`]),
    ];
    for (const [local, source] of bindings) {
      if (bound.has(local) && bound.get(local) !== source) {
        throw new Error(`"${local}" is imported from both ${bound.get(local)} and ${source}`);
      }
      bound.set(local, source);
      declared.set(local, `the import from ${spec}`);
    }
  }
  for (const mod of order) {
    for (const line of mod.body.split('\n')) {
      const m = line.match(TOP_LEVEL);
      if (!m) continue;
      const id = m[1] || m[2] || m[3];
      if (declared.has(id)) throw new Error(`"${id}" is declared at top level in both ${declared.get(id)} and ${mod.name}`);
      declared.set(id, mod.name);
    }
  }

  const imports = [...nodeImports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([spec, { named, other }]) => [
      ...[...other].sort().map((clause) => `import ${clause} from '${spec}';`),
      ...(named.size ? [`import { ${[...named].sort().join(', ')} } from '${spec}';`] : []),
    ]);

  return [
    '#!/usr/bin/env node',
    '// Generated from src/ by scripts/bundle.mjs. Do not edit; change src/ and run `npm run build`.',
    ...imports,
    '',
    ...order.map((m) => `// ${m.name}\n${m.body}\n`),
  ].join('\n');
}

function addNodeImport(map, spec, clause, from) {
  if (!map.has(spec)) map.set(spec, { named: new Set(), other: new Set() });
  const entry = map.get(spec);
  const named = clause.match(/^\{(.+)\}$/);
  if (named) {
    for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) entry.named.add(part);
  } else if (/^[\w$]+$/.test(clause) || /^\*\s+as\s+[\w$]+$/.test(clause)) {
    entry.other.add(clause);
  } else {
    throw new Error(`${from}: unsupported import clause "${clause}" from ${spec}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'bin', 'verstat.mjs');
  writeFileSync(out, bundle(resolve(root, 'src', 'cli.mjs')));
  chmodSync(out, 0o755);
  process.stdout.write(`wrote ${relative(root, out)}\n`);
}
