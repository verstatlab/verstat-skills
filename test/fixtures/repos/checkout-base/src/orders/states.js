export const FINAL = ['refunded', 'cancelled'];

// [from, trigger, to]
export const TRANSITIONS = [
  ['draft', 'submit', 'pending'],
  ['pending', 'capture', 'paid'],
  ['pending', 'cancel', 'cancelled'],
  ['paid', 'ship', 'shipped'],
  ['paid', 'cancel', 'cancelled'],
  ['paid', 'reopen', 'pending'],
  ['shipped', 'deliver', 'delivered'],
  ['delivered', 'refund', 'refunded'],
  ['delivered', 'dispute', 'disputed'],
  ['onHold', 'release', 'pending'],
];

export function move(order, trigger) {
  if (trigger === 'cancel' && order.shippedAt) throw new Error('already shipped');
  if (trigger === 'refund' && !refundAllowed(order)) throw new Error('refund window closed');
  const t = TRANSITIONS.find(([from, on]) => from === order.status && on === trigger);
  if (!t) throw new Error(`no transition ${order.status} --${trigger}-->`);
  return { ...order, status: t[2] };
}

function refundAllowed(order) {
  return order.total > 0;
}
