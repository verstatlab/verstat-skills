import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_SCHEMA_ID, pageSchema } from './page-schema.mjs';
import { resolveSchemaRef } from './jsonschema.mjs';

export function loadComponents(dirs) {
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

export function componentSchema(component) {
  if (!component.schema) component.schema = readJson(join(component.dir, 'schema.json'));
  return component.schema;
}

export function componentMeta(component) {
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

export function componentRender(component) {
  const file = join(component.dir, 'render.js');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function unknownTypeMessage(type, components) {
  const known = [...components.keys()].sort();
  return `unknown block type "${type}"; known: ${known.length ? known.join(', ') : '(none)'}`;
}

export function inlineSharedRefs(schema) {
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
