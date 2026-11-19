const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const httpFetch = global.fetch;

process.env.ALFA_BANK_ENABLED = 'true';
process.env.ALFA_BANK_MODE = 'test';
process.env.ALFA_BANK_USER_NAME = 'test-user';
process.env.ALFA_BANK_PASSWORD = 'test-password';
process.env.ALFA_BANK_API_URL = 'https://bank.test/payment/rest';
process.env.PUBLIC_SITE_URL = 'https://flowie.test';
process.env.DELIVERY_INVOICE_TTL_HOURS = '24';

const paymentsRouter = require('../routes/payments');
process.env.ALFA_TAX_SYSTEM = '1';

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('not' in expected) return row[key] !== expected.not;
    }
    return row[key] === expected;
  });
}

function createPrisma(overrides = {}) {
  const state = {
    order: {
      id: 41,
      userId: 7,
      status: 'PAID',
      paymentStatus: 'CONFIRMED',
      paymentChargeId: 'main-bank-order',
      totalPrice: 5000,
      deliveryStatus: 'PAYMENT_PENDING',
      ...overrides.order,
    },
    invoice: {
      id: 91,
      orderId: 41,
      amount: 700,
      currency: '643',
      status: 'PAYMENT_PENDING',
      paymentChargeId: null,
      paymentMeta: null,
      paymentExpiresAt: new Date(Date.now() + 60_000),
      paidAt: null,
      ...overrides.invoice,
    },
    invoicePaidWrites: 0,
  };

  const order = {
    findFirst: async ({ where }) => (matches(state.order, where)
      ? { ...state.order, deliveryInvoice: state.invoice ? { ...state.invoice } : null }
      : null),
    findUnique: async ({ where }) => (matches(state.order, where) ? { ...state.order } : null),
    update: async ({ where, data }) => {
      if (!matches(state.order, where)) throw new Error('ORDER_NOT_FOUND');
      Object.assign(state.order, data);
      return { ...state.order };
    },
    updateMany: async ({ where, data }) => {
      if (!matches(state.order, where)) return { count: 0 };
      Object.assign(state.order, data);
      return { count: 1 };
    },
  };
  const deliveryInvoice = {
    findFirst: async ({ where }) => (state.invoice && matches(state.invoice, where) ? { ...state.invoice } : null),
    findUnique: async ({ where }) => (state.invoice && matches(state.invoice, where) ? { ...state.invoice } : null),
    update: async ({ where, data }) => {
      if (!state.invoice || !matches(state.invoice, where)) throw new Error('INVOICE_NOT_FOUND');
      if (data.status === 'PAID' && state.invoice.status !== 'PAID') state.invoicePaidWrites += 1;
      Object.assign(state.invoice, data);
      return { ...state.invoice };
    },
    updateMany: async ({ where, data }) => {
      if (!state.invoice || !matches(state.invoice, where)) return { count: 0 };
      Object.assign(state.invoice, data);
      return { count: 1 };
    },
  };
  const client = {
    order,
    deliveryInvoice,
    analyticsEvent: { create: async () => null },
    $queryRawUnsafe: async () => [],
  };
  client.$transaction = async (fn) => fn(client);
  return { client, state };
}

async function withServer(prisma, run) {
  paymentsRouter.__setPrismaForTests(prisma);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 7, telegramId: '700' };
    next();
  });
  app.use('/api/payments', paymentsRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(base, path, options = {}) {
  const response = await httpFetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('delivery registration uses its exact isolated amount and callback URL', async () => {
  const { client, state } = createPrisma();
  const nativeFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), params: new URLSearchParams(String(options.body)) });
    if (String(url).endsWith('/sbp/c2b/qr/dynamic/get.do')) {
      return jsonResponse({ qrStatus: 'STARTED', payload: 'https://qr.nspk.ru/AS1812DELIVERY41' });
    }
    return jsonResponse({ orderId: 'delivery-bank-41', formUrl: 'https://bank.test/delivery/41' });
  };
  try {
    await withServer(client, async (base) => {
      const result = await request(base, '/api/payments/delivery/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.formUrl, 'https://qr.nspk.ru/AS1812DELIVERY41');
      assert.equal(result.body.paymentMethod, 'sbp');
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].params.get('taxSystem'), '1');
    const orderBundle = JSON.parse(calls[0].params.get('orderBundle'));
    assert.equal(orderBundle.cartItems.items[0].name, 'Доставка заказа #41');
    assert.equal(orderBundle.cartItems.items[0].itemAmount, 70000);
    assert.deepEqual(orderBundle.cartItems.items[0].itemAttributes.attributes, [
      { name: 'paymentMethod', value: '1' },
      { name: 'paymentObject', value: '4' },
    ]);
    assert.equal(calls[0].params.get('amount'), '70000');
    assert.equal(calls[0].params.get('currency'), '643');
    assert.equal(calls[0].params.get('dynamicCallbackUrl'), 'https://flowie.test/api/payments/delivery/alfa-callback');
    assert.match(calls[0].params.get('orderNumber'), /^flowie-delivery-/);
    assert.equal(state.invoice.paymentChargeId, 'delivery-bank-41');
    assert.equal(state.order.paymentChargeId, 'main-bank-order');
    assert.equal(state.order.totalPrice, 5000);
  } finally {
    global.fetch = nativeFetch;
  }
});

