import assert from 'node:assert/strict';
import { test } from 'node:test';
import { move } from '../../src/orders/states.js';

test('a shipped order can be refunded', () => {
  const order = { id: 'o1', status: 'shipped', total: 900 };
  assert.equal(move(order, 'refund').status, 'refunded');
});

test('pay moves a pending order to paid', () => {
  assert.equal(move({ id: 'o2', status: 'pending', total: 900 }, 'pay').status, 'paid');
});
