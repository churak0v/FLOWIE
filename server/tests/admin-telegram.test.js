const test = require('node:test');
const assert = require('node:assert/strict');
const { sign } = require('@tma.js/init-data-node');

const adminRouter = require('../routes/admin');
const authRouter = require('../routes/auth');
const deliveryRouter = require('../routes/delivery');
const telegramRouter = require('../routes/telegram');

const {
  normalizeOrderStatus,
  isAllowedTransition,
  canAccessOrder,
  deliveryDispatchError,
  validateAndParseAdminInitData,
} = adminRouter._test;
const { makeSig, safeEqual, requireWebhookSecret } = telegramRouter._test;
const { parseTelegramIdentity } = authRouter._test;
const { estimateDelivery } = deliveryRouter._test;

test('Telegram initData validates and preserves the signed user identity', () => {
  const token = '123456:test-only-token';
  const initData = sign(
    {
      query_id: 'test-query',
      start_param: 'campaign_1',
      user: { id: 123456789, first_name: 'Иван', last_name: 'Петров', username: 'ivan' },
    },
    token,
    new Date(),
  );

  assert.deepEqual(parseTelegramIdentity(initData, token), {
    telegramId: '123456789',
    name: 'Иван Петров',
    username: 'ivan',
    startParam: 'campaign_1',
  });
  assert.throws(() => parseTelegramIdentity(initData, `${token}-wrong`));
});

test('order workflow only permits the release sequence', () => {
  assert.equal(normalizeOrderStatus('PAID'), 'NEW');
  assert.equal(normalizeOrderStatus('PAYMENT_PENDING'), 'NEW');
  assert.equal(isAllowedTransition('PAID', 'ACCEPTED'), true);
  assert.equal(isAllowedTransition('ACCEPTED', 'ASSEMBLED'), true);
  assert.equal(isAllowedTransition('ASSEMBLED', 'IN_DELIVERY'), true);
  assert.equal(isAllowedTransition('IN_DELIVERY', 'DELIVERED'), true);
  assert.equal(isAllowedTransition('NEW', 'DELIVERED'), false);
  assert.equal(isAllowedTransition('DELIVERED', 'ACCEPTED'), false);
  assert.equal(isAllowedTransition('CANCELLED', 'ACCEPTED'), false);
});

test('dispatch requires resolved and paid or included delivery', () => {
  assert.equal(deliveryDispatchError({ deliveryStatus: 'PAYMENT_PENDING' }), 'DELIVERY_PAYMENT_REQUIRED');
  assert.equal(deliveryDispatchError({ deliveryStatus: 'PAID', deliveryAddress: '' }), 'DELIVERY_DETAILS_REQUIRED');
  assert.equal(deliveryDispatchError({
    deliveryStatus: 'INCLUDED_IN_MAIN',
    deliveryAddress: 'Ижевск, Пушкинская улица, 10',
    askRecipientTime: true,
    deliveryTime: '',
  }), 'DELIVERY_DETAILS_REQUIRED');
  assert.equal(deliveryDispatchError({
    deliveryStatus: 'PAID',
    deliveryAddress: 'Ижевск, Пушкинская улица, 10',
    askRecipientTime: true,
    deliveryTime: '18:00–20:00',
  }), null);
  assert.equal(deliveryDispatchError({ deliveryStatus: 'NOT_REQUIRED' }), null);
});

test('admin initData accepts either configured bot and rejects other signatures', () => {
  const previousAdmin = process.env.ADMIN_BOT_TOKEN;
  const previousClient = process.env.BOT_TOKEN;
  process.env.ADMIN_BOT_TOKEN = '123456:admin-test-token';
  process.env.BOT_TOKEN = '123456:client-test-token';

  const makeInitData = (token) => sign(
    { query_id: 'admin-query', user: { id: 99, first_name: 'Admin' } },
    token,
    new Date(),
  );
  assert.equal(validateAndParseAdminInitData(makeInitData(process.env.ADMIN_BOT_TOKEN)).user.id, 99);
  assert.equal(validateAndParseAdminInitData(makeInitData(process.env.BOT_TOKEN)).user.id, 99);
  assert.throws(() => validateAndParseAdminInitData(makeInitData('123456:other-test-token')));

  if (previousAdmin == null) delete process.env.ADMIN_BOT_TOKEN;
  else process.env.ADMIN_BOT_TOKEN = previousAdmin;
  if (previousClient == null) delete process.env.BOT_TOKEN;
  else process.env.BOT_TOKEN = previousClient;
});

test('delivery estimate fails explicitly instead of returning a random tariff', async () => {
  const makeResponse = () => {
    const state = { status: 200, body: null };
    return {
      state,
      status(code) { state.status = code; return this; },
      json(body) { state.body = body; return this; },
    };
  };

  const missing = makeResponse();
  deliveryRouter._test.setPrisma({ deliverySettings: {findUnique: async () => null}, deliveryZone: { findMany: async () => [] } });
  await estimateDelivery({ body: {} }, missing);
  assert.equal(missing.state.status, 400);
  assert.equal(missing.state.body.error, 'DELIVERY_DESTINATION_REQUIRED');

  const configured = makeResponse();
  await estimateDelivery({ body: { address: 'Самара' } }, configured);
  assert.equal(configured.state.status, 503);
  assert.deepEqual(configured.state.body, { ok: false, error: 'DELIVERY_TARIFF_NOT_CONFIGURED' });
});

test('couriers only access their assigned orders', () => {
  assert.equal(canAccessOrder({ id: 7, role: 'courier' }, { courierId: 7 }), true);
  assert.equal(canAccessOrder({ id: 7, role: 'courier' }, { courierId: 8 }), false);
  assert.equal(canAccessOrder({ id: 7, role: 'courier' }, { courierId: null }), false);
  assert.equal(canAccessOrder({ id: 1, role: 'florist' }, { courierId: 8 }), true);
});

test('telegram callback signatures require an application secret', () => {
  const previous = process.env.APP_JWT_SECRET;
  delete process.env.APP_JWT_SECRET;
  assert.equal(makeSig(42), '');
  process.env.APP_JWT_SECRET = 'test-only-secret';
  const signature = makeSig(42);
  assert.match(signature, /^[a-f0-9]{16}$/);
  assert.equal(safeEqual(signature, signature), true);
  assert.equal(safeEqual(signature, `${signature}0`), false);
  if (previous == null) delete process.env.APP_JWT_SECRET;
  else process.env.APP_JWT_SECRET = previous;
});

test('telegram webhooks reject missing or wrong secret tokens', () => {
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-test-secret';

  const response = () => {
    const state = { status: null, body: null };
    return {
      state,
      status(code) { state.status = code; return this; },
      json(body) { state.body = body; return this; },
    };
  };

  const missing = response();
  requireWebhookSecret({ headers: {} }, missing, () => assert.fail('must not call next'));
  assert.equal(missing.state.status, 401);

  const wrong = response();
  requireWebhookSecret({ headers: { 'x-telegram-bot-api-secret-token': 'wrong' } }, wrong, () => assert.fail('must not call next'));
  assert.equal(wrong.state.status, 401);

  let allowed = false;
  requireWebhookSecret(
    { headers: { 'x-telegram-bot-api-secret-token': 'webhook-test-secret' } },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);

  if (previous == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
});
