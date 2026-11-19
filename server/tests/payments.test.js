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

const paymentsRouter = require('../routes/payments');
process.env.ALFA_TAX_SYSTEM = '1';

test('Alfa token authentication excludes login/password and keeps the configured r-gateway', async () => {
  const nativeFetch = global.fetch;
  const previous = process.env.ALFA_BANK_TOKEN;
  process.env.ALFA_BANK_TOKEN = 'test-public-token';
  let sent;
  global.fetch = async (url, options) => {
    sent = { url, options, body: new URLSearchParams(options.body) };
    return new Response(JSON.stringify({ orderId: 'token-order', formUrl: 'https://bank.test/form' }));
  };
  try {
    assert.equal(paymentsRouter._test.isAlfaConfigured(), true);
    await paymentsRouter._test.alfaRequest('register', { amount: 100, currency: 643 });
    assert.equal(sent.body.get('token'), 'test-public-token');
    assert.equal(sent.body.has('userName'), false);
    assert.equal(sent.body.has('password'), false);
    assert.equal(sent.body.get('amount'), '100');
    assert.equal(sent.url, 'https://bank.test/payment/rest/register.do');
    assert.equal(sent.options.redirect, 'error');
  } finally {
    global.fetch = nativeFetch;
    if (previous === undefined) delete process.env.ALFA_BANK_TOKEN;
    else process.env.ALFA_BANK_TOKEN = previous;
  }
});

test('r-prefixed API login uses its production gateway when no explicit URL is set', () => {
  const keys = ['ALFA_BANK_MODE', 'ALFA_BANK_USER_NAME', 'ALFA_BANK_API_URL'];
  const previous = keys.map(k => process.env[k]);
  try {
    process.env.ALFA_BANK_MODE = 'prod';
    process.env.ALFA_BANK_USER_NAME = 'r-shop-api';
    delete process.env.ALFA_BANK_API_URL;
    assert.equal(paymentsRouter._test.getAlfaConfig().baseUrl, 'https://payment.alfabank.ru/payment/rest');
    process.env.ALFA_BANK_USER_NAME = 'shop-api';
    assert.equal(paymentsRouter._test.getAlfaConfig().baseUrl, 'https://pay.alfabank.ru/payment/rest');
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

function matches(order, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'paymentStatus' && expected && typeof expected === 'object' && 'not' in expected) {
      return order.paymentStatus !== expected.not;
    }
    if (key === 'status' && expected && typeof expected === 'object' && 'not' in expected) {
      return order.status !== expected.not;
    }
    return order[key] === expected;
  });
}

