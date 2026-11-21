import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refundDecision } from '../../src/refunds/policy.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 31);

test('a shipped order is recalled from the carrier', () => {
  const order = { status: 'shipped', total: 1200, deliveredAt: now };
  assert.equal(refundDecision(order, now), 'carrier-recall');
});

test('the automatic refund window is 14 days', () => {
  const order = { status: 'delivered', total: 1200, deliveredAt: now - 14 * DAY };
  assert.equal(refundDecision(order, now), 'auto');
  assert.equal(refundDecision({ ...order, deliveredAt: now - 15 * DAY }, now), 'reject');
});
