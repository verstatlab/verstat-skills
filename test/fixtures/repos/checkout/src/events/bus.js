const handlers = new Map();

export const bus = {
  publish(topic, payload) {
    for (const fn of handlers.get(topic) || []) fn(payload);
  },
  subscribe(topic, fn) {
    handlers.set(topic, [...(handlers.get(topic) || []), fn]);
  },
};
