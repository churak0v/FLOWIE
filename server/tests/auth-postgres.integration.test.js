const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { reserveOtpChallenge, consumeOtpAttempt } = require('../services/otpStore');
const { createSession, resolveSession } = require('../services/authSession');
const { mergeGuestData } = require('../routes/auth')._test;
const authRouter = require('../routes/auth');
const { authenticate } = require('../middleware/auth');

const databaseUrl = process.env.TEST_DATABASE_URL;

test('auth migrations and concurrency hold on isolated PostgreSQL', { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousOtp = process.env.OTP_HASH_SECRET;
  const previousAuth = process.env.AUTH_HASH_SECRET;
  process.env.OTP_HASH_SECRET = 'postgres-otp-test-secret';
  process.env.AUTH_HASH_SECRET = 'postgres-auth-test-secret';

  try {
    const now = new Date('2026-11-18T10:00:00.000Z');
    const requests = await Promise.allSettled(Array.from({ length: 25 }, () => reserveOtpChallenge({
      prisma,
      phone: '+79995550001',
      ipHash: 'postgres-ip',
      userId: null,
      code: '123456',
      now,
    })));
    assert.equal(requests.filter((result) => result.status === 'fulfilled').length, 1);

    const challenge = requests.find((result) => result.status === 'fulfilled').value;
    await Promise.all(Array.from({ length: 100 }, () => consumeOtpAttempt({
      prisma,
      challengeId: challenge.id,
      code: '000000',
      now,
    })));
    const exhausted = await prisma.phoneOtpChallenge.findUnique({ where: { id: challenge.id } });
    assert.equal(exhausted.attempts, 5);

    const singleUse = await reserveOtpChallenge({
      prisma,
      phone: '+79995550002',
      ipHash: 'postgres-ip-two',
      userId: null,
      code: '654321',
      now,
    });
    const verifies = await Promise.all(Array.from({ length: 20 }, () => consumeOtpAttempt({
      prisma,
      challengeId: singleUse.id,
      code: '654321',
      now,
    })));
    assert.equal(verifies.filter((result) => result.ok).length, 1);

    const guest = await prisma.user.create({ data: { name: 'Гость', phone: '+79990000000' } });
    const target = await prisma.user.create({
      data: { name: 'Покупатель', verifiedPhone: '+79995550003', phone: '+79995550003', phoneVerifiedAt: now },
    });
    const order = await prisma.order.create({
      data: {
        userId: guest.id,
        checkoutKey: 'isolated-checkout-key',
        status: 'PAYMENT_PENDING',
        itemsTotal: 1000,
        deliveryCost: 0,
        totalPrice: 1000,
        deliveryAddress: 'Тестовый адрес',
      },
    });
    await prisma.$transaction((tx) => mergeGuestData(tx, guest.id, target.id));
    assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).userId, target.id);

    await assert.rejects(
      () => prisma.order.create({
        data: {
          userId: target.id,
          checkoutKey: 'isolated-checkout-key',
          status: 'PAYMENT_PENDING',
          itemsTotal: 1000,
          deliveryCost: 0,
          totalPrice: 1000,
          deliveryAddress: 'Другой адрес',
        },
      }),
      (error) => error?.code === 'P2002',
    );

    const issued = await createSession(prisma, target.id, { ip: '127.0.0.1', headers: { 'user-agent': 'integration-test' } }, now);
    const resolved = await resolveSession(prisma, issued.token, new Date(now.getTime() + 1000));
    assert.equal(resolved.user.id, target.id);
  } finally {
    await prisma.$disconnect();
    if (previousOtp == null) delete process.env.OTP_HASH_SECRET; else process.env.OTP_HASH_SECRET = previousOtp;
    if (previousAuth == null) delete process.env.AUTH_HASH_SECRET; else process.env.AUTH_HASH_SECRET = previousAuth;
  }
});

test('guest cookie upgrades through mocked SMS routes without losing orders', { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let deliveredCode = '';
  const smsServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = new URLSearchParams(raw);
      deliveredCode = /\b(\d{6})\b/.exec(body.get('msg') || '')?.[1] || '';
      const phone = body.get('to');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status_code: 100, sms: { [phone]: { status_code: 100, sms_id: 'mock-route-id' } } }));
    });
  });
  await new Promise((resolve) => smsServer.listen(0, '127.0.0.1', resolve));
  const smsPort = smsServer.address().port;

  const previous = {
    smsEnabled: process.env.SMS_AUTH_ENABLED,
    smsApi: process.env.SMS_RU_API_ID,
    smsBase: process.env.SMS_RU_BASE_URL,
    otp: process.env.OTP_HASH_SECRET,
    auth: process.env.AUTH_HASH_SECRET,
  };
  process.env.SMS_AUTH_ENABLED = 'true';
  process.env.SMS_RU_API_ID = 'mock-route-api-id';
  process.env.SMS_RU_BASE_URL = `http://127.0.0.1:${smsPort}`;
  process.env.OTP_HASH_SECRET = 'route-otp-secret';
  process.env.AUTH_HASH_SECRET = 'route-auth-secret';

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/auth', authRouter);
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const appPort = appServer.address().port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  const post = async (path, body, cookieValue = '') => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        ...(cookieValue ? { Cookie: cookieValue } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    return { response, data: await response.json(), cookie: response.headers.get('set-cookie') || '' };
  };

  try {
    const crossSite = await fetch(`${baseUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: '{}',
    });
    assert.equal(crossSite.status, 403);

    const guest = await post('/api/auth/guest', {});
    assert.equal(guest.response.status, 200);
    const guestCookie = guest.cookie.split(';')[0];
    const guestUserId = guest.data.user.id;
    const order = await prisma.order.create({
      data: {
        userId: guestUserId,
        checkoutKey: 'route-upgrade-order',
        status: 'PAYMENT_PENDING',
        itemsTotal: 2000,
        deliveryCost: 0,
        totalPrice: 2000,
        deliveryAddress: 'Маршрутный тест',
      },
    });

    const requested = await post('/api/auth/phone/request', { phone: '+7 999 555-00-04' }, guestCookie);
    assert.equal(requested.response.status, 200);
    assert.match(deliveredCode, /^\d{6}$/);
    assert.equal(JSON.stringify(requested.data).includes(deliveredCode), false);

    const verified = await post('/api/auth/phone/verify', {
      challengeId: requested.data.challengeId,
      code: deliveredCode,
    }, guestCookie);
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.user.phoneVerified, true);
    assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).userId, verified.data.user.id);

    const reused = await post('/api/auth/phone/verify', {
      challengeId: requested.data.challengeId,
      code: deliveredCode,
    }, verified.cookie.split(';')[0]);
    assert.equal(reused.response.status, 400);
  } finally {
    await new Promise((resolve) => appServer.close(resolve));
    await new Promise((resolve) => smsServer.close(resolve));
    await prisma.$disconnect();
    if (previous.smsEnabled == null) delete process.env.SMS_AUTH_ENABLED; else process.env.SMS_AUTH_ENABLED = previous.smsEnabled;
    if (previous.smsApi == null) delete process.env.SMS_RU_API_ID; else process.env.SMS_RU_API_ID = previous.smsApi;
    if (previous.smsBase == null) delete process.env.SMS_RU_BASE_URL; else process.env.SMS_RU_BASE_URL = previous.smsBase;
    if (previous.otp == null) delete process.env.OTP_HASH_SECRET; else process.env.OTP_HASH_SECRET = previous.otp;
    if (previous.auth == null) delete process.env.AUTH_HASH_SECRET; else process.env.AUTH_HASH_SECRET = previous.auth;
  }
});
