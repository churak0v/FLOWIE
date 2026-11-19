const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DeliveryPaymentError,
  issueDeliveryQuote,
  normalizeQuoteRequest,
} = require('../services/deliveryPayment');

const QUOTE_KEY = '4f85a2ac-4192-4f81-b2f4-73a689cb61f7';
const automaticPrice = (price = 700) => async () => ({ price, provider: 'test' });

function createPrisma(orderOverrides = {}, staffOverrides = {}) {
  const state = {
    order: {
      id: 41,
      userId: 7,
      status: 'PAID',
      paymentStatus: 'CONFIRMED',
      askRecipientAddress: true,
      askRecipientTime: true,
      deliveryAddress: null,
      deliveryTime: null,
      deliveryCost: null,
      deliveryStatus: 'DETAILS_PENDING',
      deliveryQuoteKey: null,
      deliveryQuoteDigest: null,
      deliveryInvoice: null,
      ...orderOverrides,
    },
    staff: { id: 9, staffRole: 'moderator', staffActive: true, ...staffOverrides },
    invoices: [],
    locks: [],
  };

  const tx = {
    $queryRawUnsafe: async (query, value) => {
      state.locks.push({ query, value });
      return [];
    },
    user: {
      findUnique: async ({ where }) => (where.id === state.staff.id ? state.staff : null),
    },
    order: {
      findUnique: async ({ where }) => (where.id === state.order.id
        ? { ...state.order, deliveryInvoice: state.invoices[0] || null }
        : null),
      update: async ({ where, data }) => {
        assert.equal(where.id, state.order.id);
        Object.assign(state.order, data);
        return { ...state.order, deliveryInvoice: state.invoices[0] || null };
      },
    },
    deliveryInvoice: {
      create: async ({ data }) => {
        const invoice = { id: 1, ...data, paymentChargeId: null, paymentMeta: null, paidAt: null };
        state.invoices.push(invoice);
        state.order.deliveryInvoice = invoice;
        return invoice;
      },
    },
  };
  let queue = Promise.resolve();
  return {
    state,
    prisma: {
      $transaction(fn) {
        const result = queue.then(() => fn(tx));
        queue = result.catch(() => undefined);
        return result;
      },
    },
  };
}

function quote(overrides = {}) {
  return {
    quoteKey: QUOTE_KEY,
    deliveryAddress: 'Ижевск, Пушкинская улица, 10',
    deliveryTime: '19 ноября, 18:00–20:00',
    amount: 700,
    ...overrides,
  };
}

test('unknown address quote creates one separate invoice and is idempotent', async () => {
  const { prisma, state } = createPrisma();
  const args = {
    prisma,
    orderId: 41,
    staffUserId: 9,
    body: quote(),
    now: () => new Date('2026-11-18T12:00:00.000Z'),
    env: { DELIVERY_INVOICE_TTL_HOURS: '24' },
    resolvePrice: automaticPrice(700),
  };
  const first = await issueDeliveryQuote(args);
  const replay = await issueDeliveryQuote(args);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(state.invoices.length, 1);
  assert.equal(first.invoice.amount, 700);
  assert.equal(first.invoice.currency, '643');
  assert.equal(first.invoice.paymentExpiresAt.toISOString(), '2026-11-19T12:00:00.000Z');
  assert.equal(state.order.deliveryCost, 700);
  assert.equal(state.order.deliveryStatus, 'PAYMENT_PENDING');
  assert.equal(state.locks.some((entry) => /FOR UPDATE/.test(entry.query)), true);
});
test('same quote key with changed commercial data is rejected', async () => {
  const { prisma } = createPrisma();
  const common = { prisma, orderId: 41, staffUserId: 9, resolvePrice: automaticPrice(700) };
  await issueDeliveryQuote({ ...common, body: quote() });
  const replay = await issueDeliveryQuote({ ...common, body: quote({ amount: 800 }) });
  assert.equal(replay.replayed, true);
});

test('zero is an explicit staff waiver and blank-like amounts are rejected', async () => {
  for (const amount of [null, '', false, '0']) {
    const order = { askRecipientAddress: true, askRecipientTime: false, deliveryAddress: null, deliveryTime: null };
    assert.throws(
      () => normalizeQuoteRequest(order, quote({ amount })),
      (error) => error.code === 'BAD_DELIVERY_AMOUNT',
    );
  }

  const { prisma, state } = createPrisma({ askRecipientTime: false });
  const result = await issueDeliveryQuote({
    prisma,
    orderId: 41,
    staffUserId: 9,
    body: quote({ amount: 0, deliveryTime: '' }),
    resolvePrice: automaticPrice(0),
  });
  assert.equal(result.invoice, null);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.order.deliveryCost, 0);
  assert.equal(state.order.deliveryStatus, 'WAIVED');
});

test('unknown time with known address resolves without a second invoice or amount', async () => {
  const { prisma, state } = createPrisma({
    askRecipientAddress: false,
    askRecipientTime: true,
    deliveryAddress: 'Ижевск, Советская улица, 1',
    deliveryCost: 300,
  });
  const result = await issueDeliveryQuote({
    prisma,
    orderId: 41,
    staffUserId: 9,
    body: quote({ amount: undefined, deliveryAddress: undefined }),
  });
  assert.equal(result.invoice, null);
  assert.equal(state.order.deliveryCost, 300);
  assert.equal(state.order.deliveryStatus, 'INCLUDED_IN_MAIN');
});

test('quote requires main payment and active authorized staff', async () => {
  for (const setup of [
    [{ paymentStatus: 'PENDING' }, {}, 'MAIN_PAYMENT_REQUIRED'],
    [{ status: 'CANCELLED' }, {}, 'ORDER_CANCELLED'],
    [{}, { staffRole: 'courier' }, 'FORBIDDEN'],
    [{}, { staffActive: false }, 'FORBIDDEN'],
  ]) {
    const [order, staff, code] = setup;
    const { prisma } = createPrisma(order, staff);
    await assert.rejects(
      () => issueDeliveryQuote({ prisma, orderId: 41, staffUserId: 9, body: quote(), resolvePrice: automaticPrice(700) }),
      (error) => error.code === code,
    );
  }
});
