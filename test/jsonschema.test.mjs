import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateSchema } from '../src/jsonschema.mjs';

describe('jsonschema', () => {
  test('type, required, additionalProperties', () => {
    const schema = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: 'integer' } } };
    assert.deepEqual(validateSchema(schema, { a: 1 }).errors, []);
    const r = validateSchema(schema, { a: 1.5, b: 2 });
    assert.deepEqual(r.errors.map((e) => [e.path, e.message]), [
      ['$.a', 'expected integer, got number'],
      ['$.b', 'unknown field "b"'],
    ]);
    assert.deepEqual(validateSchema(schema, {}).errors.map((e) => e.message), ['missing required field "a"']);
  });

  test('$ref to local and shared documents', () => {
    const shared = { $defs: { name: { type: 'string', minLength: 2 } } };
    const schema = {
      properties: { a: { $ref: '#/$defs/n' }, b: { $ref: 'shared#/$defs/name' } },
      $defs: { n: { enum: ['x', 'y'] } },
    };
    const r = validateSchema(schema, { a: 'z', b: 'q' }, { documents: { shared } });
    assert.deepEqual(r.errors.map((e) => e.path), ['$.a', '$.b']);
    const broken = validateSchema({ $ref: '#/$defs/missing' }, 1);
    assert.match(broken.errors[0].message, /does not resolve/);
  });

  test('x-anchor annotations come only from the oneOf branch that passes', () => {
    const schema = {
      oneOf: [
        { type: 'object', required: ['kind'], properties: { kind: { const: 'a' }, at: { 'x-anchor': true } } },
        { type: 'object', required: ['kind'], properties: { kind: { const: 'b' }, at: { 'x-anchor-contains': 'kind' } } },
      ],
    };
    const r = validateSchema(schema, { kind: 'b', at: {} });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.annotations.map((a) => [a.path, a.keyword, a.value]), [['$.at', 'x-anchor-contains', 'kind']]);
    const none = validateSchema(schema, { kind: 'c' });
    assert.match(none.errors[0].message, /does not match any allowed shape/);
  });

  test('items, minItems, pattern, minimum', () => {
    const schema = { type: 'array', minItems: 1, items: { type: 'string', pattern: '^[a-z]+$' } };
    assert.deepEqual(validateSchema(schema, ['ok', 'NO']).errors.map((e) => e.path), ['$[1]']);
    assert.equal(validateSchema(schema, []).errors.length, 1);
    assert.equal(validateSchema({ minimum: 1 }, 0).errors[0].message, 'must be >= 1');
  });

  test('inherited Object.prototype keys are not fields', () => {
    const closed = { type: 'object', additionalProperties: false, properties: {} };
    assert.deepEqual(validateSchema(closed, JSON.parse('{"constructor":5,"toString":1}')).errors.map((e) => e.path), ['$.constructor', '$.toString']);
    assert.equal(validateSchema({ type: 'object', required: ['toString'] }, {}).errors.length, 1);
  });
});
