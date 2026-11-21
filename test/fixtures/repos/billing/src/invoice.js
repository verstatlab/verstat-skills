const { config } = require('./config');
const { putInvoice, getInvoice } = require('./cache');

function lineTotal(line) {
  return line.qty * line.unitCents;
}

function totalCents(lines) {
  const raw = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  return Math.round(raw);
}

async function createInvoice(db, cache, customerId, lines) {
  const total = totalCents(lines);
  if (total < 0) throw new Error('negative total');
  const invoice = await db.insert('invoices', { customer_id: customerId, total_cents: total, currency: config.currency, status: 'open' });
  await putInvoice(cache, invoice);
  return invoice;
}

async function loadInvoice(db, cache, id) {
  const cached = await getInvoice(cache, id);
  if (cached) return cached;
  const invoice = await db.findOne('invoices', { id });
  if (invoice) await putInvoice(cache, invoice);
  return invoice;
}

module.exports = { totalCents, createInvoice, loadInvoice };
