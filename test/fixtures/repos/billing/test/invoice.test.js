const test = require('node:test');
const assert = require('node:assert');
const { totalCents } = require('../src/invoice');

test('total sums the lines', () => {
  assert.equal(totalCents([{ qty: 2, unitCents: 150 }, { qty: 1, unitCents: 99 }]), 399);
});

test('total of no lines is zero', () => {
  assert.equal(totalCents([]), 0);
});
