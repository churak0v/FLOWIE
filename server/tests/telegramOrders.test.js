const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enqueueOrderNotification,
  formatOrderMessage,
  parseChatIds,
  processPending,
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

test('paid first order tells the manager to add the outstanding registration gift once', () => {
  const order = {
    id: 42,
    totalPrice: 5999,
    items: [],
    registrationGift: { giftName: 'Raffaello <gift>', giftQuantity: 1, claimedAt: new Date(), fulfilledAt: null },
  };
  const first = formatOrderMessage(order, 'ORDER_PAID');
  assert.match(first, /Подарок за регистрацию/);
  assert.match(first, /Raffaello &lt;gift&gt;/);
  assert.doesNotMatch(formatOrderMessage({ ...order, registrationGift: null }, 'ORDER_PAID'), /Подарок за регистрацию/);
  assert.doesNotMatch(formatOrderMessage(order, 'ORDER_CREATED'), /Подарок за регистрацию/);
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

test('adds an idempotent fulfillment callback only for an enriched paid order gift', async () => {
  let payload;
  const order = {
    id: 42,
    totalPrice: 10000,
    items: [],
    registrationGift: { id: 'gift_abc-1', giftName: 'Raffaello', giftQuantity: 1, claimedAt: new Date(), fulfilledAt: null },
  };
  await sendTelegramMessage({ orderId: 42, chatId: '100', event: 'ORDER_PAID', order }, {
    TELEGRAM_ORDER_BOT_TOKEN: 'secret-token',
    TELEGRAM_ORDER_CHAT_IDS: '100',
  }, async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });
  assert.deepEqual(payload.reply_markup.inline_keyboard[1], [{
    text: 'Подарок передан',
    callback_data: 'registration_gift_fulfill:gift_abc-1:42',
  }]);

  order.id = 43;
  order.registrationGift = null;
  await sendTelegramMessage({ orderId: 43, chatId: '100', event: 'ORDER_PAID', order }, {
    TELEGRAM_ORDER_BOT_TOKEN: 'secret-token', TELEGRAM_ORDER_CHAT_IDS: '100',
  }, async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
  });
  assert.equal(payload.reply_markup.inline_keyboard.length, 1);
});

test('processPending adds gift text and callback only to the first paid order after registration', async () => {
  const claimedAt = new Date('2026-11-26T10:00:00.000Z');
  const gift = { id: 'gift-1', userId: 7, giftName: 'Raffaello', giftQuantity: 1, claimedAt, fulfilledAt: null };
  const notification = (id, orderId, paidAt) => ({
    id,
    orderId,
    chatId: '100',
    event: 'ORDER_PAID',
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date(`2026-11-26T10:0${id}:00.000Z`),
    order: {
      id: orderId,
      userId: 7,
      totalPrice: 5000,
      paidAt,
      items: [],
      user: { registrationGifts: [gift] },
    },
  });
  const pending = [
    notification(1, 10, new Date('2026-11-26T09:00:00.000Z')),
    notification(2, 11, new Date('2026-11-26T10:30:00.000Z')),
    notification(3, 12, new Date('2026-11-26T11:00:00.000Z')),
  ];
  const sentPayloads = [];
  const firstOrderQueries = [];
  const prisma = {
    telegramOrderNotification: {
      updateMany: async ({ where }) => ({ count: where.id ? 1 : 0 }),
      findMany: async () => pending,
      update: async () => ({}),
    },
    order: {
      findFirst: async (query) => {
        firstOrderQueries.push(query);
        return { id: 11 };
      },
    },
  };

  const handled = await processPending(prisma, {
    TELEGRAM_ORDER_BOT_TOKEN: 'secret-token',
    TELEGRAM_ORDER_CHAT_IDS: '100',
    TELEGRAM_ORDER_API_BASE: 'https://telegram.test',
  }, async (_url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, result: { message_id: sentPayloads.length } }) };
  });

  assert.equal(handled, 3);
  assert.equal(firstOrderQueries.length, 3);
  assert.ok(firstOrderQueries.every((query) => query.where.paidAt.gte === claimedAt));
  assert.ok(firstOrderQueries.every((query) => query.where.paymentStatus === 'CONFIRMED'));
  assert.doesNotMatch(sentPayloads[0].text, /Подарок за регистрацию/);
  assert.equal(sentPayloads[0].reply_markup.inline_keyboard.length, 1);
  assert.match(sentPayloads[1].text, /Подарок за регистрацию/);
  assert.deepEqual(sentPayloads[1].reply_markup.inline_keyboard[1], [{
    text: 'Подарок передан',
    callback_data: 'registration_gift_fulfill:gift-1:11',
  }]);
  assert.doesNotMatch(sentPayloads[2].text, /Подарок за регистрацию/);
  assert.equal(sentPayloads[2].reply_markup.inline_keyboard.length, 1);
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
