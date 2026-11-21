const DAY = 24 * 60 * 60 * 1000;

export function refundDecision(order, now) {
  const days = Math.floor((now - order.deliveredAt) / DAY);
  if (order.status === 'shipped') return 'carrier-recall';
  if (days <= 14 && order.total < 5000) return 'auto';
  if (days <= 14 && order.total >= 5000) return 'manual';
  if (days > 14 && order.vip) return 'manual';
  if (days > 14) return 'reject';
  return undefined;
}
