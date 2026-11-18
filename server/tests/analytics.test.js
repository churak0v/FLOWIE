const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  AnalyticsValidationError,
  createRateLimiter,
  normalizeClientEvent,
  redactSearchQuery,
  recordServerEventSafe,
} = require('../services/analytics');
const eventsRouter = require('../routes/events');

const EVENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SESSION_ID = 'session_12345678';

function payload(overrides = {}) {
  return {
    event: 'page_view',
    eventId: EVENT_ID,
    sessionId: SESSION_ID,
    meta: { path: '/catalog?secret=discarded' },
    ...overrides,
  };
}

test('client event normalization keeps only allowlisted, bounded attribution', () => {
  const normalized = normalizeClientEvent(payload({
    meta: {
      path: 'https://flowie.test/catalog?q=private#fragment',
      utm_source: 'telegram',
      utm_medium: 'bot',
      utm_campaign: 'november',
      referrerHost: 'https://t.me/something/private',
    },
  }));
  assert.equal(normalized.event, 'page_view');
  assert.equal(normalized.meta.sessionId, SESSION_ID);
  assert.equal(normalized.meta.path, '/catalog');
  assert.equal(normalized.meta.referrerHost, 't.me');
  assert.equal(normalized.meta.utm_source, 'telegram');
  assert.equal(JSON.stringify(normalized).includes('private'), false);
});
test('search queries redact email and phone-like personal data', () => {
  const result = redactSearchQuery('букет для user@example.com +7 (999) 123-45-67 на юбилей');
  assert.equal(result.includes('user@example.com'), false);
  assert.equal(result.includes('999'), false);
  assert.match(result, /\[email\]/);
  assert.match(result, /\[phone\]/);

  const normalized = normalizeClientEvent(payload({
    event: 'search',
    meta: { query: 'роза user@example.com', resultCount: 4 },
  }));
  assert.equal(normalized.meta.query, 'роза [email]');
  assert.equal(normalized.meta.resultCount, 4);
});

test('unknown events, fields, metadata and client trusted markers are rejected', () => {
  for (const value of [
    payload({ event: 'order_created' }),
    { ...payload(), phone: '+79990000000' },
    payload({ meta: { address: 'Невский, 10' } }),
    payload({ meta: { source: 'server' } }),
  ]) {
    assert.throws(() => normalizeClientEvent(value), AnalyticsValidationError);
  }
});

test('eventId and sessionId are mandatory and commerce identifiers are positive integers', () => {
  assert.throws(() => normalizeClientEvent(payload({ eventId: undefined })), (error) => error.code === 'BAD_EVENT_ID');
  assert.throws(() => normalizeClientEvent(payload({ sessionId: undefined })), (error) => error.code === 'BAD_SESSION_ID');
  assert.throws(
    () => normalizeClientEvent(payload({ event: 'cart_add', productId: null, meta: { quantity: 1 } })),
    (error) => error.code === 'PRODUCT_ID_REQUIRED',
  );
  assert.throws(() => normalizeClientEvent(payload({ orderId: -1 })), (error) => error.code === 'BAD_ORDER_ID');
});

test('legacy referral input is minimized without retaining raw href or trusted source', () => {
  const normalized = normalizeClientEvent(payload({
    event: 'ref_open',
    meta: {
      tag: 'Creator Demo',
      source: 'startapp',
      href: 'https://flowie.test/catalog?utm_source=tg&token=secret&phone=79991234567',
    },
  }));
  assert.deepEqual(normalized.meta, {
    sessionId: SESSION_ID,
    path: '/catalog',
    utm_source: 'tg',
    tag: 'creator_demo',
    referralSource: 'startapp',
  });
  assert.equal(normalized.meta.href, undefined);
  assert.equal(normalized.meta.source, undefined);
});

