'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBouquetImportRouter } = require('../routes/bouquetImport');

const env = {
  TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET: 'webhook-secret',
  TELEGRAM_ORDER_BOT_TOKEN: 'bot-token',
  TELEGRAM_ORDER_API_BASE: 'https://telegram.test',
  TELEGRAM_ORDER_STAFF_IDS: '7, 8,invalid,-9',
};

function webhookHandler(router) {
  return router.stack.find((layer) => layer.route?.path === '/webhook').route.stack[0].handle;
}

async function invoke(handler, body, secret = 'webhook-secret') {
  const response = { statusCode: 200, payload: null };
  const req = {
    body,
    get(name) { return name.toLowerCase() === 'x-telegram-bot-api-secret-token' ? secret : undefined; },
  };
  const res = {
    sendStatus(code) { response.statusCode = code; return this; },
    status(code) { response.statusCode = code; return this; },
    json(payload) { response.payload = payload; return this; },
  };
  await handler(req, res);
  return response;
}

test('start response installs a persistent bottom keyboard without premature finish button', async () => {
  const requests = [];
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { return { importId: 'batch_123', status: 'started' }; } },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response('{}');
    },
  });
  const response = await invoke(webhookHandler(router), {
    update_id: 1, message: { chat: { id: -100 }, from: { id: 7 }, text: '/import' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://telegram.test/botbot-token/sendMessage');
  assert.equal(requests[0].body.reply_markup.inline_keyboard, undefined);
  assert.equal(requests[0].body.reply_markup.is_persistent, true);
  assert.equal(requests[0].body.reply_markup.resize_keyboard, true);
  assert.equal(JSON.stringify(requests[0].body.reply_markup).includes('Все фото загружены'), false);
});

test('authorized callbacks are acknowledged through answerCallbackQuery', async () => {
  const requests = [];
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { return { importId: 'batch_123', status: 'queued' }; } },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response('{}');
    },
  });
  await invoke(webhookHandler(router), {
    update_id: 2,
    callback_query: { id: 'callback-1', from: { id: 7 }, message: { chat: { id: -100 } }, data: 'bouquet_import:finish:batch_123' },
  });
  assert.equal(requests[0].url, 'https://telegram.test/botbot-token/answerCallbackQuery');
  assert.deepEqual(requests[0].body, { callback_query_id: 'callback-1', text: 'Принято' });
  assert.equal(requests[1].url, 'https://telegram.test/botbot-token/sendMessage');
});

test('unauthorized callbacks cause no outbound bot requests', async () => {
  let fetchCalls = 0;
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { return { ignored: 'unauthorized' }; } },
    fetchImpl: async () => { fetchCalls += 1; return new Response('{}'); },
  });
  const response = await invoke(webhookHandler(router), {
    update_id: 3,
    callback_query: { id: 'callback-2', from: { id: 999 }, message: { chat: { id: -999 } }, data: 'bouquet_import:finish:batch_123' },
  });
  assert.deepEqual(response.payload, { ok: true });
  assert.equal(fetchCalls, 0);
});

test('registration gift callback requires an allowed numeric staff id', async () => {
  let fulfillmentCalls = 0;
  let fetchCalls = 0;
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { throw new Error('must not reach import service'); } },
    giftFulfillment: async () => { fulfillmentCalls += 1; return { replayed: false }; },
    fetchImpl: async () => { fetchCalls += 1; return new Response('{}'); },
  });
  const response = await invoke(webhookHandler(router), {
    update_id: 5,
    callback_query: { id: 'gift-callback-1', from: { id: 999 }, message: { chat: { id: -100 } }, data: 'registration_gift_fulfill:gift-1:42' },
  });
  assert.deepEqual(response.payload, { ok: true });
  assert.equal(fulfillmentCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('allowed staff fulfills a registration gift and repeated callback is acknowledged', async () => {
  const calls = [];
  const requests = [];
  let replayed = false;
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { throw new Error('must not reach import service'); } },
    giftFulfillment: async (input) => { calls.push(input); return { gift: { id: 'gift-1' }, replayed }; },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response('{}');
    },
  });
  const update = {
    update_id: 6,
    callback_query: { id: 'gift-callback-2', from: { id: 7 }, message: { chat: { id: -100 } }, data: 'registration_gift_fulfill:gift-1:42' },
  };
  await invoke(webhookHandler(router), update);
  assert.deepEqual(calls[0], { prisma: undefined, giftId: 'gift-1', orderId: 42, fulfilledById: null, note: 'telegram:7' });
  assert.deepEqual(requests[0].body, { callback_query_id: 'gift-callback-2', text: 'Подарок отмечен как переданный.', show_alert: false });

  replayed = true;
  await invoke(webhookHandler(router), update);
  assert.equal(calls.length, 2);
  assert.equal(requests[1].body.text, 'Подарок уже отмечен как переданный.');
});

test('registration gift callback preserves the delivered-order gate', async () => {
  const requests = [];
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { throw new Error('must not reach import service'); } },
    giftFulfillment: async () => ({ error: 'ORDER_NOT_DELIVERED', status: 409 }),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return new Response('{}');
    },
  });
  await invoke(webhookHandler(router), {
    update_id: 7,
    callback_query: { id: 'gift-callback-3', from: { id: 8 }, message: { chat: { id: -100 } }, data: 'registration_gift_fulfill:gift-1:42' },
  });
  assert.deepEqual(requests[0], {
    callback_query_id: 'gift-callback-3', text: 'Сначала отметьте заказ доставленным.', show_alert: true,
  });
});

test('rejects an invalid webhook secret before invoking the service', async () => {
  let calls = 0;
  const router = createBouquetImportRouter({
    env,
    service: { async handleUpdate() { calls += 1; return {}; } },
    fetchImpl: async () => new Response('{}'),
  });
  const response = await invoke(webhookHandler(router), { update_id: 4 }, 'wrong');
  assert.equal(response.statusCode, 403);
  assert.equal(calls, 0);
});
