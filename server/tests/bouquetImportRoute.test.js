'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBouquetImportRouter } = require('../routes/bouquetImport');

const env = {
  TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET: 'webhook-secret',
  TELEGRAM_ORDER_BOT_TOKEN: 'bot-token',
  TELEGRAM_ORDER_API_BASE: 'https://telegram.test',
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
