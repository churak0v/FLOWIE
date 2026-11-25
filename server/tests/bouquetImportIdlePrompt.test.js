'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBouquetImportIdlePrompt } = require('../services/bouquetImportIdlePrompt');

function fixture({ fetchImpl, now } = {}) {
  const state = { sends: [], queries: [], updates: [], row: {
    id: 'batch-1', chatId: '-100', status: 'COLLECTING', createdAt: new Date('2026-11-25T11:00:00Z'),
    state: { intakeRevision: 1, intakeLastActivityAt: '2026-11-25T11:59:00.000Z', finalizeRequested: false,
      files: [{ id: 'p1', status: 'STORED', storedAt: '2026-11-25T11:59:00.000Z' }] },
  } };
  const tx = {
    $executeRawUnsafe: async (...args) => { state.queries.push(args); return 1; },
    bouquetImportBatch: {
      findUnique: async () => structuredClone(state.row),
      update: async ({ data }) => { state.row.state = structuredClone(data.state); state.updates.push(structuredClone(data.state)); return state.row; },
    },
  };
  let queue = Promise.resolve();
  const prisma = {
    $queryRawUnsafe: async (query) => { state.queries.push([query]); return [{ id: state.row.id }]; },
    $transaction(fn) { const result = queue.then(() => fn(tx)); queue = result.catch(() => undefined); return result; },
    bouquetImportBatch: { findUnique: async () => structuredClone(state.row) },
  };
  const defaultFetch = async (url, options) => {
    const method = url.split('/').pop();
    const payload = JSON.parse(options.body);
    if (method === 'getWebhookInfo') return new Response(JSON.stringify({ ok: true, result: { pending_update_count: 0 } }));
    state.sends.push(payload);
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  const service = createBouquetImportIdlePrompt({ prisma,
    env: { TELEGRAM_ORDER_BOT_TOKEN: 'test-token', TELEGRAM_ORDER_API_BASE: 'https://telegram.test' },
    fetchImpl: fetchImpl || defaultFetch, now: now || (() => new Date('2026-11-25T12:00:00Z')) });
  return { service, state, defaultFetch };
}

test('asks after the idle pause with a persistent confirmation reply keyboard', async () => {
  const { service, state } = fixture();
  assert.deepEqual(await service.runOnce(), { status: 'SENT', id: 'batch-1' });
  assert.equal(state.sends[0].chat_id, '-100');
  assert.match(state.sends[0].text, /Все фото загружены/);
  assert.deepEqual(state.sends[0].reply_markup.keyboard[0].map((item) => item.text), ['Все фото загружены', 'Добавлю ещё']);
  assert.equal(state.sends[0].reply_markup.is_persistent, true);
  assert.equal(state.row.state.confirmationPrompt.status, 'SENT');
  assert.equal(state.row.state.confirmationPrompt.revision, 1);
});

test('does not ask before idle timeout or while Telegram webhook backlog exists', async () => {
  let current = new Date('2026-11-25T11:59:59Z');
  let fixtureRef;
  const fetchImpl = async (url) => {
    if (url.endsWith('/getWebhookInfo')) return new Response(JSON.stringify({ ok: true, result: { pending_update_count: 3 } }));
    throw new Error('sendMessage must not be called');
  };
  fixtureRef = fixture({ fetchImpl, now: () => new Date(current) });
  assert.equal((await fixtureRef.service.runOnce()).status, 'IDLE');
  current = new Date('2026-11-25T12:00:00Z');
  assert.equal((await fixtureRef.service.runOnce()).status, 'BACKLOG');
  assert.equal(fixtureRef.state.row.state.confirmationPrompt.status, 'RETRY');
  assert.equal(fixtureRef.state.sends.length, 0);
});

test('new intake revision invalidates an in-flight prompt before send', async () => {
  let fixtureRef;
  const fetchImpl = async (url) => {
    if (url.endsWith('/getWebhookInfo')) {
      fixtureRef.state.row.state.intakeRevision = 2;
      fixtureRef.state.row.state.intakeLastActivityAt = '2026-11-25T12:00:00Z';
      delete fixtureRef.state.row.state.confirmationPrompt;
      return new Response(JSON.stringify({ ok: true, result: { pending_update_count: 0 } }));
    }
    throw new Error('stale prompt must not send');
  };
  fixtureRef = fixture({ fetchImpl });
  assert.deepEqual(await fixtureRef.service.runOnce(), { status: 'STALE', id: 'batch-1' });
  assert.equal(fixtureRef.state.sends.length, 0);
  assert.equal(fixtureRef.state.row.state.confirmationPrompt, undefined);
});

test('one prompt is sent per revision and a later photo permits a new prompt', async () => {
  const { service, state } = fixture();
  await service.runOnce();
  assert.equal((await service.runOnce()).status, 'IDLE');
  assert.equal(state.sends.length, 1);
  state.row.state.intakeRevision = 2;
  state.row.state.intakeLastActivityAt = '2026-11-25T11:58:00Z';
  state.row.state.files.push({ id: 'p2', status: 'STORED', storedAt: '2026-11-25T11:58:00Z' });
  delete state.row.state.confirmationPrompt;
  assert.equal((await service.runOnce()).status, 'SENT');
  assert.equal(state.sends.length, 2);
  assert.equal(state.row.state.confirmationPrompt.revision, 2);
  assert.equal(state.row.state.confirmationPrompt.count, 2);
});

test('concurrent scans do not duplicate a prompt', async () => {
  const { service, state } = fixture();
  const results = await Promise.all([service.runOnce(), service.runOnce()]);
  assert.equal(state.sends.length, 1);
  assert.deepEqual(new Set(results.map((item) => item.status)), new Set(['SENT', 'IDLE']));
});

test('failed send is retried with backoff while preserving latest batch JSON', async () => {
  let attempts = 0; let current = new Date('2026-11-25T12:00:00Z'); let fixtureRef;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/getWebhookInfo')) return new Response(JSON.stringify({ ok: true, result: { pending_update_count: 0 } }));
    attempts += 1;
    if (attempts === 1) return new Response('{}', { status: 503 });
    return fixtureRef.defaultFetch(url, options);
  };
  fixtureRef = fixture({ fetchImpl, now: () => new Date(current) });
  fixtureRef.state.row.state.reviewCursor = 4;
  assert.equal((await fixtureRef.service.runOnce()).status, 'RETRY');
  assert.equal(fixtureRef.state.row.state.confirmationPrompt.nextAttemptAt, '2026-11-25T12:00:15.000Z');
  assert.equal(fixtureRef.state.row.state.reviewCursor, 4);
  assert.equal((await fixtureRef.service.runOnce()).status, 'IDLE');
  current = new Date('2026-11-25T12:00:15Z');
  assert.equal((await fixtureRef.service.runOnce()).status, 'SENT');
  assert.equal(fixtureRef.state.row.state.reviewCursor, 4);
});
