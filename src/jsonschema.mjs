const ANNOTATION_KEYWORDS = ['x-anchor', 'x-anchor-contains'];

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function validateSchema(schema, instance, options = {}) {
  const ctx = {
    documents: options.documents || {},
    errors: [],
    annotations: [],
  };
  const base = options.basePath || [];
  walk(schema, instance, base, schema, ctx);
  return { errors: ctx.errors, annotations: ctx.annotations };
}

export function formatPath(segments) {
  let out = '$';
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`;
    else if (/^[A-Za-z_$][\w$-]*$/.test(s)) out += `.${s}`;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

export function resolveSchemaRef(ref, root, documents) {
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
