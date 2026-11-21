const STATUS = {
  pending: 'pending',
  paid: 'paid',
  shipped: 'shipped',
  refunded: 'refunded',
};

function createOrder(items) {
  return { status: STATUS.pending, items, total: total(items) };
}

function total(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function markPaid(order, payment) {
  if (order.status !== STATUS.pending) throw new Error('order is not pending');
  if (payment.amount !== order.total) throw new Error('amount mismatch');
  return { ...order, status: STATUS.paid, paymentId: payment.id };
}

function ship(order) {
  if (order.status !== STATUS.paid) throw new Error('order is not paid');
  return { ...order, status: STATUS.shipped };
}

module.exports = { STATUS, createOrder, total, markPaid, ship };
