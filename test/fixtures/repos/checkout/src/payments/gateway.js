import { http } from './http.js';

export class ServiceUnavailable extends Error {
  status = 503;
}

export async function charge(order) {
  let response;
  try {
    response = await http.post('/charges', { amount: order.total, ref: order.id });
  } catch (err) {
    throw new ServiceUnavailable('payment gateway is down');
  }
  if (response.status === 402) return { ok: false, reason: 'declined' };
  return { ok: true, chargeId: response.body.id };
}
