export const http = {
  async post(path, body) {
    return { status: 201, body: { id: `ch_${body.ref}` }, path };
  },
};