test('repeated successful delivery callbacks confirm once without mutating main payment', async () => {
  const { client, state } = createPrisma({
    invoice: {
      paymentChargeId: 'delivery-bank-41',
      paymentMeta: JSON.stringify({ alfa: { orderId: 'delivery-bank-41' } }),
    },
  });
  const nativeFetch = global.fetch;
  global.fetch = async () => jsonResponse({ orderStatus: 2, amount: 70000, currency: '643' });
  try {
    await withServer(client, async (base) => {
      for (let index = 0; index < 2; index += 1) {
        const result = await request(base, '/api/payments/delivery/alfa-callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: 'delivery-bank-41' }),
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.paid, true);
      }
    });
    assert.equal(state.invoice.status, 'PAID');
    assert.equal(state.invoicePaidWrites, 1);
    assert.equal(state.order.deliveryStatus, 'PAID');
    assert.equal(state.order.paymentStatus, 'CONFIRMED');
    assert.equal(state.order.paymentChargeId, 'main-bank-order');
  } finally {
    global.fetch = nativeFetch;
  }
});

test('delivery amount or currency mismatch cannot confirm either payment', async () => {
  for (const bankResult of [
    { orderStatus: 2, amount: 69900, currency: '643' },
    { orderStatus: 2, amount: 70000, currency: '840' },
  ]) {
    const { client, state } = createPrisma({ invoice: { paymentChargeId: 'delivery-bank-41' } });
    const nativeFetch = global.fetch;
    global.fetch = async () => jsonResponse(bankResult);
    try {
      await withServer(client, async (base) => {
        const result = await request(base, '/api/payments/delivery/alfa-callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: 'delivery-bank-41' }),
        });
        assert.equal(result.status, 409);
      });
      assert.equal(state.invoice.status, 'PAYMENT_PENDING');
      assert.equal(state.order.deliveryStatus, 'PAYMENT_PENDING');
      assert.equal(state.order.paymentStatus, 'CONFIRMED');
    } finally {
      global.fetch = nativeFetch;
    }
  }
});

test('expired unregistered invoice is safely extended and retryable', async () => {
  const { client, state } = createPrisma({ invoice: { paymentExpiresAt: new Date(Date.now() - 1_000) } });
  const nativeFetch = global.fetch;
  global.fetch = async (url) => String(url).endsWith('/sbp/c2b/qr/dynamic/get.do')
    ? jsonResponse({ qrStatus: 'STARTED', payload: 'https://qr.nspk.ru/AS1812DELIVERYRETRY' })
    : jsonResponse({ orderId: 'delivery-bank-retry', formUrl: 'https://bank.test/retry' });
  try {
    await withServer(client, async (base) => {
      const result = await request(base, '/api/payments/delivery/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      assert.equal(result.status, 200);
    });
    assert.equal(new Date(state.invoice.paymentExpiresAt).getTime() > Date.now(), true);
    assert.equal(state.invoice.paymentChargeId, 'delivery-bank-retry');
  } finally {
    global.fetch = nativeFetch;
  }
});

test('cancellation during bank registration preserves bank id for late-payment reconciliation', async () => {
  const { client, state } = createPrisma();
  const nativeFetch = global.fetch;
  let bankPhase = 'register';
  global.fetch = async () => {
    if (bankPhase === 'register') {
      state.order.status = 'CANCELLED';
      state.order.deliveryStatus = 'CANCELLED';
      state.invoice.status = 'CANCELLED';
      return jsonResponse({ orderId: 'delivery-bank-late', formUrl: 'https://bank.test/late' });
    }
    return jsonResponse({ orderStatus: 2, amount: 70000, currency: '643' });
  };
  try {
    await withServer(client, async (base) => {
      const registration = await request(base, '/api/payments/delivery/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      assert.equal(registration.status, 409);
      assert.equal(registration.body.error, 'DELIVERY_CANCELLED_AFTER_REGISTRATION');
      assert.equal(state.invoice.paymentChargeId, 'delivery-bank-late');

      bankPhase = 'status';
      const callback = await request(base, '/api/payments/delivery/alfa-callback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 'delivery-bank-late' }),
      });
      assert.equal(callback.status, 200);
      assert.equal(callback.body.requiresReconciliation, true);
    });
    assert.equal(state.invoice.status, 'RECONCILIATION_REQUIRED');
    assert.ok(state.invoice.paidAt instanceof Date);
    assert.equal(state.invoice.paymentChargeId, 'delivery-bank-late');
    assert.equal(state.order.deliveryStatus, 'RECONCILIATION_REQUIRED');
    assert.equal(state.order.paymentStatus, 'CONFIRMED');
  } finally {
    global.fetch = nativeFetch;
  }
});


function deliveryRegister(base) {
  return request(base,'/api/payments/delivery/alfa-register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:41})});
}
test('delivery gets a fresh direct SBP link without duplicate registration',async()=>{
  const {client,state}=createPrisma({invoice:{paymentChargeId:'existing-delivery',paymentMeta:JSON.stringify({alfa:{orderId:'existing-delivery',formUrl:'https://bank.test/cards'}})}});
  const nativeFetch=global.fetch;const calls=[];
  global.fetch=async url=>{calls.push(String(url));return jsonResponse({qrStatus:'STARTED',payload:'https://qr.nspk.ru/AS1812DELIVERYEXISTING'});};
  try{await withServer(client,async base=>{
    const result=await deliveryRegister(base);assert.equal(result.status,200);assert.equal(result.body.formUrl,'https://qr.nspk.ru/AS1812DELIVERYEXISTING');assert.equal(result.body.paymentMethod,'sbp');
  });assert.equal(calls.filter(url=>url.endsWith('/register.do')).length,0);assert.equal(calls.length,1);assert.equal(state.invoice.paymentChargeId,'existing-delivery');}
  finally{global.fetch=nativeFetch;}
});
