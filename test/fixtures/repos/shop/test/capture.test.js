const assert = require('node:assert');
const { capture } = require('../src/payments/capture');
const { createOrder } = require('../src/orders/order');

async function capturesAfterOneFailure() {
  let calls = 0;
  const gateway = { charge: async (amount) => { calls++; if (calls === 1) throw new Error('timeout'); return { id: 'p1', amount }; } };
  const order = await capture(gateway, createOrder([{ price: 5, qty: 2 }]));
  assert.equal(order.status, 'paid');
}

capturesAfterOneFailure();
