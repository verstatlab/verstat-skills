import assert from 'node:assert/strict';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { readChecksums } from '../src/vendor.mjs';
import { FIXTURE_COMPONENTS, ROOT, appSource, commit, graphPage, makeRepo, notePage, run, tempDir, writeFiles, writePage } from './helpers.mjs';

const repo = makeRepo();

function build(page, opts) {
  const dir = tempDir('verstat-build-');
  const out = join(dir, 'page.html');
  const r = run(['build', writePage(page), '-o', out], opts);
  return { ...r, dir, out, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
}

function embedded(html) {
  const m = html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s);
  assert.ok(m, 'page data script present');
  return JSON.parse(m[1]);
}

describe('build', () => {
  test('writes one self-contained HTML file', () => {
    const r = build(notePage(repo));
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(r.dir), ['page.html']);
    assert.doesNotMatch(r.html, /(src|href)\s*=\s*["']?(https?:)?\/\//i);
    assert.doesNotMatch(r.html, /<link\b/i);
    assert.doesNotMatch(r.html, /<script[^>]*\bsrc=/i);
    assert.match(r.html, /verstat\.register\("fixture-note"/);
  });

  test('embeds the page with anchor lines and the whole anchored file', () => {
    const data = embedded(build(notePage(repo)).html);
    assert.equal(data.blocks[0].anchor.line, 50);
    assert.equal(data.blocks[0].anchor.endLine, 50);
    assert.equal(data.glossary[0].anchor.line, 50);
    const file = data.code['target:src/app.js'];
    assert.equal(file.sha, repo.sha);
    const short = notePage({ ...repo, sha: repo.sha.slice(0, 7) });
    assert.equal(embedded(build(short).html).code['target:src/app.js'].sha, repo.sha);
    assert.equal(file.lines.length, 120);
    assert.equal(file.lines[49], 'function start() {');
    assert.equal(file.chunks, undefined);
    assert.equal(data.blocks[0].anchor.spans, undefined);
    assert.match(data.engine.version, /^\d+\.\d+\.\d+$/);
  });

  test('a file anchor embeds the file and gains no line; range and multi anchors gain their spans', () => {
    const page = notePage(repo);
    page.blocks[0].anchor = { repo: 'target', path: 'README.md' };
    page.blocks[1].claims.push(
      { id: 'p2', text: 'range', anchor: { repo: 'target', path: 'src/app.js', find: 'function start() {', findEnd: '// line 52' } },
      { id: 'p3', text: 'multi', anchor: { repo: 'target', path: 'src/app.js', find: ['  register(handler);', 'function start() {', '  const handler = makeHandler();'] } },
    );
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    const data = embedded(r.html);
    assert.equal(data.blocks[0].anchor.line, undefined);
    assert.deepEqual(data.code['target:README.md'].lines, ['# target']);
    const [, range, multi] = data.blocks[1].claims.map((c) => c.anchor);
    assert.deepEqual([range.line, range.endLine, range.spans], [50, 52, undefined]);
    assert.deepEqual([multi.line, multi.endLine, multi.spans], [50, 50, [[50, 50], [70, 70], [90, 90]]]);
    assert.equal(data.validation.anchors, 5);
  });

  test('a page without a dagre block carries no dagre and no dagre licence', () => {
    const { html } = build(notePage(repo));
    assert.doesNotMatch(html, /dagre/i);
    assert.doesNotMatch(html, /THE SOFTWARE IS PROVIDED "AS IS"/);
  });

  test('every page embeds the Plex faces, the Archivo logo face and their OFL licences', () => {
    const { html } = build(notePage(repo));
    const faces = html.match(/@font-face\{[^}]*\}/g) || [];
    assert.equal(faces.length, 4);
    for (const [family, weight] of [['IBM Plex Sans', 400], ['IBM Plex Sans', 600], ['IBM Plex Mono', 400], ['Archivo', 800]]) {
      assert.ok(
        faces.some((f) => f.includes(`font-family:"${family}"`) && f.includes(`font-weight:${weight}`) && /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)/.test(f)),
        `${family} ${weight} embedded`,
      );
    }
    const licences = html.match(/<script type="text\/plain" id="verstat-licenses">(.*?)<\/script>/s);
    assert.ok(licences, 'licence block present');
    assert.match(licences[1], /IBM Plex Sans 2\.0\.0, IBM Plex Mono 2\.5\.0/);
    assert.match(licences[1], /SIL Open Font License, Version 1\.1/);
    assert.match(licences[1], /Archivo 5\.3\.0 ExtraBold[\s\S]*The Archivo Project Authors/);
  });

  test('the bar carries the Verstat Lab logo in the Archivo face', () => {
    const { html } = build(notePage(repo));
    assert.match(html, /'VERSTAT LAB'/);
    assert.match(html, /\.vs-logo \{[^}]*font-family: "Archivo"/);
  });

  test('both dark-theme blocks set the same tokens to the same values', () => {
    const css = readFileSync(join(ROOT, 'client', 'verstat.css'), 'utf8');
    const block = (selector) => {
      const at = css.indexOf(selector);
      assert.ok(at >= 0, `${selector} present`);
      return css.slice(at, css.indexOf('}', at)).match(/--vs-[\w-]+:[^;]+;/g).sort();
    };
    const media = block(':root:not([data-theme="light"]) {');
    for (const token of ['--vs-bg', '--vs-ink', '--vs-accent', '--vs-accent-ink', '--vs-accent-soft', '--vs-del', '--vs-err']) {
      assert.ok(media.some((d) => d.startsWith(`${token}:`)), `${token} in the dark theme`);
    }
    assert.deepEqual(media, block(':root[data-theme="dark"] {'));
  });

  test('embeds validation counts for the bar', () => {
    const page = notePage(repo);
    page.blocks[1].claims[0].symbol = 'shutdown';
    const data = embedded(build(page).html);
    assert.deepEqual(data.validation, { anchors: 3, inferred: 1 });
  });

  test('a tampered font fails the build', () => {
    const copy = tempDir('verstat-plugin-');
    for (const dir of ['bin', 'client', 'vendor', '.claude-plugin']) cpSync(join(ROOT, dir), join(copy, dir), { recursive: true });
    const font = join(copy, 'vendor', 'plex', 'IBMPlexMono-Regular.subset.woff2');
    writeFileSync(font, Buffer.concat([readFileSync(font), Buffer.from([0])]));
    const r = build(notePage(repo), { bin: join(copy, 'bin', 'verstat.mjs') });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /plex\/IBMPlexMono-Regular\.subset\.woff2 does not match its checksum/);
    assert.equal(r.html, null);
  });

  test('a meta.json with a bad client field is refused', () => {
    for (const [meta, message] of [
      [{ frame: 'Bare' }, /"frame" can only be "bare"/],
      [{ diffMode: 'true' }, /"diffMode" must be true or false/],
      [{ label: 3 }, /"label" must be a non-empty string/],
    ]) {
      const components = tempDir('verstat-components-');
      cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
      writeFileSync(join(components, 'fixture-note', 'meta.json'), JSON.stringify(meta));
      const r = build(notePage(repo), { components });
      assert.equal(r.code, 1);
      assert.match(r.stderr, message);
    }
  });

  test('a font cannot be a block dep', () => {
    const components = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
    writeFileSync(join(components, 'fixture-note', 'meta.json'), JSON.stringify({ deps: ['plex'] }));
    const r = build(notePage(repo), { components });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /vendor entry "plex" is a font/);
  });

  test('a block type registers with its client meta', () => {
    const { html } = build(notePage(repo));
    assert.match(html, /verstat\.register\("fixture-note", [\s\S]*?\}\)\(\), \{"group":"test","diffMode":false\}\);/);
    let meta = null;
    runInNewContext(wrapRender('t', 'export default () => 1;\n', { deps: ['x'], group: 'g', label: 'L', diffMode: true, frame: 'bare' }), {
      verstat: { register: (type, fn, m) => { meta = m; } },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(meta)), { group: 'g', label: 'L', diffMode: true, frame: 'bare' });
  });

  test('a block that needs dagre brings dagre and its licence text', () => {
    const r = build(graphPage(repo));
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /var dagre=/);
    assert.doesNotMatch(r.html, /sourceMappingURL/);
    const licences = r.html.match(/<script type="text\/plain" id="verstat-licenses">(.*?)<\/script>/s);
    assert.ok(licences, 'licence block present');
    assert.match(licences[1], /@dagrejs\/dagre 3\.1\.3/);
    assert.match(licences[1], /Permission is hereby granted, free of charge/);
    assert.doesNotMatch(r.html, /fixture-note/);
  });

  test('an unconfirmed claim is embedded as inferred', () => {
    const page = notePage(repo);
    page.blocks[1].claims[0].symbol = 'shutdown';
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /inferred: \$\.blocks\[1\]\.claims\[0\]/);
    assert.equal(embedded(r.html).blocks[1].claims[0].source, 'inferred');
  });

  test('page text cannot close the data script', () => {
    const page = notePage(repo);
    page.blocks[0].title = '</script><script>alert(1)</script>';
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.html, /<script>alert/);
    assert.equal(embedded(r.html).blocks[0].title, page.blocks[0].title);
  });

  test('an invalid page writes no file', () => {
    const page = notePage(repo);
    page.blocks[0].anchor.find = 'function stop() {';
    const r = build(page);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error: \$\.blocks\[0\]\.anchor\.find: /m);
    assert.equal(r.html, null);
  });

  test('a tampered vendor file fails the build', () => {
    const copy = tempDir('verstat-plugin-');
    for (const dir of ['bin', 'client', 'vendor', '.claude-plugin']) cpSync(join(ROOT, dir), join(copy, dir), { recursive: true });
    const lib = join(copy, 'vendor', 'dagre', 'dagre.min.js');
    writeFileSync(lib, `${readFileSync(lib, 'utf8')} `);
    const bin = join(copy, 'bin', 'verstat.mjs');
    const r = build(graphPage(repo), { bin });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /dagre\/dagre\.min\.js does not match its checksum/);
    assert.equal(r.html, null);
    assert.equal(build(notePage(repo), { bin }).code, 0);
  });

  test('code containing <!-- or </script is refused', () => {
    const components = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
    const render = join(components, 'fixture-note', 'render.js');
    writeFileSync(render, `${readFileSync(render, 'utf8')}\nconst tricky = '<!--<script>';\n`);
    const r = build(notePage(repo), { components });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /render\.js of "fixture-note" contains "<\/script" or "<!--"/);
    assert.equal(r.html, null);
  });

  test('a dep missing from vendor.json is named', () => {
    const components = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
    writeFileSync(join(components, 'fixture-note', 'meta.json'), JSON.stringify({ deps: ['constructor'] }));
    const r = build(notePage(repo), { components });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /unknown vendor library "constructor"/);
  });

  test('a client module and a library stylesheet come only with a block that asks for them', () => {
    const components = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
    writeFileSync(join(components, 'fixture-note', 'meta.json'), JSON.stringify({ deps: ['reactflow', 'react-dom', 'react', 'dagre'], modules: ['flow'] }));
    const r = build(notePage(repo), { components });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /vs\.flow = \{ layout: layout,/);
    assert.match(r.html, /\.vs-flow-node \{/);
    assert.match(r.html, /\.react-flow__attribution \{/);
    const order = ['var dagre=', 'ReactDOM', '.ReactFlow={}', 'vs.register = function', 'vs.flow = {', 'verstat.register("fixture-note"'].map((t) => r.html.indexOf(t));
    assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `libraries load in vendor.json order whatever meta.json says: ${order}`);
    assert.ok(r.html.indexOf('.react-flow__attribution {') < r.html.indexOf('.vs-flow-node {'), 'library CSS before module CSS');
    assert.doesNotMatch(build(notePage(repo)).html, /React|vs-flow/);
  });

  test('a missing or malformed client module is refused', () => {
    const components = tempDir('verstat-components-');
    cpSync(join(FIXTURE_COMPONENTS, 'fixture-note'), join(components, 'fixture-note'), { recursive: true });
    const metaFile = join(components, 'fixture-note', 'meta.json');
    writeFileSync(metaFile, JSON.stringify({ modules: ['nope'] }));
    let r = build(notePage(repo), { components });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /client module "nope" is missing: client\/modules\/nope\.js/);
    writeFileSync(metaFile, JSON.stringify({ modules: ['../core'] }));
    r = build(notePage(repo), { components });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /"modules" must be an array of client module names/);
  });

  test('CRLF lines are embedded without the carriage return', () => {
    const own = makeRepo();
    writeFiles(own.dir, { 'src/app.js': appSource().replace(/\n/g, '\r\n') });
    const sha = commit(own.dir, 'crlf');
    const data = embedded(build(notePage({ dir: own.dir, sha })).html);
    const lines = data.code['target:src/app.js'].lines;
    assert.equal(lines[49], 'function start() {');
    assert.ok(lines.every((l) => !l.endsWith('\r')));
  });

  test('render.js code after the default export runs', () => {
    const wrapped = wrapRender('t', 'const a = 1;\nexport default function (block) {\n  return a + b + block;\n}\nconst b = 2;\n');
    let registered = null;
    runInNewContext(wrapped, { verstat: { register: (type, fn) => { registered = fn; } } });
    assert.equal(registered(10), 13);
  });

  test('checksums are read from a CRLF SHA256SUMS', () => {
    const dir = tempDir('verstat-vendor-');
    writeFileSync(join(dir, 'SHA256SUMS'), `${'a'.repeat(64)}  lib/x.js\r\n`);
    assert.equal(readChecksums(dir).get('lib/x.js'), 'a'.repeat(64));
  });

  test('render.js keeps declaration semantics', () => {
    const load = (source) => {
      let registered = null;
      runInNewContext(wrapRender('t', source), { verstat: { register: (type, fn) => { registered = fn; } } });
      return registered;
    };
    const named = load('export default function render(block) {\n  return block === 0 ? "done" : render(0);\n}\nconst again = () => render(0);\n');
    assert.equal(named(1), 'done');
    const asi = load('export default function (block) {\n  return block * 2;\n}\n[1, 2].forEach(() => {});\n');
    assert.equal(asi(4), 8);
    const arrow = load('export default (block) => block + 1;\n');
    assert.equal(arrow(1), 2);
  });

  test('client CSS containing </style is refused', () => {
    const copy = tempDir('verstat-plugin-');
    for (const dir of ['bin', 'client', 'vendor', '.claude-plugin']) cpSync(join(ROOT, dir), join(copy, dir), { recursive: true });
    writeFileSync(join(copy, 'client', 'theme.css'), '/* </style> */ body { color: red; }\n');
    const r = build(notePage(repo), { bin: join(copy, 'bin', 'verstat.mjs') });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /client\/theme\.css contains "<\/style"/);
  });
});
