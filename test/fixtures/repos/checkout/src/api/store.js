const rows = new Map();

export const orders = {
  async find(id) {
    return rows.get(id) || null;
  },
  async save(order) {
    rows.set(order.id, order);
    return order;
  },
};
