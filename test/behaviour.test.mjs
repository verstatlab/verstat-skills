import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { wrapRender } from '../src/build.mjs';
import { ROOT, commit, git, i18n, run, tempDir, writePage } from './helpers.mjs';

const TYPES = ['sequence', 'path-tracer', 'state-machine', 'decision-table', 'calculation', 'simulator', 'timeline', 'event-topology'];
const DIFF_TYPES = ['sequence', 'state-machine', 'decision-table'];
const COMPONENTS = join(ROOT, 'components');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function checkoutRepo() {
  const dir = tempDir('verstat-checkout-');
  cpSync(join(FIXTURES, 'repos', 'checkout'), dir, { recursive: true });
  cpSync(join(FIXTURES, 'repos', 'checkout-base'), dir, { recursive: true });
  git(dir, 'init', '-q');
  const base = commit(dir, 'base');
  cpSync(join(FIXTURES, 'repos', 'checkout'), dir, { recursive: true });
  const head = commit(dir, 'head');
  return { dir, base, head };
}

const checkout = checkoutRepo();

function fixturePage(name) {
  const page = JSON.parse(readFileSync(join(FIXTURES, 'pages', `${name}.json`), 'utf8'));
  for (const [repoName, repo] of Object.entries(page.repos)) {
    repo.sha = repoName.endsWith('@base') ? checkout.base : checkout.head;
    repo.path = checkout.dir;
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

function sandbox() {
  const box = {};
  box.window = box;
  runInNewContext(readFileSync(join(ROOT, 'client', 'mermaid.js'), 'utf8'), box);
  box.verstat.register = (name, fn, m) => { box.registered = { name, fn, meta: m }; };
  return box;
}

function loadRender(type, box = sandbox()) {
  runInNewContext(wrapRender(type, readFileSync(join(COMPONENTS, type, 'render.js'), 'utf8'), meta(type)), box);
  return { ...box.registered, behavior: box.verstat.behavior };
}

const blockOf = (page, type) => page.blocks.find((b) => b.type === type);

const TEXT = '(?:[^:;#"\\n]|#\\d+;)+';
const MERMAID_STATE = new RegExp(`^(stateDiagram-v2|  state "${TEXT}" as n\\w+|  \\[\\*\\] --> n\\w+|  n\\w+ --> \\[\\*\\]|  n\\w+ --> n\\w+(: ${TEXT})?)$`);
const MERMAID_SEQ = new RegExp(`^(sequenceDiagram|  participant n\\w+ as ${TEXT}|  n\\w+(->>|-->>|-x)n\\w+: ${TEXT})$`);
const plain = (v) => JSON.parse(JSON.stringify(v));

describe('behaviour blocks', () => {
  test('each type has schema, render and meta, prints its schema, and declares diff mode where it has one', () => {
    for (const type of TYPES) {
      for (const file of ['schema.json', 'render.js', 'meta.json']) {
        assert.ok(existsSync(join(COMPONENTS, type, file)), `${type}/${file}`);
      }
      const r = run(['schema', type], { components: null });
      assert.equal(r.code, 0, `${type}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).properties.type.const, type);
      const m = meta(type);
      assert.equal(m.group, 'behavior', type);
      assert.equal(typeof m.label, 'string', type);
      assert.equal(m.diffMode, DIFF_TYPES.includes(type), `${type} diffMode`);
      assert.deepEqual(m.deps, type === 'state-machine' ? ['dagre', 'react', 'react-dom', 'reactflow'] : [], `${type} deps`);
      assert.deepEqual(m.modules, type === 'state-machine' ? ['flow'] : undefined, `${type} modules`);
    }
  });

  test('the behaviour page validates with its inferred claims and builds with every type', () => {
    const page = fixturePage('behaviour');
    assert.deepEqual([...new Set(page.blocks.map((b) => b.type))].filter((t) => t !== 'brief').sort(), [...TYPES].sort());
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.equal(v.stdout, [
      'ok',
      'inferred: $.blocks[1].transitions[4] — src/orders/states.js:18 does not contain to "cancelled"',
      'inferred: $.blocks[3].rows[4] — src/refunds/policy.js:9 does not contain literal "days > 30"',
      'inferred: $.blocks[4].steps[3] — src/billing/invoice.js:8 does not contain literal "0.2"',
      '',
    ].join('\n'));
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    const data = embedded(r.html);
    assert.equal(data.validation.anchors, 61);
    assert.equal(data.validation.inferred, 4);
    assert.equal(data.blocks[1].transitions[4].source, 'inferred');
    for (const type of TYPES) {
      assert.ok(r.html.includes(`verstat.register(${JSON.stringify(type)}, `), `${type} registered`);
      assert.ok(r.html.includes(`style[data-vs-type="${type}"]`), `${type} css`);
    }
    assert.match(r.html, /var dagre=/);
    assert.match(r.html, /@dagrejs\/dagre 3\.1\.3/);
    assert.match(r.html, /\.ReactFlow=\{\}/);
    assert.match(r.html, /vs\.flow = \{ layout: layout,/);
    const licences = r.html.match(/<script type="text\/plain" id="verstat-licenses">(.*?)<\/script>/s)[1];
    for (const lib of ['react 18.3.1', 'react-dom 18.3.1', 'reactflow 11.11.4']) assert.ok(licences.includes(lib), lib);
  });

  test('a page without a state machine carries no dagre and no React', () => {
    const page = fixturePage('behaviour');
    page.blocks = page.blocks.filter((b) => b.type === 'brief' || b.type === 'sequence');
    page.route = page.route.filter((s) => ['answer', 'pay-seq'].includes(s.block));
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.html, /dagre/i);
    assert.doesNotMatch(r.html, /React|react-flow|vs-flow/);
  });

  test('the behaviour diff page validates and builds; base anchors resolve at the base commit', () => {
    const page = fixturePage('behaviour-diff');
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.equal(v.stdout, 'ok\n');
    const r = build(page);
    assert.equal(r.code, 0, r.stderr);
    const data = embedded(r.html);
    const reopen = data.blocks[1].transitions.find((t) => t.id === 't-reopen');
    assert.equal(reopen.anchor.repo, 'checkout@base');
    assert.equal(reopen.anchor.line, 10);
    assert.equal(data.code['checkout@base:src/orders/states.js'].sha, checkout.base);
    assert.equal(data.code['checkout:src/orders/states.js'].sha, checkout.head);
    for (const type of DIFF_TYPES) {
      assert.ok(r.html.includes(`})(), {"group":"behavior","label":${JSON.stringify(meta(type).label)},"diffMode":true}`), `${type} meta`);
    }
  });

  test('a base anchor read at the head commit is rejected', () => {
    const page = fixturePage('behaviour-diff');
    page.repos['checkout@base'].sha = checkout.head;
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /reopen/);
  });

  test('state machine Mermaid is exact for the after and before values', () => {
    const { behavior } = loadRender('state-machine');
    const block = blockOf(fixturePage('behaviour-diff'), 'state-machine');
    const after = block.transitions.filter((t) => t.change !== 'removed');
    const before = block.transitions.filter((t) => t.change !== 'added').map((t) => ({ ...t, ...(t.before || {}) }));
    const head = [
      'stateDiagram-v2',
      '  state "Awaiting payment" as npending',
      '  state "Paid" as npaid',
      '  state "Shipped" as nshipped',
      '  state "Delivered" as ndelivered',
      '  state "Refunded" as nrefunded',
      '  state "Cancelled" as ncancelled',
      '  [*] --> npending',
    ];
    const tail = ['  nrefunded --> [*]', '  ncancelled --> [*]'];
    const textAfter = behavior.stateMachine.mermaid(block.states, after);
    assert.equal(textAfter, [
      ...head,
      '  npending --> npaid: pay',
      '  npending --> ncancelled: cancel',
      '  npaid --> nshipped: ship / address confirmed',
      '  nshipped --> ndelivered: deliver',
      '  nshipped --> nrefunded: refund',
      '  ndelivered --> nrefunded: refund / within 14 days',
      ...tail,
    ].join('\n'));
    const textBefore = behavior.stateMachine.mermaid(block.states, before);
    assert.equal(textBefore, [
      ...head,
      '  npending --> npaid: capture',
      '  npending --> ncancelled: cancel',
      '  npaid --> nshipped: ship',
      '  npaid --> npending: reopen',
      '  nshipped --> ndelivered: deliver',
      '  ndelivered --> nrefunded: refund / within 7 days',
      ...tail,
    ].join('\n'));
    const full = blockOf(fixturePage('behaviour'), 'state-machine');
    const text = behavior.stateMachine.mermaid(full.states, full.transitions);
    assert.ok(text.includes('  npaid --> ncancelled: cancel / not shipped yet'));
    assert.ok(text.includes('  npending --> npaid: pay / charge succeeded'));
    for (const line of [textAfter, textBefore, text].join('\n').split('\n')) assert.match(line, MERMAID_STATE);
  });

  test('sequence Mermaid is exact for the after and before values', () => {
    const { behavior } = loadRender('sequence');
    const block = blockOf(fixturePage('behaviour-diff'), 'sequence');
    const after = block.steps.filter((s) => s.change !== 'removed');
    const before = block.steps.filter((s) => s.change !== 'added').map((s) => ({ ...s, ...(s.before || {}) }));
    const head = [
      'sequenceDiagram',
      '  participant napi as API /orders',
      '  participant ngateway as Payment gateway',
      '  participant nstore as Store',
      '  participant nbus as Event bus',
    ];
    const textAfter = behavior.sequence.mermaid(block.participants, after);
    assert.equal(textAfter, [
      ...head,
      '  napi->>ngateway: charge(order)',
      '  ngateway-->>napi: #123; ok, chargeId #125;',
      '  napi->>nstore: orders.save(paid)',
      "  napi->>nbus: publish('order.paid')",
    ].join('\n'));
    const textBefore = behavior.sequence.mermaid(block.participants, before);
    assert.equal(textBefore, [
      ...head,
      '  napi->>ngateway: capture(order)',
      '  ngateway-->>napi: #123; ok, chargeId #125;',
      '  napi->>nstore: orders.save(paid)',
    ].join('\n'));
    const full = blockOf(fixturePage('behaviour'), 'sequence');
    const text = behavior.sequence.mermaid(full.participants, full.steps);
    assert.ok(text.includes('  napi-xnclient: 402 declined'));
    assert.ok(text.includes('  nclient->>napi: POST /orders/#58;id/pay'));
    for (const line of [textAfter, textBefore, text].join('\n').split('\n')) assert.match(line, MERMAID_SEQ);
  });

  test('in Diff the copied Mermaid and the reachability flags follow the after side', () => {
    const box = sandbox();
    box.structuredClone = structuredClone;
    runInNewContext(readFileSync(join(ROOT, 'vendor', 'dagre', 'dagre.min.js'), 'utf8'), box);
    const mounted = [];
    box.verstat.flow = { mount: (host, props) => { const m = { props, updates: [], update: (p) => m.updates.push(p), destroy() {} }; mounted.push(m); return m; } };
    const sm = loadRender('state-machine', box);
    const seq = loadRender('sequence', box);
    const node = () => ({
      setAttribute() {}, appendChild() {}, replaceChildren() {}, getBoundingClientRect: () => ({ width: 0 }),
      classList: { add() {}, remove() {}, toggle() {} },
    });
    const diffCtx = (block) => {
      const copied = [];
      const ctx = {
        ...i18n(),
        block, el: node, svg: node, part: (n) => n, isInferred: () => false, onFocus() {}, on() {}, onCleanup() {},
        anchorChip: node, sourceChip: node, mermaid: (fn) => copied.push(fn),
        diff: { mode: 'diff', shows: () => true, value: (p, f) => p[f], mark: (n) => n },
      };
      return { ctx, copied };
    };
    const page = fixturePage('behaviour-diff');
    const states = blockOf(page, 'state-machine');
    const a = diffCtx(states);
    sm.fn(states, a.ctx);
    const after = states.transitions.filter((t) => t.change !== 'removed');
    assert.equal(a.copied[0](), sm.behavior.stateMachine.mermaid(states.states, after));
    const sequence = blockOf(page, 'sequence');
    const b = diffCtx(sequence);
    seq.fn(sequence, b.ctx);
    assert.equal(b.copied[0](), seq.behavior.sequence.mermaid(sequence.participants, sequence.steps.filter((s) => s.change !== 'removed')));
    const cut = { ...states, transitions: states.transitions.map((t) => (t.id === 't-ship' ? { ...t, change: 'removed' } : t)) };
    const c = diffCtx(cut);
    sm.fn(cut, c.ctx);
    const flags = mounted[mounted.length - 1].props.spec.nodes.flatMap((n) => String(n.sub || '').split(' · ')).filter((f) => /unreachable|dead end/.test(f));
    assert.deepEqual(plain(flags).sort(), ['dead end', 'unreachable', 'unreachable', 'unreachable']);

    const table = blockOf(page, 'decision-table');
    const unanchored = { ...table, rows: table.rows.map((r) => (r.id === 'r-auto' ? { ...r, before: { ...r.before, anchor: undefined } } : r)) };
    const d = diffCtx(unanchored);
    d.ctx.diff = { mode: 'before', shows: (part) => part.change !== 'added', value: (part, f) => (part.change === 'changed' && part.before && part.before[f] !== undefined ? part.before[f] : part[f]), mark: (n) => n };
    const chips = [];
    const inferredRows = [];
    d.ctx.anchorChip = (anchor) => { chips.push(anchor.find); return node(); };
    d.ctx.el = (tag, attrs) => {
      if (attrs && /vs-dt-row/.test(attrs.class || '') && /vs-inferred/.test(attrs.class)) inferredRows.push(attrs.class);
      return node();
    };
    loadRender('decision-table', box).fn(unanchored, d.ctx);
    assert.ok(!chips.includes("if (days <= 14 && order.total < 5000) return 'auto';"), 'no head chip for an unanchored old literal');
    assert.equal(inferredRows.length, 1);
  });

  test('the state machine hands React Flow its states, transitions, diff tones and selection', () => {
    const box = sandbox();
    const mounted = [];
    box.verstat.flow = { mount: (host, props) => { const m = { props, updates: [], update: (p) => m.updates.push(p), destroy() { m.destroyed = true; } }; mounted.push(m); return m; } };
    const sm = loadRender('state-machine', box);
    const node = () => ({ setAttribute() {}, appendChild() {}, replaceChildren() {}, classList: { add() {}, remove() {} } });
    const cleanups = [];
    const focus = [];
    const bus = [];
    const chips = [];
    const block = blockOf(fixturePage('behaviour-diff'), 'state-machine');
    const ctx = {
      ...i18n(),
      block, el: node, svg: node, part: (n) => n, isInferred: (o) => !!(o && o.source === 'inferred'), on: (ev, fn) => bus.push([ev, fn]), mermaid() {},
      onFocus: (fn) => focus.push(fn), onCleanup: (fn) => cleanups.push(fn),
      anchorChip: (a) => { chips.push(a.find); return node(); }, sourceChip: node,
      diff: { mode: 'diff', shows: () => true, value: (p, f) => p[f], mark: (n) => n },
    };
    sm.fn(block, ctx);
    const { spec, height } = mounted[0].props;
    assert.equal(height, 380);
    assert.equal(spec.rankdir, 'LR');
    const edge = (id) => spec.edges.find((e) => e.part === id);
    assert.deepEqual(plain(spec.nodes.filter((n) => n.type === 'start').map((n) => n.id)), ['start:pending']);
    assert.equal(spec.edges.find((e) => e.s === 'start:pending').t, 'pending');
    assert.equal(edge('t-reopen').tone, 'del');
    assert.equal(edge('t-reopen').dash, true);
    assert.equal(edge('t-refund-shipped').tone, 'add');
    assert.equal(edge('t-pay').label, 'capture → pay');
    assert.equal(edge('t-refund').label, 'refund · within 7 days → within 14 days');
    assert.equal(edge('t-cancel').tone, null);
    assert.equal(edge('t-cancel').key, 't-cancel');
    assert.equal(edge('t-cancel').aria, 'Awaiting payment → Cancelled: cancel');
    assert.equal(spec.nodes.find((n) => n.id === 'refunded').final, true);
    assert.equal(mounted[0].updates[0].sel, 't-pay', 'the first transition is selected');
    focus.forEach((fn) => fn('t-refund-shipped'));
    assert.deepEqual(plain(mounted[0].updates.slice(-2)), [{ sel: 't-refund-shipped' }, { focus: 't-refund-shipped' }]);
    assert.ok(chips.includes("['shipped', 'refund', 'refunded'],"), 'the panel shows the selected transition anchor');
    mounted[0].props.onEdgeClick('t-cancel');
    assert.deepEqual(plain(mounted[0].updates.at(-1)), { sel: 't-cancel' });
    bus.filter(([ev]) => ev === 'focus').forEach(([, fn]) => fn({ block: 'rules', part: 'r-auto' }));
    assert.deepEqual(plain(mounted[0].updates.at(-1)), { focus: null }, 'focus elsewhere clears the diagram focus');
    cleanups.forEach((fn) => fn());
    assert.ok(mounted[0].destroyed, 'the React root is unmounted on cleanup');
  });

  test('state machine analysis finds the unreachable and the dead-end state', () => {
    const { behavior } = loadRender('state-machine');
    const block = blockOf(fixturePage('behaviour'), 'state-machine');
    assert.deepEqual(plain(behavior.stateMachine.analyse(block.states, block.transitions)), { unreachable: ['onHold'], deadEnd: ['disputed'] });
    const noInitial = block.states.map((s) => ({ ...s, initial: false }));
    assert.deepEqual(plain(behavior.stateMachine.analyse(noInitial, block.transitions).unreachable), []);
  });

  test('decision table conflicts find the contradictory pairs and skip empty cells and missing outcomes', () => {
    const { behavior } = loadRender('decision-table');
    const block = blockOf(fixturePage('behaviour'), 'decision-table');
    assert.deepEqual(plain(behavior.decisionTable.conflicts(block.conditions, block.rows)), [['r-vip', 'r-reject']]);
    const conds = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(plain(behavior.decisionTable.conflicts(conds, [
      { id: 'x', when: { a: '1' }, outcome: 'p' },
      { id: 'y', when: { a: '1', b: '*' }, outcome: 'q' },
      { id: 'z', when: { a: '*', b: '2' }, outcome: 'p' },
      { id: 'w', when: { a: '1', b: '2' } },
    ])), [['y', 'z']]);
  });

  test('the simulator evaluates its expression language and nothing else', () => {
    const { behavior } = loadRender('simulator');
    const sim = behavior.simulator;
    const ev = (expr, scope = {}) => sim.evaluate(sim.compile(expr), scope);
    assert.equal(ev('1 + 2 * 3'), 7);
    assert.equal(ev('(1 + 2) * 3'), 9);
    assert.equal(ev('10 - 4 - 3'), 3);
    assert.equal(ev('7 % 4 + -2'), 1);
    assert.equal(ev('round(2.345, 2) + floor(1.9) + ceil(0.1) + abs(-1) + min(4, 2, 8) + max(1, 3)'), 2.35 + 1 + 1 + 1 + 2 + 3);
    assert.equal(ev('x >= 10 ? "big" : x > 5 ? "mid" : "small"', { x: 7 }), 'mid');
    assert.equal(ev('a && !b || c == "z"', { a: true, b: true, c: 'z' }), true);
    assert.equal(ev("s != 'q' && n <= 3", { s: 'p', n: 3 }), true);
    assert.equal(ev("'a' + 1"), 'a1');
    const fixture = blockOf(fixturePage('behaviour'), 'simulator');
    const scope = { subtotal: 12000, status: 'delivered', deliveredDays: 3, vip: false };
    for (const o of fixture.outputs) scope[o.id] = sim.evaluate(sim.compile(o.expr), scope);
    assert.deepEqual([scope.discount, scope.shipping, scope.tax, scope.total, scope.refund], [600, 0, 2280, 13680, 'manual']);
    for (const bad of ['constructor', 'x.constructor', 'a.b', 'a[0]', 'alert(1)', 'x(1)', 'x = 1', 'this', 'globalThis', '`a`', '1 +', '(1']) {
      assert.throws(() => ev(bad, { x: 1, a: { b: 1 } }), (err) => typeof err.message === 'string' && err.message !== '', bad);
    }
    assert.throws(() => ev('x * 2', { x: 'a' }), (err) => err.key === 'simulator.err.number');
  });

  test('the timeline puts hold times on the axis and marks the held columns and segments', () => {
    const { behavior } = loadRender('timeline');
    const block = blockOf(fixturePage('behaviour'), 'timeline');
    const { times, held, segments } = plain(behavior.timeline.layout(block));
    assert.deepEqual(times, [0, 1, 6, 36, 900, 1800]);
    assert.deepEqual(held, [true, true, true, true, true, false]);
    assert.deepEqual(segments, [true, true, true, true, false]);
    const { times: own } = plain(behavior.timeline.layout({ events: [{ at: 5 }], holds: [{ from: 20, until: 10 }] }));
    assert.deepEqual(own, [5, 10, 20]);
  });

  test('a path-tracer step opens the lines of its failures, merged within one file', () => {
    const { behavior } = loadRender('path-tracer');
    const { target } = behavior.pathTracer;
    const file = { repo: 'checkout', path: 'src/payments/gateway.js' };
    const step = { anchor: { ...file, line: 7 } };
    assert.equal(target({}), null);
    assert.deepEqual(plain(target(step)), { ...file, line: 7 });
    const one = { ...file, line: 14 };
    assert.equal(target({ ...step, failures: [{ id: 'a' }, { id: 'b', anchor: one }] }), one);
    const merged = target({ ...step, failures: [
      { id: 'a', anchor: { ...file, line: 14 } },
      { id: 'b', anchor: { ...file, line: 11, endLine: 12 } },
      { id: 'c', anchor: { ...file, line: 13, spans: [[13, 13], [20, 21]] } },
      { id: 'd', anchor: { repo: 'checkout', path: 'src/api/orders.js', line: 3 } },
    ] });
    assert.deepEqual(plain(merged), { ...file, line: 11, endLine: 14, spans: [[11, 14], [20, 21]] });
  });

  test('every render.js loads through wrapRender and empty lists render nothing', () => {
    const page = fixturePage('behaviour');
    const emptyLists = {
      sequence: { steps: [] },
      'path-tracer': { steps: [] },
      'state-machine': { states: [] },
      'decision-table': { rows: [] },
      calculation: { steps: [] },
      simulator: { outputs: [] },
      timeline: { events: [] },
      'event-topology': { channels: [] },
    };
    const ctx = {
      ...i18n(),
      page,
      el: () => ({}),
      on: () => {},
      part: (n) => n,
      isInferred: () => false,
      diff: { mode: null, shows: () => true, value: (p, f) => p[f], mark: (n) => n },
    };
    for (const type of TYPES) {
      const registered = loadRender(type);
      assert.equal(registered.name, type);
      assert.equal(typeof registered.fn, 'function');
      assert.equal(registered.fn({ ...blockOf(page, type), ...emptyLists[type] }, ctx), null, `${type} empty`);
    }
    const empty = fixturePage('behaviour');
    for (const block of empty.blocks) Object.assign(block, emptyLists[block.type] || {});
    empty.route = empty.route.filter((s) => s.block === 'answer');
    const v = run(['validate', writePage(empty)]);
    assert.equal(v.code, 0, v.stderr);
  });

  test('a transition whose line lacks the target state is inferred, not rejected; a row without its literal too', () => {
    const page = fixturePage('behaviour');
    const states = blockOf(page, 'state-machine');
    states.transitions[1].to = 'shipped';
    const rules = blockOf(page, 'decision-table');
    delete rules.rows[1].literal;
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.match(v.stdout, /inferred: \$\.blocks\[1\]\.transitions\[1\] — src\/orders\/states\.js:6 does not contain to "shipped"/);
    assert.match(v.stdout, /inferred: \$\.blocks\[3\]\.rows\[1\] — src\/refunds\/policy\.js:6 does not contain literal \(no text\)/);
  });

  test('a base anchor is content-checked against the old values', () => {
    const page = fixturePage('behaviour-diff');
    blockOf(page, 'decision-table').rows.find((r) => r.id === 'r-auto').before.literal = 'days <= 30';
    delete blockOf(page, 'state-machine').transitions.find((t) => t.id === 't-pay').before.to;
    const v = run(['validate', writePage(page)]);
    assert.equal(v.code, 0, v.stderr);
    assert.match(v.stdout, /inferred: \$\.blocks\[2\]\.rows\[2\]\.before — src\/refunds\/policy\.js:6 does not contain literal "days <= 30"/);
    assert.match(v.stdout, /inferred: \$\.blocks\[1\]\.transitions\[0\]\.before — src\/orders\/states\.js:6 does not contain to \(no text\)/);
  });

  test('a simulator input id that is not a name is rejected', () => {
    const page = fixturePage('behaviour');
    blockOf(page, 'simulator').inputs[0].id = 'sub.total';
    const r = run(['validate', writePage(page)]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /inputs\[0\]\.id/);
  });
});
