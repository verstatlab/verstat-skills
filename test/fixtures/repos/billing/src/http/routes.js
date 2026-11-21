const { createInvoice, loadInvoice } = require('../invoice');
const { charge, voidInvoice, PaymentError } = require('../payments');

function routes(app, { db, cache, gateway }) {
  app.post('/invoices', async (req, res) => {
    const invoice = await createInvoice(db, cache, req.body.customerId, req.body.lines);
    res.status(201).json(invoice);
  });

  app.get('/invoices/:id', async (req, res) => {
    const invoice = await loadInvoice(db, cache, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'not found' });
    res.json(invoice);
  });

  app.post('/invoices/:id/pay', async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });
    const invoice = await loadInvoice(db, cache, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'not found' });
    try {
      const payment = await charge(db, cache, gateway, invoice, key);
      res.status(200).json(payment);
    } catch (err) {
      if (err instanceof PaymentError) return res.status(err.code).json({ error: err.message });
      throw err;
    }
  });

  app.delete('/invoices/:id', async (req, res) => {
    const invoice = await loadInvoice(db, cache, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'not found' });
    await voidInvoice(db, cache, invoice);
    res.status(204).end();
  });
}

module.exports = { routes };
