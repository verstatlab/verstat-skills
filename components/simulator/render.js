const CSS = `
.vs-sim { border: var(--vs-rw) solid var(--vs-rule-strong); border-radius: var(--vs-r); background: var(--vs-raised); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.vs-sim-note { font-size: 13px; color: var(--vs-muted); margin: 0; }
.vs-sim-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 10px 12px; }
.vs-sim-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--vs-muted); min-width: 0; }
.vs-sim-unit { font-family: var(--vs-mono); font-size: 11px; margin-left: 6px; }
.vs-sim-select { position: relative; display: flex; }
.vs-sim-select svg { position: absolute; right: 10px; top: 11px; pointer-events: none; fill: none; stroke: var(--vs-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.vs-sim-field select, .vs-sim-field input[type="number"] { appearance: none; -webkit-appearance: none; width: 100%; box-sizing: border-box; height: 36px; margin: 0; font: inherit; font-family: var(--vs-mono); font-size: 14px; color: var(--vs-ink); background: var(--vs-bg); border: 1px solid var(--vs-rule-strong); border-radius: var(--vs-r); padding: 0 10px; outline: none; }
.vs-sim-field input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
.vs-sim-field select { padding-right: 32px; cursor: pointer; text-overflow: ellipsis; }
.vs-sim-field select:hover, .vs-sim-field input[type="number"]:hover { border-color: var(--vs-muted); }
.vs-sim-field select:focus-visible, .vs-sim-field input[type="number"]:focus-visible { border-color: var(--vs-accent); box-shadow: 0 0 0 2px var(--vs-accent-soft); }
.vs-sim-field input[type="number"]::-webkit-inner-spin-button, .vs-sim-field input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.vs-sim-check { display: flex; align-items: center; gap: 8px; height: 36px; color: var(--vs-ink); font-size: 14px; cursor: pointer; }
.vs-sim-check input { width: 18px; height: 18px; margin: 0; accent-color: var(--vs-accent); }
.vs-sim-out { display: grid; grid-template-columns: minmax(100px, 120px) minmax(0, 1fr); gap: 8px 12px; align-items: baseline; border-top: var(--vs-rw) solid var(--vs-rule-strong); padding-top: 12px; }
.vs-sim-label { font-size: 12px; color: var(--vs-muted); }
.vs-sim-value { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; min-width: 0; }
.vs-sim-value b { font-family: var(--vs-mono); font-size: 14px; font-weight: 600; }
.vs-sim-value code { font-family: var(--vs-mono); font-size: 11.5px; color: var(--vs-muted); overflow-wrap: anywhere; }
.vs-sim-value.vs-focus, .vs-sim-field.vs-focus { outline-offset: 2px; }
.vs-sim-error { background: var(--vs-accent-soft); color: var(--vs-ink); border-radius: var(--vs-r); padding: 10px 12px; font-family: var(--vs-mono); font-size: 12px; line-height: 1.5; }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-vs-type="simulator"]')) {
  const style = document.createElement('style');
  style.setAttribute('data-vs-type', 'simulator');
  style.textContent = CSS;
  document.head.appendChild(style);
}

const FUNCS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: (x, d) => {
    const f = 10 ** (d || 0);
    return Math.round(x * f) / f;
  },
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
};

function fail(key, vars) {
  const err = new Error(`simulator.err.${key}`);
  err.key = `simulator.err.${key}`;
  err.vars = vars || null;
  throw err;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if ((m = rest.match(/^\s+/))) {
      i += m[0].length;
    } else if ((m = rest.match(/^\d+(\.\d+)?/))) {
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (rest[0] === "'" || rest[0] === '"') {
      const end = src.indexOf(rest[0], i + 1);
      if (end < 0) fail('unclosed');
      tokens.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
    } else if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ((m = rest.match(/^(===|!==|==|!=|<=|>=|&&|\|\||[-+*/%<>!?:(),])/))) {
      tokens.push({ t: 'op', v: { '===': '==', '!==': '!=' }[m[0]] || m[0] });
      i += m[0].length;
    } else {
      fail('char', { what: rest[0] });
    }
  }
  return tokens;
}

function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) fail('expected', { what: v });
    pos++;
  };
  const binary = (next, ops) => () => {
    let a = next();
    while (peek() && peek().t === 'op' && ops.includes(peek().v)) {
      const op = tokens[pos++].v;
      a = { k: 'bin', op, a, b: next() };
    }
    return a;
  };
  function primary() {
    const tok = tokens[pos++];
    if (!tok) fail('end');
    if (tok.t === 'num' || tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true' || tok.v === 'false') return { k: 'lit', v: tok.v === 'true' };
      if (isOp('(')) {
        if (!Object.prototype.hasOwnProperty.call(FUNCS, tok.v)) fail('function', { what: tok.v });
        pos++;
        const args = [];
        if (!isOp(')')) {
          args.push(ternary());
          while (isOp(',')) {
            pos++;
            args.push(ternary());
          }
        }
        expect(')');
        return { k: 'call', fn: tok.v, args };
      }
      return { k: 'var', name: tok.v };
    }
    if (tok.v === '(') {
      const inner = ternary();
      expect(')');
      return inner;
    }
    fail('unexpected', { what: tok.v });
  }
  function unary() {
    if (isOp('!') || isOp('-')) {
      const op = tokens[pos++].v;
      return { k: 'un', op, a: unary() };
    }
    return primary();
  }
  const mul = binary(unary, ['*', '/', '%']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['<', '<=', '>', '>=']);
  const eq = binary(cmp, ['==', '!=']);
  const and = binary(eq, ['&&']);
  const or = binary(and, ['||']);
  function ternary() {
    const c = or();
    if (!isOp('?')) return c;
    pos++;
    const a = ternary();
    expect(':');
    return { k: 'cond', c, a, b: ternary() };
  }
  const ast = ternary();
  if (pos < tokens.length) fail('extra', { what: tokens[pos].v });
  return ast;
}

function names(node, out = new Set()) {
  if (node.k === 'var') out.add(node.name);
  for (const child of [node.a, node.b, node.c, ...(node.args || [])]) if (child) names(child, out);
  return out;
}

function num(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) fail('number');
  return v;
}

function evaluate(node, scope) {
  switch (node.k) {
    case 'lit':
      return node.v;
    case 'var':
      if (!Object.prototype.hasOwnProperty.call(scope, node.name)) fail('name', { what: node.name });
      return scope[node.name];
    case 'call':
      return FUNCS[node.fn](...node.args.map((a) => num(evaluate(a, scope))));
    case 'un':
      return node.op === '!' ? !evaluate(node.a, scope) : -num(evaluate(node.a, scope));
    case 'cond':
      return evaluate(node.c, scope) ? evaluate(node.a, scope) : evaluate(node.b, scope);
    default: {
      if (node.op === '&&') return evaluate(node.a, scope) && evaluate(node.b, scope);
      if (node.op === '||') return evaluate(node.a, scope) || evaluate(node.b, scope);
      const a = evaluate(node.a, scope);
      const b = evaluate(node.b, scope);
      switch (node.op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '+': return typeof a === 'string' || typeof b === 'string' ? `${a}${b}` : num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': return num(a) / num(b);
        case '%': return num(a) % num(b);
        case '<': return num(a) < num(b);
        case '<=': return num(a) <= num(b);
        case '>': return num(a) > num(b);
        default: return num(a) >= num(b);
      }
    }
  }
}

verstat.behavior = verstat.behavior || {};
verstat.behavior.simulator = {
  compile: parse,
  evaluate(compiled, values) {
    const scope = Object.create(null);
    for (const k of Object.keys(values)) scope[k] = values[k];
    return evaluate(compiled, scope);
  },
};

function show(value, decimals, ctx) {
  if (typeof value === 'boolean') return ctx.t(value ? 'simulator.yes' : 'simulator.no');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (decimals !== undefined) return value.toFixed(decimals);
    return String(Math.round(value * 100) / 100);
  }
  return String(value);
}

export default function (block, ctx) {
  const { el } = ctx;
  if (!block.outputs.length) return null;
  const sim = verstat.behavior.simulator;
  const message = (err) => (err.key ? ctx.t(err.key, err.vars, err.message) : err.message);
  const values = Object.create(null);
  const compiled = block.outputs.map((o) => {
    try {
      return { ast: sim.compile(o.expr) };
    } catch (err) {
      return { error: ctx.t('simulator.errorIn', { label: o.label, error: message(err), expr: o.expr }) };
    }
  });
  const valueNodes = [];
  const errorBox = el('div', { class: 'vs-sim-error', hidden: true, role: 'status' });

  function recompute() {
    const scope = Object.assign(Object.create(null), values);
    const errors = [];
    const failed = new Map();
    block.outputs.forEach((o, i) => {
      const c = compiled[i];
      let text = '—';
      const blocked = c.ast ? [...names(c.ast)].find((n) => failed.has(n)) : undefined;
      if (c.error) {
        errors.push(c.error);
        failed.set(o.id, o.label);
      } else if (blocked) {
        failed.set(o.id, o.label);
      } else {
        try {
          const v = sim.evaluate(c.ast, scope);
          scope[o.id] = v;
          text = show(v, o.decimals, ctx) + (o.unit ? ` ${o.unit}` : '');
        } catch (err) {
          errors.push(`${o.label}: ${message(err)}`);
          failed.set(o.id, o.label);
        }
      }
      valueNodes[i].textContent = text;
    });
    errorBox.hidden = !errors.length;
    errorBox.textContent = errors.length ? ctx.t('simulator.failed', { errors: errors.join('; ') }) : '';
  }

  const fields = block.inputs.map((input) => {
    const options = input.options || [];
    if (input.kind === 'select') values[input.id] = options.includes(input.default) ? input.default : options[0];
    else if (input.kind === 'boolean') values[input.id] = input.default === true || input.default === 'true';
    else values[input.id] = Number(input.default);
    let control;
    if (input.kind === 'select') {
      control = el('span', { class: 'vs-sim-select' }, [
        el('select', {
          onchange: (ev) => {
            values[input.id] = options[ev.target.selectedIndex];
            recompute();
          },
        }, options.map((opt) => el('option', { selected: opt === values[input.id] }, String(opt)))),
        ctx.svg('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true' }, [ctx.svg('path', { d: 'm6 9 6 6 6-6' })]),
      ]);
    } else if (input.kind === 'boolean') {
      control = el('span', { class: 'vs-sim-check' }, [
        el('input', {
          type: 'checkbox',
          checked: values[input.id],
          onchange: (ev) => {
            values[input.id] = ev.target.checked;
            recompute();
          },
        }),
        el('span', {}, ctx.t('simulator.yes')),
      ]);
    } else {
      control = el('input', {
        type: 'number',
        value: Number.isNaN(values[input.id]) ? null : values[input.id],
        min: input.min,
        max: input.max,
        step: input.step === undefined ? 'any' : input.step,
        inputmode: 'decimal',
        oninput: (ev) => {
          const raw = ev.target.value;
          values[input.id] = raw === '' ? NaN : Number(raw);
          recompute();
        },
      });
    }
    return ctx.part(el('label', { class: 'vs-sim-field' }, [
      el('span', {}, [input.label, input.unit ? el('span', { class: 'vs-sim-unit' }, input.unit) : null]),
      control,
    ]), input.id);
  });

  const outputs = [];
  block.outputs.forEach((o) => {
    const value = el('b', {}, '—');
    valueNodes.push(value);
    const chips = [];
    if (o.anchor) chips.push(ctx.anchorChip(o.anchor));
    if (o.source) chips.push(ctx.sourceChip(o.source));
    outputs.push(
      el('div', { class: 'vs-sim-label' }, o.label),
      ctx.part(el('div', { class: `vs-sim-value${ctx.isInferred(o) ? ' vs-inferred' : ''}`, 'data-no-terms': true }, [
        value,
        el('code', {}, o.expr),
        ...chips,
      ]), o.id),
    );
  });

  recompute();
  return el('div', { class: 'vs-sim' }, [
    block.note ? el('p', { class: 'vs-sim-note' }, block.note) : null,
    el('div', { class: 'vs-sim-fields' }, fields),
    el('div', { class: 'vs-sim-out', 'aria-live': 'polite' }, outputs),
    errorBox,
  ]);
}
