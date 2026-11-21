const test = require('node:test');
const assert = require('node:assert');
const { charge } = require('../src/payments');

test('a paid invoice is not charged again', async () => {
  await assert.rejects(charge({}, {}, {}, { status: 'paid' }, 'k1'), /already paid/);
});

test('the same idempotency key returns the first payment', async () => {
  const first = { id: 1 };
  const db = { findOne: async () => first };
  assert.equal(await charge(db, {}, {}, { status: 'open' }, 'k1'), first);
});
