const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enqueueOrderNotification,
  formatOrderMessage,
  parseChatIds,
  sendTelegramMessage,
} = require('../services/telegramOrders');

test('parses unique numeric Telegram chat ids', () => {
  assert.deepEqual(parseChatIds('123, -456,123,@invalid,abc'), ['123', '-456']);
});

test('formats order notification and escapes customer content', () => {
  const message = formatOrderMessage({
    id: 42,
    totalPrice: 5999,
    recipientName: 'Аня <3',
    recipientPhone: '+7 900 000-00-00',
    senderPhone: '+7 911 111-11-11',
    deliveryAddress: 'ул. Цветочная, 1',
    deliveryTime: 'сегодня 18:00–20:00',
    floristComment: '<без открытки>',
    items: [{ productId: 7, quantity: 1, price: 5999, product: { name: 'Пионы & розы' } }],
  }, 'ORDER_CREATED');
  assert.match(message, /Новый заказ №42/);
  assert.match(message, /5\s999\s₽/);
  assert.doesNotMatch(message, /Аня &lt;3/);
  assert.match(message, /Пионы &amp; розы/);
  assert.doesNotMatch(message, /<без открытки>/);
});

test('queues one idempotent notification per configured recipient', async () => {
  let call;
  const prisma = {
    telegramOrderNotification: {
      createMany: async (input) => { call = input; return { count: input.data.length }; },
    },
  };
  const result = await enqueueOrderNotification(prisma, 42, 'ORDER_CREATED', {
    TELEGRAM_ORDER_BOT_TOKEN: 'token',
    TELEGRAM_ORDER_CHAT_IDS: '100,200',
  });
  assert.deepEqual(result, { enabled: true, queued: 2 });
  assert.equal(call.skipDuplicates, true);
  assert.deepEqual(call.data, [
    { orderId: 42, event: 'ORDER_CREATED', chatId: '100' },
    { orderId: 42, event: 'ORDER_CREATED', chatId: '200' },
  ]);
});

test('sends a Telegram message with a direct admin order button', async () => {
  let request;
  const result = await sendTelegramMessage({
    orderId: 42,
    chatId: '100',
    event: 'ORDER_PAID',
    order: { id: 42, totalPrice: 10000, items: [] },
  }, {
    TELEGRAM_ORDER_BOT_TOKEN: 'secret-token',
    TELEGRAM_ORDER_CHAT_IDS: '100',
    TELEGRAM_ORDER_ADMIN_URL: 'https://admin.flowie.art/',
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 9 } }) };
  });
  assert.equal(result.message_id, 9);
  assert.match(request.url, /\/botsecret-token\/sendMessage$/);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.chat_id, '100');
  assert.match(payload.text, /Новый заказ №42/);
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, 'https://admin.flowie.art/orders/42');
});

test('uses a configured Telegram relay base URL', async () => {
  let requestUrl;
  await sendTelegramMessage({ orderId: 7, chatId: '100', event: 'ORDER_PAID', order: { id: 7, totalPrice: 1, items: [] } }, {
    TELEGRAM_ORDER_BOT_TOKEN: 'secret-token',
    TELEGRAM_ORDER_CHAT_IDS: '100',
    TELEGRAM_ORDER_API_BASE: 'https://speka.tech/flowie-telegram/',
  }, async (url) => {
    requestUrl = url;
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });
  assert.equal(requestUrl, 'https://speka.tech/flowie-telegram/botsecret-token/sendMessage');
});