function createPrisma(orderOverrides = {}) {
  const state = {
    order: {
      id: 41,
      userId: 7,
      status: 'PAYMENT_PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'alfa',
      paymentChargeId: null,
      paymentMeta: null,
      paymentExpiresAt: new Date(Date.now() + 60_000),
      totalPrice: 2500,
      itemsTotal: 2500,
      deliveryCost: null,
      items: [{ productId: 1, quantity: 1, price: 2500, product: { name: 'Тестовый букет' } }],
      user: { id: 7, email: null },
      ...orderOverrides,
    },
    history: [],
  };

  const order = {
    findFirst: async ({ where }) => (matches(state.order, where) ? { ...state.order } : null),
    findUnique: async ({ where }) => (matches(state.order, where) ? { ...state.order } : null),
    updateMany: async ({ where, data }) => {
      if (!matches(state.order, where)) return { count: 0 };
      Object.assign(state.order, data);
      return { count: 1 };
    },
    update: async ({ where, data }) => {
      if (!matches(state.order, where)) throw new Error('ORDER_NOT_FOUND');
      Object.assign(state.order, data);
      return { ...state.order };
    },
  };
  const client = {
    order,
    orderStatusHistory: {
      create: async ({ data }) => {
        state.history.push({ ...data });
        return data;
      },
    },
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
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function request(base, path, options = {}) {
  const response = await httpFetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
}

test('register sends exact RUB amount and reuses the registered bank order', async () => {
  const { client, state } = createPrisma();
  const calls = [];
  const nativeFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), params: new URLSearchParams(String(options.body)) });
    return jsonResponse({ orderId: 'bank-41', formUrl: 'https://bank.test/form/41' });
  };
  try {
    await withServer(client, async (base) => {
      const first = await request(base, '/api/payments/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      const second = await request(base, '/api/payments/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });

      assert.equal(first.status, 200);
      assert.deepEqual(second.body, first.body);
      assert.equal(calls.filter(call => call.url.endsWith('/register.do')).length, 1);
      assert.equal(first.body.paymentMethod, 'alfa');
      assert.equal(first.body.formUrl, 'https://bank.test/form/41');
      assert.equal(calls[0].params.get('taxSystem'), '1');
      const orderBundle = JSON.parse(calls[0].params.get('orderBundle'));
      assert.equal(orderBundle.cartItems.items.length, 1);
      assert.equal(orderBundle.cartItems.items[0].name, 'Тестовый букет');
      assert.equal(orderBundle.cartItems.items[0].itemAmount, 250000);
      assert.equal(orderBundle.cartItems.items[0].tax.taxType, 0);
      assert.deepEqual(orderBundle.cartItems.items[0].itemAttributes.attributes, [
        { name: 'paymentMethod', value: '1' },
        { name: 'paymentObject', value: '1' },
      ]);
      assert.equal(calls[0].params.get('amount'), '250000');
      assert.equal(calls[0].params.get('currency'), '643');
      assert.ok(Number(calls[0].params.get('sessionTimeoutSecs')) > 0);
      assert.ok(Number(calls[0].params.get('sessionTimeoutSecs')) <= 60);
      assert.equal(calls[0].params.get('returnUrl'), 'https://flowie.test/pay/41?payment=success');
      assert.equal(calls[0].params.get('dynamicCallbackUrl'), 'https://flowie.test/api/payments/alfa-callback');
      assert.equal(calls[0].params.has('callbackUrl'), false);
      assert.equal(state.order.paymentChargeId, 'bank-41');
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

test('concurrent registration creates only one bank order', async () => {
  const { client } = createPrisma();
  const nativeFetch = global.fetch;
  let bankCalls = 0;
  global.fetch = async (url) => {
    bankCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return jsonResponse({ orderId: 'bank-race', formUrl: 'https://bank.test/form/race' });
  };
  try {
    await withServer(client, async (base) => {
      const send = () => request(base, '/api/payments/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      const results = await Promise.all([send(), send()]);
      assert.equal(bankCalls, 1);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      assert.equal(results.find((result) => result.status === 409).body.error, 'PAYMENT_REGISTRATION_IN_PROGRESS');
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

test('failed bank registration releases its lock for a safe retry', async () => {
  const { client, state } = createPrisma();
  const nativeFetch = global.fetch;
  global.fetch = async () => jsonResponse({ errorCode: '7', errorMessage: 'bank unavailable' });
  try {
    await withServer(client, async (base) => {
      const result = await request(base, '/api/payments/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      assert.equal(result.status, 500);
      assert.equal(state.order.paymentChargeId, null);
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

test('expired and cancelled orders cannot be registered', async () => {
  const nativeFetch = global.fetch;
  let bankCalls = 0;
  global.fetch = async () => {
    bankCalls += 1;
    return jsonResponse({});
  };
  try {
    for (const [overrides, expected] of [
      [{ paymentExpiresAt: new Date(Date.now() - 1000) }, 'PAYMENT_EXPIRED'],
      [{ status: 'CANCELLED' }, 'ORDER_CANCELLED'],
    ]) {
      const { client } = createPrisma(overrides);
      await withServer(client, async (base) => {
        const result = await request(base, '/api/payments/alfa-register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: 41 }),
        });
        assert.equal(result.status, 409);
        assert.equal(result.body.error, expected);
      });
    }
    assert.equal(bankCalls, 0);
  } finally {
    global.fetch = nativeFetch;
  }
});

test('repeated concurrent callbacks confirm once and create one history entry', async () => {
  const { client, state } = createPrisma({
    paymentChargeId: 'bank-paid',
    paymentMeta: JSON.stringify({ alfa: { orderId: 'bank-paid', amountKopecks: 250000 } }),
  });
  const nativeFetch = global.fetch;
  global.fetch = async () => jsonResponse({ orderStatus: 2, amount: 250000, currency: '643' });
  try {
    await withServer(client, async (base) => {
      const send = () => request(base, '/api/payments/alfa-callback?mdOrder=bank-paid', { method: 'POST' });
      const results = await Promise.all([send(), send(), send()]);
      assert.deepEqual(results.map((result) => result.status), [200, 200, 200]);
      assert.equal(state.order.paymentStatus, 'CONFIRMED');
      assert.equal(state.order.status, 'PAID');
      assert.equal(state.history.length, 1);
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

test('amount and currency mismatches never confirm the order', async () => {
  for (const bankResult of [
    { orderStatus: 2, amount: 249999, currency: '643' },
    { orderStatus: 2, amount: 250000, currency: '840' },
  ]) {
    const { client, state } = createPrisma({ paymentChargeId: 'bank-mismatch' });
    const nativeFetch = global.fetch;
    global.fetch = async () => jsonResponse(bankResult);
    try {
      await withServer(client, async (base) => {
        const result = await request(base, '/api/payments/alfa-status?orderId=41');
        assert.equal(result.status, 409);
        assert.match(result.body.error, /^ALFA_(AMOUNT|CURRENCY)_MISMATCH$/);
        assert.equal(state.order.paymentStatus, 'PENDING');
        assert.equal(state.history.length, 0);
      });
    } finally {
      global.fetch = nativeFetch;
    }
  }
});

test('declined bank order is released and can be registered again', async () => {
  const { client, state } = createPrisma({
    paymentChargeId: 'bank-declined',
    paymentMeta: JSON.stringify({
      alfa: { orderId: 'bank-declined', formUrl: 'https://bank.test/form/declined', amountKopecks: 250000 },
    }),
  });
  const nativeFetch = global.fetch;
  let registerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).endsWith('/getOrderStatusExtended.do')) {
      return jsonResponse({ orderStatus: 6, amount: 250000, currency: '643' });
    }
    registerCalls += 1;
    return jsonResponse({ orderId: 'bank-retry', formUrl: 'https://bank.test/form/retry' });
  };
  try {
    await withServer(client, async (base) => {
      const status = await request(base, '/api/payments/alfa-status?orderId=41');
      assert.equal(status.status, 200);
      assert.equal(status.body.retryAllowed, true);
      assert.equal(state.order.paymentChargeId, null);

      const retry = await request(base, '/api/payments/alfa-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 41 }),
      });
      assert.equal(retry.status, 200);
      assert.equal(registerCalls, 1);
      assert.equal(state.order.paymentChargeId, 'bank-retry');
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

test('captured payment on a cancelled order is flagged for reconciliation', async () => {
  const { client, state } = createPrisma({ status: 'CANCELLED', paymentChargeId: 'bank-cancelled' });
  const nativeFetch = global.fetch;
  global.fetch = async () => jsonResponse({ orderStatus: 2, amount: 250000, currency: '643' });
  try {
    await withServer(client, async (base) => {
      const result = await request(base, '/api/payments/alfa-callback?mdOrder=bank-cancelled', { method: 'POST' });
      assert.equal(result.status, 200);
      assert.equal(result.body.requiresReconciliation, true);
      assert.equal(state.order.paymentStatus, 'PENDING');
      assert.equal(state.history.length, 0);
    });
  } finally {
    global.fetch = nativeFetch;
  }
});

function registerRequest(base) {
  return request(base, '/api/payments/alfa-register', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:41})});
}

test('existing Alfa internet-acquiring URL is reused without creating a duplicate order',async()=>{
  const {client}=createPrisma({paymentChargeId:'legacy',paymentMeta:JSON.stringify({alfa:{orderId:'legacy',formUrl:'https://bank.test/cards'}})});
  const nativeFetch=global.fetch;const calls=[];
  global.fetch=async url=>{calls.push(String(url));return jsonResponse({});};
  try {await withServer(client,async base=>{const result=await registerRequest(base);assert.equal(result.body.formUrl,'https://bank.test/cards');assert.equal(result.body.paymentMethod,'alfa');});assert.equal(calls.length,0);}
  finally{global.fetch=nativeFetch;}
});

test('invalid internet-acquiring URL is rejected before it reaches the client',async()=>{
  const {client,state}=createPrisma();const nativeFetch=global.fetch;
  global.fetch=async()=>jsonResponse({orderId:'bad-form',formUrl:'https://evil.test/phish'});
  try {await withServer(client,async base=>{const result=await registerRequest(base);assert.equal(result.status,502);assert.equal(result.body.error,'ALFA_PAYMENT_URL_INVALID');assert.equal(result.body.formUrl,undefined);});assert.equal(state.order.paymentChargeId,null);}
  finally{global.fetch=nativeFetch;}
});

test('internet-acquiring URL validator and tax system permit only configured values',()=>{
  assert.equal(paymentsRouter._test.validateAlfaFormUrl('https://bank.test/payment/form?id=1'),'https://bank.test/payment/form?id=1');
  for(const value of ['http://bank.test/form','https://evil.test/form','https://user@bank.test/form','javascript:alert(1)','https://bank.test:444/form']) {
    assert.throws(()=>paymentsRouter._test.validateAlfaFormUrl(value),/ALFA_PAYMENT_URL_INVALID/);
  }
  const previous=process.env.ALFA_TAX_SYSTEM;
  try{
    delete process.env.ALFA_TAX_SYSTEM;assert.equal(paymentsRouter._test.getAlfaConfig().taxSystem,'1');
    for(const value of ['0','1','2','3','4','5']){process.env.ALFA_TAX_SYSTEM=value;assert.equal(paymentsRouter._test.getAlfaConfig().taxSystem,value);}
    process.env.ALFA_TAX_SYSTEM='6';assert.throws(()=>paymentsRouter._test.getAlfaConfig(),/ALFA_TAX_SYSTEM_INVALID/);
  }finally{if(previous===undefined)delete process.env.ALFA_TAX_SYSTEM;else process.env.ALFA_TAX_SYSTEM=previous;}
});
