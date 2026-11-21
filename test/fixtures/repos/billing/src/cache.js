const { config } = require('./config');

function invoiceKey(id) {
  return `invoice:${id}`;
}

function getInvoice(cache, id) {
  return cache.get(invoiceKey(id));
}

function putInvoice(cache, invoice) {
  return cache.set(invoiceKey(invoice.id), invoice, { ttl: config.invoiceCacheTtl });
}

function dropInvoice(cache, id) {
  return cache.del(invoiceKey(id));
}

module.exports = { invoiceKey, getInvoice, putInvoice, dropInvoice };
