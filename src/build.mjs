import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { componentMeta, componentRender } from './components.mjs';
import { loadVendorFonts, loadVendorLibs, readVendorManifest } from './vendor.mjs';
import { valueAt } from './validate.mjs';

export function engineVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function fileLines(text) {
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

export function clientMeta(meta) {
  const out = {};
  for (const key of CLIENT_META) if (meta && meta[key] !== undefined) out[key] = meta[key];
  return out;
}

export function fontFaces(fonts) {
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

export function wrapRender(type, source, meta) {
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

export function countInferred(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countInferred(v), 0);
  if (!value || typeof value !== 'object') return 0;
  return (value.source === 'inferred' ? 1 : 0) + Object.values(value).reduce((n, v) => n + countInferred(v), 0);
}

function readStrings(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export const CLIENT_STRINGS = ['core', 'group', 'route', 'anchors', 'mermaid', 'flow', 'read'];

function only(strings, namespaces) {
  if (!namespaces) return strings;
  const out = {};
  for (const [key, value] of Object.entries(strings)) if (namespaces.has(key.split('.')[0])) out[key] = value;
  return out;
}

export function pageStrings(root, lang = 'en', types = null) {
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

export function buildPage(page, result, { root, components }) {
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
