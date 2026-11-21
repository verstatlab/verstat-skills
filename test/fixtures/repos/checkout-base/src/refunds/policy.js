const DAY = 24 * 60 * 60 * 1000;

export function refundDecision(order, now) {
  const days = Math.floor((now - order.deliveredAt) / DAY);
  if (order.coupon) return 'manual';
  if (days <= 7 && order.total < 5000) return 'auto';
  if (days <= 7 && order.total >= 5000) return 'manual';
  if (days > 7 && order.vip) return 'manual';
  if (days > 7) return 'reject';
  return undefined;
}
