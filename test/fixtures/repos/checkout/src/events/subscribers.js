import { bus } from './bus.js';

export function wire({ receipts, warehouse, analytics, refunds }) {
  bus.subscribe('order.paid', receipts.send);
  bus.subscribe('order.paid', warehouse.reserve);
  bus.subscribe('order.paid', analytics.track);
  bus.subscribe('order.shipped', receipts.sendTracking);
  bus.subscribe('refund.requested', refunds.review);
}
