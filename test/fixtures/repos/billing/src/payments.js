const { config } = require('./config');
const { dropInvoice } = require('./cache');

class PaymentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function charge(db, cache, gateway, invoice, idempotencyKey) {
  if (invoice.status === 'paid') throw new PaymentError(409, 'invoice already paid');
  const existing = await db.findOne('payments', { idempotency_key: idempotencyKey });
  if (existing) return existing;

  let lastError = null;
  for (let attempt = 1; attempt <= config.chargeRetries; attempt++) {
    try {
      const result = await gateway.charge(invoice.total_cents, { timeoutMs: config.gatewayTimeoutMs });
      const payment = await db.insert('payments', {
        invoice_id: invoice.id,
        amount_cents: invoice.total_cents,
        idempotency_key: idempotencyKey,
        status: result.status,
      });
      await db.update('invoices', { id: invoice.id }, { status: 'paid' });
      await dropInvoice(cache, invoice.id);
      return payment;
    } catch (err) {
      lastError = err;
    }
  }
  throw new PaymentError(502, `gateway failed: ${lastError && lastError.message}`);
}

async function voidInvoice(db, cache, invoice) {
  if (invoice.status === 'paid') throw new PaymentError(409, 'paid invoices cannot be voided');
  await db.remove('invoices', { id: invoice.id });
  await dropInvoice(cache, invoice.id);
}

module.exports = { PaymentError, charge, voidInvoice };
