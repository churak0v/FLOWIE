'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBouquetImportNotifications, _test } = require('../services/bouquetImportNotifications');

function fixture({ status = 'REVIEW_REQUIRED', fetchImpl, now } = {}) {
  const state = {
    row: {
      id: 'batch-1', chatId: '-100777', userId: '1780687976', status,
      state: { drafts: [{}, {}, {}], reviewCursor: 2, notes: [{ text: 'private note' }] },
    },
    queries: [], sends: [], updates: [],
  };
  const tx = {
    $executeRawUnsafe: async (...args) => { state.queries.push(args); return 1; },
    bouquetImportBatch: {
      findUnique: async ({ where }) => where.id === state.row.id ? structuredClone(state.row) : null,
      update: async ({ data }) => {
        state.row.state = structuredClone(data.state);
        state.updates.push(structuredClone(data.state));
        return structuredClone(state.row);
      },
    },
  };
  let transactionQueue = Promise.resolve();
  const prisma = {
    $queryRawUnsafe: async (query) => {
      state.queries.push([query]);
      return [{ id: state.row.id }];
    },
    $transaction(fn) {
      const result = transactionQueue.then(() => fn(tx));
      transactionQueue = result.catch(() => undefined);
      return result;
    },
  };
  const defaultFetch = async (_url, options) => {
    state.sends.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  };
  const service = createBouquetImportNotifications({
    prisma,
    env: { TELEGRAM_ORDER_BOT_TOKEN: 'secret-token', TELEGRAM_ORDER_API_BASE: 'https://telegram.test' },
    fetchImpl: fetchImpl || defaultFetch,
    now: now || (() => new Date('2026-11-25T12:00:00.000Z')),
  });
  return { service, state, defaultFetch };
}

test('ready notification targets the owning batch chat and preserves concurrent review state', async () => {
  const { service, state } = fixture();
  const result = await service.runOnce();
  assert.deepEqual(result, { status: 'SENT', id: 'batch-1' });
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].chat_id, '-100777');
  assert.match(state.sends[0].text, /Готово черновиков: 3/);
  assert.match(state.sends[0].text, /\/review/);
  assert.equal(JSON.stringify(state.sends).includes('private note'), false);
  assert.equal(state.row.state.reviewCursor, 2);
  assert.equal(state.row.state.reviewNotification.status, 'SENT');
  assert.match(state.queries[0][0], /reviewNotification,status/);
  assert.match(state.queries[0][0], /LIMIT 25/);
});

test('concurrent runs atomically claim a batch and send only one notification', async () => {
  const { service, state } = fixture();
  const [first, second] = await Promise.all([service.runOnce(), service.runOnce()]);
  assert.equal(state.sends.length, 1);
  assert.deepEqual(new Set([first.status, second.status]), new Set(['SENT', 'IDLE']));
  assert.equal(state.row.state.reviewNotification.status, 'SENT');
});

test('send failure becomes a bounded retry and succeeds only after nextAttemptAt', async () => {
  let current = new Date('2026-11-25T12:00:00.000Z');
  let attempts = 0;
  let fixtureRef;
  const fetchImpl = async (url, options) => {
    attempts += 1;
    if (attempts === 1) return new Response('{}', { status: 503 });
    return fixtureRef.defaultFetch(url, options);
  };
  fixtureRef = fixture({ fetchImpl, now: () => new Date(current) });
  const { service, state } = fixtureRef;

  const failed = await service.runOnce();
  assert.deepEqual(failed, { status: 'RETRY', id: 'batch-1', backoffMs: 15000 });
  assert.equal(state.row.state.reviewNotification.status, 'RETRY');
  assert.equal(state.row.state.reviewNotification.nextAttemptAt, '2026-11-25T12:00:15.000Z');
  assert.equal(state.row.state.reviewCursor, 2);

  assert.equal((await service.runOnce()).status, 'IDLE');
  assert.equal(attempts, 1);
  current = new Date('2026-11-25T12:00:15.000Z');
  assert.equal((await service.runOnce()).status, 'SENT');
  assert.equal(attempts, 2);
});

test('terminal failure notification is generic and excludes provider errors, photos, and secrets', async () => {
  const { service, state } = fixture({ status: 'PROVIDER_FAILED' });
  state.row.state.aiBatch = {
    pollError: 'provider secret internal failure',
    outputFileId: 'file-private',
  };
  state.row.state.files = [{ storageKey: 'private/photo.jpg' }];
  await service.runOnce();
  const serialized = JSON.stringify(state.sends);
  assert.match(state.sends[0].text, /Не удалось завершить разбор/);
  assert.equal(serialized.includes('provider secret'), false);
  assert.equal(serialized.includes('file-private'), false);
  assert.equal(serialized.includes('private/photo.jpg'), false);
  assert.equal(serialized.includes('secret-token'), false);
});

test('SENT rows are rejected on reread even if a stale candidate id is returned', async () => {
  const { service, state } = fixture();
  state.row.state.reviewNotification = { status: 'SENT', sentAt: '2026-11-25T11:00:00.000Z' };
  assert.deepEqual(await service.runOnce(), { status: 'IDLE' });
  assert.equal(state.sends.length, 0);
  assert.equal(state.updates.length, 0);
});

test('expired and cancelled provider batches are terminal notification candidates', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');
  for (const status of ['PROVIDER_EXPIRED', 'PROVIDER_CANCELLED']) {
    assert.equal(_test.eligible({ status, state: {} }, now, 120000), true);
  }
});