test('rate limiter enforces a fixed window and returns retry timing', () => {
  let time = 1_000;
  const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => time });
  assert.equal(limiter.consume('ip:session').allowed, true);
  assert.equal(limiter.consume('ip:session').allowed, true);
  assert.deepEqual(limiter.consume('ip:session'), { allowed: false, retryAfter: 1 });
  time = 2_001;
  assert.equal(limiter.consume('ip:session').allowed, true);
});

test('server events have a trusted marker, deterministic dedup key and never throw on analytics failure', async () => {
  const writes = [];
  const prisma = {
    analyticsEvent: {
      create: async ({ data }) => {
        writes.push(data);
        if (writes.length > 1) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      },
    },
  };
  const first = await recordServerEventSafe(prisma, { event: 'order_created', userId: 7, orderId: 41 });
  const duplicate = await recordServerEventSafe(prisma, { event: 'order_created', userId: 7, orderId: 41 });
  assert.deepEqual(first, { recorded: true, duplicate: false });
  assert.deepEqual(duplicate, { recorded: true, duplicate: true });
  assert.equal(writes[0].eventId, 'server:order_created:41');
  assert.deepEqual(writes[0].meta, { source: 'server' });

  const failed = await recordServerEventSafe({ analyticsEvent: { create: async () => { throw new Error('db down'); } } }, {
    event: 'payment_success',
    userId: 7,
    orderId: 41,
  });
  assert.deepEqual(failed, { recorded: false, error: 'ANALYTICS_WRITE_FAILED' });
});

function createPrisma({ staff = false } = {}) {
  const state = { events: [], referralOpens: [], userUpserts: 0 };
  const client = {
    user: {
      findUnique: async ({ where }) => ({
        id: where.id || 7,
        telegramId: '700',
        staffRole: staff ? 'ADMIN' : null,
        staffActive: staff,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    analyticsEvent: {
      create: async ({ data }) => {
        if (state.events.some((item) => item.eventId === data.eventId)) {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }
        state.events.push(data);
        return data;
      },
    },
    referralLink: {
      upsert: async ({ where }) => ({ id: 9, tag: where.tag }),
    },
    referralOpen: {
      create: async ({ data }) => {
        state.referralOpens.push(data);
        return data;
      },
    },
  };
  client.$transaction = async (fn) => fn(client);
  return { client, state };
}

function unlimited() {
  return { consume: () => ({ allowed: true, retryAfter: 0 }) };
}

async function withServer(prisma, { user = { id: 7 } } = {}, run) {
  eventsRouter._test.setPrisma(prisma);
  eventsRouter._test.setRateLimiters({ ip: unlimited(), session: unlimited() });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/events', eventsRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const previous = process.env.PUBLIC_SITE_URL;
    process.env.PUBLIC_SITE_URL = base;
    try {
      await run(base);
    } finally {
      if (previous == null) delete process.env.PUBLIC_SITE_URL;
      else process.env.PUBLIC_SITE_URL = previous;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(base, body) {
  const response = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('ingestion deduplicates eventId and does not create users', async () => {
  const { client, state } = createPrisma();
  await withServer(client, {}, async (base) => {
    const first = await post(base, payload());
    const duplicate = await post(base, payload());
    assert.equal(first.status, 202);
    assert.equal(first.body.duplicate, false);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.duplicate, true);
  });
  assert.equal(state.events.length, 1);
  assert.equal(state.userUpserts, 0);
});

test('identified staff client analytics is skipped', async () => {
  const { client, state } = createPrisma({ staff: true });
  await withServer(client, {}, async (base) => {
    const result = await post(base, payload());
    assert.equal(result.status, 200);
    assert.equal(result.body.skipped, 'STAFF');
  });
  assert.equal(state.events.length, 0);
});

test('anonymous events require an allowed Origin', async () => {
  const { client, state } = createPrisma();
  await withServer(client, { user: null }, async (base) => {
    const response = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 403);
  });
  assert.equal(state.events.length, 0);
});
