export const TAX_RATE = 0.2;
export const FREE_SHIPPING_FROM = 3000;

export function invoice(order) {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = subtotal >= 10000 ? Math.round(subtotal * 0.05) : 0;
  const shipping = subtotal - discount >= FREE_SHIPPING_FROM ? 0 : 250;
  const tax = Math.round((subtotal - discount) * TAX_RATE);
  const total = subtotal - discount + shipping + tax;
  return { subtotal, discount, shipping, tax, total };
}
