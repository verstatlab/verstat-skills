import { bus } from '../events/bus.js';

export function markShipped(order, tracking) {
  bus.publish('order.shipped', { id: order.id, tracking });
  return { ...order, shippedAt: Date.now(), tracking };
}

export function requestRefund(order) {
  bus.publish('refund.requested', { id: order.id });
}
