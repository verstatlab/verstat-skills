import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writePage } from './helpers.mjs';

const TYPES = ['system-map', 'layers', 'module-card', 'dependency-graph', 'hotspots'];
const GRAPHS = ['system-map', 'dependency-graph'];
const COMPONENTS = join(ROOT, 'components');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function shopRepo() {
  const dir = tempDir('verstat-shop-');
  cpSync(join(FIXTURES, 'repos', 'shop'), dir, { recursive: true });
  git(dir, 'init', '-q');
  return { dir, sha: commit(dir, 'shop') };
}

const shop = shopRepo();

function fixturePage() {
  const page = JSON.parse(readFileSync(join(FIXTURES, 'pages', 'structure.json'), 'utf8'));
  for (const repo of Object.values(page.repos)) {
    repo.sha = shop.sha;
    repo.path = shop.dir;
  }
  return page;
}

function build(page) {
  const out = join(tempDir('verstat-build-'), 'page.html');
  const r = run(['build', writePage(page), '-o', out]);
  return { ...r, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
}

function embedded(html) {
  return JSON.parse(html.match(/<script type="application\/json" id="verstat-page">(.*?)<\/script>/s)[1]);
}

function meta(type) {
  return JSON.parse(readFileSync(join(COMPONENTS, type, 'meta.json'), 'utf8'));
}

function loadRender(type) {
  let registered = null;
  runInNewContext(wrapRender(type, readFileSync(join(COMPONENTS, type, 'render.js'), 'utf8'), meta(type)), {
    verstat: { register: (name, fn, m) => { registered = { name, fn, meta: m }; } },
  });
  return registered;
}

function stub(tag, attrs = {}, children = []) {
  const node = { tag, attrs: { ...attrs }, children: [], classes: new Set(String(attrs.class || '').split(' ').filter(Boolean)) };
  node.classList = {
    add: (c) => node.classes.add(c),
    remove: (c) => node.classes.delete(c),
    toggle: (c, on) => (on ? node.classes.add(c) : node.classes.delete(c)),
  };
  node.setAttribute = (k, v) => { node.attrs[k] = String(v); };
  node.getAttribute = (k) => node.attrs[k];
  node.replaceChildren = (...kids) => { node.children = kids.filter((k) => k !== null && k !== undefined && k !== false); };
  node.appendChild = (k) => node.children.push(k);
  node.querySelector = (sel) => {
    const id = sel.match(/data-part="(.+)"/)[1];
    return find(node, (n) => n.attrs['data-part'] === id);
  };
  [].concat(children).forEach((c) => { if (c !== null && c !== undefined && c !== false) node.children.push(c); });
  return node;
}

function find(node, test) {
  if (!node || typeof node !== 'object') return null;
  if (test(node)) return node;
  for (const c of node.children) {
    const hit = find(c, test);
    if (hit) return hit;
  }
  return null;
}

function findAll(node, test, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (test(node)) out.push(node);
  node.children.forEach((c) => findAll(c, test, out));
  return out;
}

const text = (node) => (typeof node === 'string' ? node : node && node.children ? node.children.map(text).join(' ') : '');

function renderWithFlow(type, block) {
  const context = createContext({ structuredClone, console: { warn: () => {} }, window: {} });
  const mounted = [];
  const opened = [];
  const events = [];
  let fn = null;
  context.verstat = {
    register: (name, f) => { fn = f; },
    flow: { mount: (host, props) => { const m = { props, updates: [], update: (p) => m.updates.push(p), destroy() { m.destroyed = true; } }; mounted.push(m); return m; } },
    anchors: { open: (a) => opened.push(a.path) },
  };
  runInContext(wrapRender(type, readFileSync(join(COMPONENTS, type, 'render.js'), 'utf8'), meta(type)), context);
  const focus = [];
  const bus = [];
  const ctx = {
    ...i18n(),
    on: (ev, f) => bus.push([ev, f]),
    el: stub,
    svg: stub,
    part: (n, id) => { if (n && id !== undefined) n.attrs['data-part'] = id; return n; },
    anchorChip: (a) => stub('chip', { class: 'vs-chip' }, a.path),
    sourceChip: (src) => (src ? stub('chip', { class: 'vs-source' }, src) : null),
    isInferred: (o) => !!(o && o.source === 'inferred'),
    onFocus: (f) => focus.push(f),
    onCleanup: () => {},
    emit: (event, detail) => events.push([event, detail]),
  };
  const out = fn(block, ctx);
  return {
    out, mounted, opened, events, bus, last: () => mounted[mounted.length - 1],
    focus: (id) => focus.forEach((f) => f(id)),
    busFocus: (detail) => bus.filter(([ev]) => ev === 'focus').forEach(([, f]) => f(detail)),
  };
}

function loadFlow() {
  const context = createContext({
    structuredClone,
    React: { createElement: () => ({}) },
    ReactDOM: { createRoot: () => ({ render() {}, unmount() {} }) },
    ReactFlow: {},
  });
  context.window = context;
  runInContext(readFileSync(join(ROOT, 'vendor', 'dagre', 'dagre.min.js'), 'utf8'), context);
  runInContext(readFileSync(join(ROOT, 'client', 'modules', 'flow.js'), 'utf8'), context);
  return context.verstat.flow;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const blockOf = (page, type) => page.blocks.find((b) => b.type === type);

describe('structure blocks', () => {
  test('each type has schema, render and meta, prints its schema and sits in the structure group', () => {
    for (const type of TYPES) {
      for (const file of ['schema.json', 'render.js', 'meta.json']) {
        assert.ok(existsSync(join(COMPONENTS, type, file)), `${type}/${file}`);
      }
      const r = run(['schema', type], { components: null });
      assert.equal(r.code, 0, `${type}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).properties.type.const, type);
      assert.equal(meta(type).group, 'structure');
      assert.deepEqual(meta(type).deps, GRAPHS.includes(type) ? ['dagre', 'react', 'react-dom', 'reactflow'] : [], `${type} deps`);
      assert.deepEqual(meta(type).modules, GRAPHS.includes(type) ? ['flow'] : undefined, `${type} modules`);
    }
  });

  test('the structure page validates and builds with dagre, all five types and counts', () => {
    const page = fixturePage();
    assert.deepEqual([...new Set(page.blocks.map((b) => b.type))].sort(), [...TYPES].sort());
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.equal(v.stdout, 'ok\n');
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /dagre/);
    assert.match(r.html, /<script type="text\/plain" id="verstat-licenses">[\s\S]*dagre/);
    assert.match(r.html, /<script type="text\/plain" id="verstat-licenses">[\s\S]*reactflow 11\.11\.4[\s\S]*webkid GmbH/);
    assert.match(r.html, /\.react-flow__attribution\{|\.react-flow__attribution \{/);
    assert.equal(r.html.split('.ReactFlow={}').length - 1, 1, 'React Flow inlined once for two graph blocks');
    for (const type of TYPES) {
      assert.ok(r.html.includes(`verstat.register(${JSON.stringify(type)}, `), `${type} registered`);
      assert.ok(r.html.includes(`{"group":"structure","label":${JSON.stringify(meta(type).label)}`), `${type} meta`);
    }
    const data = embedded(r.html);
    assert.equal(data.validation.anchors, 24);
    assert.equal(data.validation.inferred, 4);
  });

  test('a page without graph blocks does not inline dagre', () => {
    const page = fixturePage();
    page.blocks = page.blocks.filter((b) => !GRAPHS.includes(b.type));
    page.route = page.route.filter((s) => page.blocks.some((b) => b.id === s.block));
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.html, /dagre/i);
    assert.doesNotMatch(r.html, /React|react-flow|vs-flow/);
  });

  test('a broken anchor in a structure block is rejected with its path', () => {
    const page = fixturePage();
    const at = page.blocks.findIndex((b) => b.type === 'layers');
    page.blocks[at].layers[1].files[0].anchor.find = 'no such text anywhere';
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes(`$.blocks[${at}].layers[1].files[0].anchor`), r.stderr);
  });

  test('a hotspot file with no lines is rejected', () => {
    const page = fixturePage();
    const at = page.blocks.findIndex((b) => b.type === 'hotspots');
    page.blocks[at].groups[0].files[0].lines = 0;
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes(`$.blocks[${at}].groups[0].files[0].lines`), r.stderr);
  });

  test('every render.js loads through wrapRender', () => {
    for (const type of TYPES) {
      const registered = loadRender(type);
      assert.equal(registered.name, type);
      assert.equal(typeof registered.fn, 'function');
    }
  });

  test('system-map levels: ordered, first non-empty one per name, parts found by level', () => {
    const { levels, levelOfPart } = loadRender('system-map').fn;
    const block = blockOf(fixturePage(), 'system-map');
    assert.deepEqual(plain(levels(block).map((l) => l.level)), ['system', 'service', 'module']);
    assert.equal(levelOfPart(block, 'm-capture'), 'module');
    assert.equal(levelOfPart(block, 'l-mark'), 'service');
    assert.equal(levelOfPart(block, 'shop-sys'), 'system');
    assert.equal(levelOfPart(block, 'nope'), null);
    assert.equal(levelOfPart(block, 'platform'), 'system');
    assert.equal(levelOfPart(block, 'platform', 'service'), 'service');
    assert.equal(levelOfPart(block, 'm-capture', 'service'), 'module');

    const shuffled = {
      levels: [
        { level: 'module', nodes: [{ id: 'm', label: 'm', kind: 'module' }] },
        { level: 'system', nodes: [] },
        { level: 'system', nodes: [{ id: 's', label: 's', kind: 'service' }] },
        { level: 'system', nodes: [{ id: 's2', label: 's2', kind: 'service' }] },
      ],
    };
    assert.deepEqual(plain(levels(shuffled).map((l) => l.nodes[0].id)), ['s', 'm']);
    assert.equal(levelOfPart(shuffled, 's2'), null);
  });

  test('dependency-graph cycles: none, a two-node cycle, a self-loop', () => {
    const { cycles } = loadRender('dependency-graph').fn;
    const nodes = ['a', 'b', 'c'].map((id) => ({ id }));
    assert.deepEqual(plain(cycles(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }])), { components: [], edges: [false, false] });
    const two = plain(cycles(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'c' }]));
    assert.equal(two.components.length, 1);
    assert.deepEqual([...two.components[0]].sort(), ['a', 'b']);
    assert.deepEqual(two.edges, [true, true, false]);
    const self = plain(cycles(nodes, [{ from: 'c', to: 'c' }, { from: 'a', to: 'c' }, { from: 'a', to: 'zz' }]));
    assert.deepEqual(self.components, [['c']]);
    assert.deepEqual(self.edges, [true, false, false]);
  });

  test('hotspots squarify: areas proportional, tiles inside the box; heat stays in bounds', () => {
    const { squarify, heat } = loadRender('hotspots').fn;
    const items = [60, 30, 20, 10, 5, 1].map((value, i) => ({ value, i }));
    const rects = squarify(items, 0, 0, 400, 300);
    assert.equal(rects.length, items.length);
    const total = items.reduce((s, x) => s + x.value, 0);
    const eps = 1e-6;
    for (const r of rects) {
      assert.ok(Math.abs(r.w * r.h - (r.item.value / total) * 400 * 300) < 1e-3, `area of ${r.item.value}`);
      assert.ok(r.x >= -eps && r.y >= -eps && r.x + r.w <= 400 + eps && r.y + r.h <= 300 + eps, `inside: ${JSON.stringify(r)}`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > eps && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > eps;
        assert.ok(!overlap, `tiles ${i} and ${j} overlap`);
      }
    }
    assert.equal(squarify([], 0, 0, 10, 10).length, 0);
    assert.equal(heat(0, 10), 0);
    assert.equal(heat(10, 10), 55);
    assert.equal(heat(50, 10), 55);
    assert.equal(heat(3, 0), 0);
    const mid = heat(5, 10);
    assert.ok(mid > 0 && mid < 55);
  });

  test('hotspots light the group of the hovered dependency-graph module and clear it on leave', () => {
    const page = fixturePage();
    const block = blockOf(page, 'hotspots');
    const r = renderWithFlow('hotspots', block);
    const map = find(r.out, (n) => n.classes && n.classes.has('vs-hs-map'));
    const cols = map.children;
    const hover = (detail) => r.bus.filter(([ev]) => ev === 'dependency-graph:hover').forEach(([, f]) => f(detail));
    const lit = () => cols.map((c) => c.classes.has('vs-hs-lit'));

    hover({ block: 'deps', node: 'd-capture', label: 'payments/capture.js', cluster: 'src', paths: [] });
    assert.deepEqual(lit(), [true, false]);
    assert.ok(map.classes.has('vs-hs-linked'));
    hover({ block: 'deps', node: 'd-test', label: 'capture.test.js', cluster: 'test', paths: [] });
    assert.deepEqual(lit(), [false, true]);
    hover({ block: 'deps', node: 'd-x', label: 'x', cluster: null, paths: ['test/helpers.js'] });
    assert.deepEqual(lit(), [false, true], 'a file in the same folder matches');
    hover({ block: 'deps', node: 'd-y', label: 'nowhere.js', cluster: null, paths: ['lib/nowhere.js'] });
    assert.deepEqual(lit(), [false, false]);
    assert.ok(!map.classes.has('vs-hs-linked'), 'no match dims nothing');
    hover({ block: 'deps', node: null, label: null, cluster: null, paths: [] });
    assert.deepEqual(lit(), [false, false]);

    const tile = find(map, (n) => n.attrs['data-part'] === 'h-order');
    assert.match(tile.attrs.style, /var\(--vs-accent\) \d+%, var\(--vs-surface\)/);
    tile.attrs.onclick();
    const key = (k) => tile.attrs.onkeydown({ key: k, preventDefault() {} });
    key('Enter');
    key(' ');
    key('x');
    assert.deepEqual(r.opened, Array(3).fill('src/orders/order.js'), 'click, Enter and Space open the file');
    assert.equal(tile.attrs.role, 'button');
    assert.match(tile.attrs['aria-label'], /^src\/orders\/order\.js, 27 /);

    hover({ block: 'deps', node: 'd-z', label: 'order.js', cluster: null, paths: ['lib/order.js'] });
    assert.deepEqual(lit(), [false, false], 'a bare file name with paths does not match by suffix');
  });

  test('layers draw each file as a code chip with its label', () => {
    const page = fixturePage();
    const labels = [];
    const ctx = {
      ...i18n(),
      el: stub,
      part: (n, id) => { if (n && id !== undefined) n.attrs['data-part'] = id; return n; },
      anchorChip: (a, label) => { labels.push([a.path, label]); return stub('chip', { class: 'vs-chip vs-anchor' }, label || a.path); },
      sourceChip: (src) => (src ? stub('chip', { class: 'vs-source' }, src) : null),
      isInferred: (o) => !!(o && o.source === 'inferred'),
    };
    const out = loadRender('layers').fn(blockOf(page, 'layers'), ctx);
    assert.deepEqual(labels.map(([p, l]) => p + (l ? ' ' + l : '')), [
      'test/capture.test.js',
      'src/payments/capture.js',
      'src/payments/capture.js capture()',
      'src/payments/capture.js',
      'src/orders/order.js order',
    ]);
    assert.equal(findAll(out, (n) => n.tag === 'span' && n.classes.has('vs-chip')).length, 0, 'no grey labels left');
  });

  test('the graph blocks hand React Flow their nodes, frames and edges and follow route focus', () => {
    const page = fixturePage();

    const deps = renderWithFlow('dependency-graph', blockOf(page, 'dependency-graph'));
    const dspec = deps.last().props.spec;
    assert.equal(dspec.rankdir, 'TB');
    assert.equal(deps.last().props.height, 460);
    assert.deepEqual(plain(dspec.groups), [{ id: 'src', title: 'src' }, { id: 'test', title: 'test' }]);
    assert.deepEqual(plain(dspec.nodes.map((n) => [n.id, n.group, !!n.hot])), [['d-order', 'src', false], ['d-capture', 'src', true], ['d-test', 'test', false]]);
    assert.deepEqual(plain(dspec.edges.map((e) => [e.s, e.t, !!e.on, !!e.dash])), [
      ['d-capture', 'd-order', true, false], ['d-order', 'd-capture', true, true], ['d-test', 'd-capture', false, false], ['d-test', 'd-order', false, false],
    ]);
    assert.match(text(deps.out), /Cycles: 1/);
    deps.last().props.onNodeEnter('d-order');
    assert.deepEqual(plain(deps.last().updates.at(-1)), { hl: ['d-order'] });
    assert.deepEqual(plain(deps.events.at(-1)), ['dependency-graph:hover', { block: 'deps', node: 'd-order', label: 'orders/order.js', cluster: 'src', paths: ['src/orders/order.js'] }]);
    deps.last().props.onNodeLeave('d-order');
    assert.equal(deps.events.at(-1)[1].node, null);
    deps.last().props.onNodeClick('d-order');
    assert.deepEqual(deps.opened, ['src/orders/order.js']);
    deps.focus('d-capture');
    assert.deepEqual(plain(deps.last().updates.at(-1)), { focus: 'd-capture' });
    deps.busFocus({ block: 'deps', part: 'd-capture' });
    assert.deepEqual(plain(deps.last().updates.at(-1)), { focus: 'd-capture' });
    deps.busFocus({ block: 'hot', part: 'h-capture' });
    assert.deepEqual(plain(deps.last().updates.at(-1)), { focus: null }, 'focus in another block clears it');
    deps.focus('d-capture');
    deps.busFocus({ block: 'deps', part: null });
    assert.deepEqual(plain(deps.last().updates.at(-1)), { focus: null }, 'a step without focus clears it');
    assert.ok(dspec.edges.every((e) => e.id === undefined), 'React Flow edge ids are made by the wrapper');
    assert.deepEqual(plain(dspec.edges.map((e) => e.part)), ['e-import', null, null, null]);
    const detail = find(deps.out, (n) => n.classes.has('vs-flow-panel'));
    assert.match(text(detail), /payments\/capture\.js/);
    assert.match(text(detail), /via a callback/);

    const map = renderWithFlow('system-map', blockOf(page, 'system-map'));
    assert.match(map.last().props.ariaLabel, /system$/);
    assert.equal(map.last().props.height, 440);
    const sspec = map.last().props.spec;
    assert.deepEqual(plain(sspec.groups.map((g) => g.id)), ['shop', 'platform']);
    assert.equal(sspec.nodes.find((n) => n.id === 'gateway').dash, true, 'an external node is dashed');
    assert.equal(sspec.edges.find((e) => e.part === 'l-charge').on, true);
    map.focus('m-capture');
    assert.match(map.last().props.ariaLabel, /module$/);
    assert.equal(map.last().props.focus, 'm-capture');
    assert.ok(map.mounted[0].destroyed, 'switching level unmounts the old diagram');
    assert.match(text(find(map.out, (n) => n.classes.has('vs-flow-panel'))), /payments\/capture\.js/);
    map.last().props.onNodeClick('m-capture');
    assert.deepEqual(map.opened, ['src/payments/capture.js']);
    find(map.out, (n) => n.tag === 'button' && text(n) === 'service').attrs.onclick();
    assert.match(map.last().props.ariaLabel, /service$/);
    map.focus('platform');
    assert.match(map.last().props.ariaLabel, /service$/);
    assert.deepEqual(plain(map.last().updates.at(-1)), { focus: 'platform' });
    map.focus('web');
    assert.match(map.last().props.ariaLabel, /system$/);
  });

  test('flow layout: a node with loops keeps room above and below from the nodes of its rank', () => {
    const LOOP_ROOM = 42;
    const out = loadFlow().layout({
      rankdir: 'LR',
      nodes: [{ id: 'a', title: 'alpha' }, { id: 'b', title: 'beta' }, { id: 'c', title: 'gamma' }, { id: 'd', title: 'delta' }],
      edges: [{ s: 'a', t: 'b' }, { s: 'a', t: 'c' }, { s: 'a', t: 'd' }, { s: 'c', t: 'c' }, { s: 'c', t: 'c' }],
    });
    const c = out.nodes.find((x) => x.id === 'c');
    for (const n of out.nodes.filter((x) => x.id !== 'c' && x.x < c.x + c.w && x.x + x.w > c.x)) {
      assert.ok(n.y + n.h <= c.y - LOOP_ROOM || n.y >= c.y + c.h + LOOP_ROOM, `${n.id} stays clear of the loops of c`);
    }
    assert.ok(out.nodes.filter((x) => x.id !== 'c' && x.x < c.x + c.w && x.x + x.w > c.x).length === 2, 'b and d share the rank of c');
  });

  test('flow layout: no edge crosses a node it does not connect, no label sits on a node or another label', () => {
    const graphs = {
      'TB dependency graph': {
        rankdir: 'TB',
        groups: [{ id: 'core', title: 'core' }, { id: 'infra', title: 'infrastructure' }],
        nodes: [
          { id: 'entry', title: 'src/entry.js' },
          { id: 'orders', title: 'src/orders.js', group: 'core' },
          { id: 'billing', title: 'src/billing.js', group: 'core' },
          { id: 'sweep', title: 'src/jobs/sweep.js', group: 'core' },
          { id: 'settings', title: 'src/settings.js', group: 'infra' },
          { id: 'store', title: 'src/store.js', group: 'infra' },
          { id: 'bus', title: 'src/bus.js', group: 'infra' },
          { id: 'mail', title: 'src/mail.js', group: 'infra' },
        ],
        edges: [
          { s: 'entry', t: 'orders' }, { s: 'entry', t: 'billing' }, { s: 'entry', t: 'sweep' }, { s: 'entry', t: 'mail' },
          { s: 'orders', t: 'billing', label: 'now also charge' }, { s: 'orders', t: 'settings' }, { s: 'orders', t: 'store' },
          { s: 'orders', t: 'bus' }, { s: 'billing', t: 'settings', label: 'new' }, { s: 'billing', t: 'store' },
          { s: 'billing', t: 'bus' }, { s: 'sweep', t: 'orders' }, { s: 'mail', t: 'bus' }, { s: 'billing', t: 'store', label: 'again' },
        ],
      },
      'LR state machine': {
        rankdir: 'LR',
        nodes: [
          { id: 'start', type: 'start' }, { id: 'draft', title: 'draft' }, { id: 'open', title: 'open' },
          { id: 'grace', title: 'grace', sub: 'three days' }, { id: 'late', title: 'late' }, { id: 'closed', title: 'closed' },
        ],
        edges: [
          { s: 'start', t: 'draft' }, { s: 'draft', t: 'open', label: 'submit' }, { s: 'open', t: 'grace', label: 'due date passes' },
          { s: 'grace', t: 'late', label: 'grace period ends\nwithout payment' }, { s: 'grace', t: 'closed', label: 'paid in full' },
          { s: 'late', t: 'closed', label: 'paid with fine' }, { s: 'late', t: 'open', label: 'extension granted' },
          { s: 'grace', t: 'open', label: 'reopened' }, { s: 'open', t: 'closed', label: 'cancelled' },
          { s: 'open', t: 'closed', label: 'refunded' }, { s: 'late', t: 'late', label: 'reminder sent' },
        ],
      },
    };
    const flow = loadFlow();
    const inside = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
    const crosses = (a, b, box) => {
      const n = Math.ceil(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) + 1;
      for (let k = 0; k <= n; k++) if (inside(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, box)) return true;
      return false;
    };
    const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
    for (const [name, spec] of Object.entries(graphs)) {
      const lay = flow.layout(spec);
      const nodes = Object.fromEntries(lay.nodes.map((n) => [n.id, { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h }]));
      const labels = [];
      const issues = [];
      lay.edges.forEach((le, i) => {
        const e = spec.edges[i];
        if (le.type === 'loop') return;
        if (!le.points) { issues.push(`edge ${e.s} → ${e.t} has no route`); return; }
        if (le.label) labels.push({ i, name: `"${e.label}"`, x0: le.label.x - le.label.w / 2 + 1, y0: le.label.y - le.label.h / 2 + 1, x1: le.label.x + le.label.w / 2 - 1, y1: le.label.y + le.label.h / 2 - 1, at: le.label });
      });
      lay.edges.forEach((le, i) => {
        const e = spec.edges[i];
        if (!le.points) return;
        const segs = le.points.slice(1).map((b, j) => [le.points[j], b]);
        for (const [a, b] of segs) {
          if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) issues.push(`edge ${e.s} → ${e.t} has a diagonal segment`);
          for (const [id, box] of Object.entries(nodes)) if (id !== e.s && id !== e.t && crosses(a, b, box)) issues.push(`edge ${e.s} → ${e.t} crosses ${id}`);
          for (const l of labels) if (l.i !== i && crosses(a, b, l)) issues.push(`edge ${e.s} → ${e.t} crosses label ${l.name}`);
        }
        const own = labels.find((l) => l.i === i);
        if (own && !segs.some(([a, b]) => Math.min(a.x, b.x) - 0.5 <= own.at.x && own.at.x <= Math.max(a.x, b.x) + 0.5 && Math.min(a.y, b.y) - 0.5 <= own.at.y && own.at.y <= Math.max(a.y, b.y) + 0.5)) {
          issues.push(`label ${own.name} is off its edge`);
        }
      });
      labels.forEach((l, a) => {
        for (const [id, box] of Object.entries(nodes)) if (overlap(l, box)) issues.push(`label ${l.name} sits on ${id}`);
        for (const m of labels.slice(a + 1)) if (overlap(l, m)) issues.push(`label ${l.name} sits on label ${m.name}`);
      });
      assert.deepEqual([...new Set(issues)], [], name);
      assert.ok(labels.length >= 2, `${name} has labelled edges`);
    }
  });

  test('flow labels: stacked above every edge layer, on the surface they sit on', () => {
    const flow = loadFlow();
    const spec = {
      rankdir: 'LR',
      groups: [{ id: 'g', title: 'repo' }],
      nodes: [{ id: 'a', title: 'alpha', group: 'g' }, { id: 'b', title: 'beta', group: 'g' }, { id: 'c', title: 'gamma' }],
      edges: [{ s: 'a', t: 'b', label: 'inside' }, { s: 'b', t: 'c', label: 'across', on: true }, { s: 'c', t: 'a', dash: true, label: 'back' }],
    };
    const lay = flow.layout(spec);
    const levels = flow.toEdges(lay, spec, {}, null).map((e) => e.zIndex);
    const css = readFileSync(join(ROOT, 'client', 'modules', 'flow.css'), 'utf8');
    const layer = css.match(/\.vs-flow \.react-flow__edgelabel-renderer \{[^}]*z-index:\s*(-?\d+)/);
    assert.ok(layer, 'the edge-label layer has a z-index');
    assert.ok(levels.every((z) => Number(layer[1]) > z), `label layer ${layer[1]} above edge levels ${levels}`);
    assert.match(css, /\.vs-flow-label\.is-framed \{[^}]*background: var\(--vs-surface\)/, 'a label on a frame takes its surface');

    const frame = lay.groups[0];
    assert.equal(flow.frameAt(lay.groups, frame.x + 1, frame.y + 1).id, 'g', 'a point on the frame head');
    assert.equal(flow.frameAt(lay.groups, frame.x + frame.w / 2, frame.y + frame.h / 2).id, 'g');
    assert.equal(flow.frameAt(lay.groups, frame.x - 1, frame.y + 1), null, 'left of the frame');
    assert.equal(flow.frameAt(lay.groups, frame.x + 1, frame.y + frame.h + 1), null, 'below the frame');
    assert.equal(flow.frameAt(undefined, 0, 0), null, 'no frames');
    const inside = lay.edges[0].label;
    assert.ok(flow.frameAt(lay.groups, inside.x, inside.y), 'the label between two framed nodes of one rank sits on the frame');

    const rects = [{ id: 'g', x: 0, y: 0, w: 10, h: 10 }];
    assert.ok(flow.toEdges(lay, spec, {}, null, null, rects).every((e) => e.data.frames === rects), 'edges carry the current frames');
    assert.ok(flow.toEdges(lay, spec, {}, null).every((e) => Array.isArray(e.data.frames) && e.data.frames.length === 0), 'no frames given');
  });

  test('flow layout: frames hold their nodes, back edges and loops get their own handles', () => {
    const flow = loadFlow();
    const out = flow.layout({
      rankdir: 'LR',
      groups: [{ id: 'g', title: 'repo' }],
      nodes: [
        { id: 'a', title: 'alpha', group: 'g' },
        { id: 'b', title: 'beta', sub: 'second', group: 'g' },
        { id: 'c', title: 'gamma' },
        { id: 's', type: 'start' },
      ],
      edges: [
        { id: 'e0', s: 's', t: 'a' },
        { id: 'e1', s: 'a', t: 'b', label: 'go' },
        { id: 'e2', s: 'b', t: 'c' },
        { id: 'e3', s: 'c', t: 'a' },
        { id: 'e4', s: 'b', t: 'b' },
        { id: 'e5', s: 'b', t: 'b' },
        { id: 'e6', s: 'a', t: 'b' },
      ],
    });
    const frame = out.groups[0];
    for (const id of ['a', 'b']) {
      const n = out.nodes.find((x) => x.id === id);
      assert.equal(n.group, 'g');
      assert.ok(n.x >= frame.x && n.y >= frame.y && n.x + n.w <= frame.x + frame.w && n.y + n.h <= frame.y + frame.h, `${id} inside its frame`);
      assert.deepEqual(plain(n.position), { x: n.x - frame.x, y: n.y - frame.y });
    }
    const c = out.nodes.find((x) => x.id === 'c');
    assert.equal(c.group, null);
    assert.ok(c.x >= frame.x + frame.w || c.y >= frame.y + frame.h || c.y + c.h <= frame.y, 'a node outside the group is outside the frame');
    assert.deepEqual(plain(out.nodes.find((x) => x.id === 's')).w, 10);
    const edge = (id) => plain(out.edges.find((e) => e.id === id));
    assert.deepEqual([edge('e1').sh, edge('e1').th, edge('e1').type], ['r', 'l', 'vs']);
    assert.deepEqual([edge('e3').sh, edge('e3').th], ['b', 'b'], 'a back edge goes under');
    assert.deepEqual([edge('e4').type, edge('e4').up, edge('e4').sh, edge('e4').th], ['loop', true, 't1', 't2']);
    assert.deepEqual([edge('e5').type, edge('e5').up, edge('e5').sh], ['loop', false, 'b1']);
    assert.deepEqual([edge('e6').sh, edge('e6').th], ['r1', 'l1'], 'a parallel edge takes another slot');
    const box = (id) => out.nodes.find((x) => x.id === id);
    const ends = (id) => { const p = edge(id).points; return [p[0], p[p.length - 1]]; };
    assert.deepEqual([ends('e1')[0].x, ends('e1')[1].x, edge('e1').entry], [box('a').x + box('a').w, box('b').x, 'left'], 'a forward route leaves right, enters left');
    assert.deepEqual([ends('e3')[0].x, ends('e3')[1].x, edge('e3').entry], [box('c').x, box('a').x + box('a').w, 'right'], 'a back route leaves left, enters right');
    assert.ok(edge('e1').label.x > box('a').x + box('a').w && edge('e1').label.x < box('b').x, 'the label sits between its ends');
    assert.equal(edge('e4').points, undefined, 'a loop has no route');
    const b = out.nodes.find((x) => x.id === 'b');
    assert.ok(b.y - 42 >= frame.y && b.y + b.h + 42 <= frame.y + frame.h, 'the frame holds the loops');
    assert.ok(out.width > 0 && out.height > 0);

    const spec = {
      nodes: [{ id: 'a', title: 'alpha', group: 'g', hot: true }, { id: 'b', title: 'beta' }],
      groups: [{ id: 'g', title: 'repo' }],
      edges: [{ s: 'a', t: 'b', part: 'edge-1', key: 'k1', label: 'one\ntwo', aria: 'alpha → beta' }, { s: 'b', t: 'a', part: 'e0', on: true }],
    };
    const lay = flow.layout(spec);
    const nodes = plain(flow.toNodes(lay, spec, { hl: ['b'], focus: 'a' }, null, null));
    assert.deepEqual(nodes.map((n) => [n.id, n.type, n.parentNode || null]), [['g', 'repo', null], ['a', 'vs', 'g'], ['b', 'vs', null]]);
    assert.deepEqual(nodes.map((n) => [n.data.hl, n.data.focus]), [[undefined, false], [false, true], [true, false]]);
    assert.equal(nodes[1].data.hot, true);
    const moved = flow.toNodes(lay, spec, {}, [{ id: 'a', position: { x: 1, y: 2 } }], null);
    assert.deepEqual(plain(moved.find((n) => n.id === 'a').position), { x: 1, y: 2 }, 'a dragged node keeps its place');
    const edges = plain(flow.toEdges(lay, spec, { sel: 'k1', focus: 'e0' }, null));
    assert.deepEqual(edges.map((e) => e.id), ['e0', 'e1'], 'ids by index, an author id "e0" stays a part');
    assert.deepEqual(edges.map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle]), [['a', 'b', 's-r', 't-l'], ['b', 'a', 's-b1', 't-b1']], 'the reverse edge of a pair goes under, in another slot');
    assert.deepEqual(edges.map((e) => [e.data.on, e.data.focus, e.zIndex]), [[true, false, 2], [true, true, 2]]);
    assert.equal(plain(flow.toEdges(lay, spec, {}, null))[0].data.on, false);
    assert.ok(edges.every((e) => e.data.points && e.data.entry), 'edges follow their routes');
    assert.deepEqual(plain(edges[0].data.at), plain(lay.edges[0].label), 'the label at the reserved place');
    const dragged = plain(flow.toEdges(lay, spec, {}, null, new Set(['a'])));
    assert.deepEqual(dragged.map((e) => [e.data.points === undefined, e.sourceHandle]), [[true, 's-r'], [true, 's-b1']], 'an edge of a moved node falls back to its handles');
    const state = flow.toNodes(lay, spec, {}, null, null);
    assert.deepEqual([...flow.movedNodes(lay, state)], [], 'nothing moved at the layout');
    const frameMoved = state.map((n) => (n.id === 'g' ? { ...n, position: { x: n.position.x + 30, y: n.position.y } } : n));
    assert.deepEqual([...flow.movedNodes(lay, frameMoved)], ['a'], 'a dragged frame moves its nodes');
    const nodeMoved = state.map((n) => (n.id === 'b' ? { ...n, position: { x: n.position.x, y: n.position.y + 0.3 } } : n));
    assert.deepEqual([...flow.movedNodes(lay, nodeMoved)], [], 'a sub-pixel shift is not a move');
    const picks = flow.toEdges(lay, spec, {}, () => {});
    assert.deepEqual([typeof picks[0].data.onPick, picks[0].data.aria, picks[1].data.onPick], ['function', 'alpha → beta', null], 'a keyed edge is pickable');
    const handle = flow.mount({}, { spec });
    assert.throws(() => handle.update({ spec }), /spec is set at mount/);
    handle.update({ sel: 'k1' });
  });

  test('empty structure blocks validate and render nothing', () => {
    const page = fixturePage();
    const byType = Object.fromEntries(page.blocks.map((b) => [b.type, b]));
    byType.layers.layers = [];
    byType.hotspots.groups = [];
    byType['dependency-graph'].nodes = [];
    byType['dependency-graph'].edges = [];
    byType['system-map'].levels = [{ level: 'system', nodes: [] }];
    page.route = [];
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 0, r.stderr);

    const ctx = { ...i18n(), page, el: () => ({}), svg: () => ({}), on: () => {}, onFocus: () => {}, part: (n) => n, isInferred: () => false };
    for (const type of ['layers', 'hotspots', 'dependency-graph', 'system-map']) {
      assert.equal(loadRender(type).fn(byType[type], ctx), null, type);
    }
  });
});
