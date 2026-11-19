const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const httpFetch = global.fetch;

const ordersRouter = require('../routes/orders');

function createPrisma({ status = 'ASSEMBLED', sentPhoto = true, rating = null } = {}) {
  const state = {
    order: {
      id: 41,
      userId: 7,
      status,
      preDeliveryRating: rating,
      preDeliveryRatedAt: null,
    },
  };
  const client = {
    order: {
      findFirst: async ({ where }) => (
        state.order.id === where.id && state.order.userId === where.userId ? { ...state.order } : null
      ),
      updateMany: async ({ where, data }) => {
        if (
          state.order.id !== where.id ||
          state.order.userId !== where.userId ||
          state.order.status !== where.status ||
          state.order.preDeliveryRating !== where.preDeliveryRating
        ) return { count: 0 };
        Object.assign(state.order, data);
        return { count: 1 };
      },
    },
    orderPhoto: {
      findFirst: async () => (sentPhoto ? { id: 9 } : null),
    },
  };
  return { client, state };
}

async function withServer(prisma, run) {
  ordersRouter._test.setPrisma(prisma);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 7 };
    next();
  });
  app.use('/api/orders', ordersRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rate(base, rating = 'UP') {
  const response = await httpFetch(`${base}/api/orders/41/photo-rating`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
  return { status: response.status, body: await response.json() };
}

test('client can rate a sent assembled photo only once', async () => {
  const { client, state } = createPrisma();
  await withServer(client, async (base) => {
    const first = await rate(base, 'DOWN');
    assert.equal(first.status, 200);
    assert.equal(first.body.order.preDeliveryRating, 'DOWN');
    assert.ok(first.body.order.preDeliveryRatedAt);

    const second = await rate(base, 'UP');
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'PHOTO_ALREADY_RATED');
  });
  assert.equal(state.order.preDeliveryRating, 'DOWN');
});

test('rating is rejected before assembly or before a photo is sent', async () => {
  for (const [options, error] of [
    [{ status: 'ACCEPTED' }, 'ORDER_NOT_ASSEMBLED'],
    [{ sentPhoto: false }, 'PHOTO_NOT_SENT'],
  ]) {
    const { client } = createPrisma(options);
    await withServer(client, async (base) => {
      const result = await rate(base);
      assert.equal(result.status, 409);
      assert.equal(result.body.error, error);
    });
  }
});
