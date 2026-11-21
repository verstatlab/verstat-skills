const { markPaid } = require('../orders/order');

const RETRIES = 3;

async function capture(gateway, order) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const payment = await gateway.charge(order.total);
      return markPaid(order, payment);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function refund(gateway, order) {
  if (order.status !== 'paid' && order.status !== 'shipped') throw new Error('nothing to refund');
  return gateway.refund(order.paymentId).then(() => ({ ...order, status: 'refunded' }));
}

module.exports = { capture, refund, RETRIES };
