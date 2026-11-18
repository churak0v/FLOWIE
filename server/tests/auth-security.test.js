const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhone, hashOtp, safeHashEqual } = require('../services/phoneOtp');
const { SESSION_COOKIE, createSession, resolveSession, sha256 } = require('../services/authSession');
const { sendOtpSms } = require('../services/smsru');
const { isSameOriginRequest, getSessionToken } = require('../middleware/auth');
const { createCorsOriginCallback } = require('../services/corsOrigins');
const authRouter = require('../routes/auth');
const { isGuestUser, mergeGuestData } = authRouter._test;

test('phone normalization accepts canonical numbers and rejects malformed input', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.equal(normalizePhone('123'), null);
});

test('OTP is stored as a keyed hash and comparisons are timing safe', () => {
  const previous = process.env.OTP_HASH_SECRET;
  process.env.OTP_HASH_SECRET = 'test-otp-secret';
  const digest = hashOtp({ challengeId: 'challenge', phone: '+79991234567', code: '012345' });
  assert.equal(digest.includes('012345'), false);
  assert.equal(safeHashEqual(digest, digest), true);
  assert.equal(safeHashEqual(digest, `${digest}0`), false);
  if (previous == null) delete process.env.OTP_HASH_SECRET;
  else process.env.OTP_HASH_SECRET = previous;
});

test('opaque sessions persist only a token hash and reject expired sessions', async () => {
  let createdData = null;
  const now = new Date('2026-11-18T08:00:00.000Z');
  const prisma = {
    authSession: {
      create: async ({ data }) => {
        createdData = data;
        return { id: 'session-1', ...data, createdAt: now, lastSeenAt: now };
      },
      findUnique: async () => ({
        id: 'session-1',
        tokenHash: createdData.tokenHash,
        userId: 1,
        user: { id: 1 },
        revokedAt: null,
        expiresAt: new Date(now.getTime() - 1),
        lastSeenAt: now,
      }),
      update: async () => null,
    },
  };
  const previous = process.env.APP_JWT_SECRET;
  process.env.APP_JWT_SECRET = 'test-session-secret';
  const result = await createSession(prisma, 1, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }, now);
  assert.equal(result.token.length > 30, true);
  assert.equal(createdData.tokenHash, sha256(result.token));
  assert.equal(JSON.stringify(createdData).includes(result.token), false);
  assert.equal(await resolveSession(prisma, result.token, now), null);
  if (previous == null) delete process.env.APP_JWT_SECRET;
  else process.env.APP_JWT_SECRET = previous;
});

test('SMS.ru integration is disabled without explicit enablement and uses official POST fields when mocked', async () => {
  const snapshot = {
    enabled: process.env.SMS_AUTH_ENABLED,
    api: process.env.SMS_RU_API_ID,
    base: process.env.SMS_RU_BASE_URL,
  };
  delete process.env.SMS_AUTH_ENABLED;
  delete process.env.SMS_RU_API_ID;
  let called = false;
  await assert.rejects(
    () => sendOtpSms({ phone: '+79991234567', code: '123456', fetchImpl: async () => { called = true; } }),
    /SMS_AUTH_DISABLED/,
  );
  assert.equal(called, false);

  process.env.SMS_AUTH_ENABLED = 'true';
  process.env.SMS_RU_API_ID = 'test-api-id';
  process.env.SMS_RU_BASE_URL = 'https://sms.example.test';
  let request = null;
  const result = await sendOtpSms({
    phone: '+79991234567',
    code: '123456',
    ip: '127.0.0.1',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ status_code: 100, sms: { 79991234567: { status_code: 100, sms_id: 'mock-id' } } }),
      };
    },
  });
  assert.equal(result.messageId, 'mock-id');
  assert.equal(request.url, 'https://sms.example.test/sms/send');
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get('api_id'), 'test-api-id');
  assert.equal(body.get('to'), '79991234567');
  assert.equal(body.get('ip'), '127.0.0.1');
  assert.equal(body.get('json'), '1');

  if (snapshot.enabled == null) delete process.env.SMS_AUTH_ENABLED; else process.env.SMS_AUTH_ENABLED = snapshot.enabled;
  if (snapshot.api == null) delete process.env.SMS_RU_API_ID; else process.env.SMS_RU_API_ID = snapshot.api;
  if (snapshot.base == null) delete process.env.SMS_RU_BASE_URL; else process.env.SMS_RU_BASE_URL = snapshot.base;
});

test('cookie mutations require an allowed origin', () => {
  const previous = process.env.PUBLIC_SITE_URL;
  process.env.PUBLIC_SITE_URL = 'https://flowie.example';
  const req = (origin) => ({
    method: 'POST',
    protocol: 'https',
    headers: { origin, host: 'flowie.example', cookie: `${SESSION_COOKIE}=opaque` },
    get: (name) => name === 'host' ? 'flowie.example' : undefined,
  });
  assert.equal(isSameOriginRequest(req('https://flowie.example')), true);
  assert.equal(isSameOriginRequest(req('https://evil.example')), false);
  assert.equal(isSameOriginRequest(req(undefined)), false);
  assert.equal(getSessionToken(req('https://flowie.example')), 'opaque');
  const corsOrigin = createCorsOriginCallback();
  corsOrigin('https://flowie.example', (error, allowed) => {
    assert.equal(error, null);
    assert.equal(allowed, true);
  });
  corsOrigin('https://evil.example', (error, allowed) => {
    assert.equal(error, null);
    assert.equal(allowed, false);
  });
  if (previous == null) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previous;
});

test('guest upgrade transfers owned commerce data without using an unverified phone', async () => {
  assert.equal(isGuestUser({ telegramId: null, verifiedPhone: null, staffRole: null, phone: '+79990000000' }), true);
  assert.equal(isGuestUser({ telegramId: null, verifiedPhone: '+79990000000', staffRole: null }), false);

  const calls = [];
  const model = (name) => ({
    updateMany: async ({ where, data }) => calls.push({ name, where, data }),
  });
  const tx = {
    order: model('order'),
    recipient: model('recipient'),
    address: model('address'),
    chat: model('chat'),
    promoCode: model('promoCode'),
    analyticsEvent: model('analyticsEvent'),
    referralOpen: model('referralOpen'),
  };
  await mergeGuestData(tx, 10, 20);
  assert.equal(calls.some((call) => call.name === 'order' && call.where.userId === 10 && call.data.userId === 20), true);
  assert.equal(calls.length, 7);
});
