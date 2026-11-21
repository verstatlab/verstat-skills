export const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000;
export const RETRY_DELAYS_MS = [1000, 5000, 30000];
export const RESERVATION_TTL_MS = 30 * 60 * 1000;

export function onOrderCreated(order, timers) {
  timers.after(PAYMENT_TIMEOUT_MS, () => timers.cancelIfUnpaid(order.id));
  timers.after(RESERVATION_TTL_MS, () => timers.releaseStock(order.id));
}

export async function chargeWithRetry(charge, order, sleep) {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await charge(order);
    } catch (err) {
      await sleep(delay);
    }
  }
  return charge(order);
}
