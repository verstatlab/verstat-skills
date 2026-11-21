import { bus } from '../events/bus.js';
import { move } from '../orders/states.js';
import * as payments from '../payments/gateway.js';
import { orders } from './store.js';

export async function payOrder(req, res) {
  const order = await orders.find(req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'pending') return res.status(409).json({ error: 'wrong_state' });
  const result = await payments.charge(order);
  if (!result.ok) return res.status(402).json({ error: 'declined' });
  const paid = move(order, 'pay');
  await orders.save(paid);
  bus.publish('order.paid', { id: paid.id, chargeId: result.chargeId });
  return res.status(200).json(paid);
}
