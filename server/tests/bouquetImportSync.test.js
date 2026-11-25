'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createBouquetImportWorker } = require('../services/bouquetImportWorker');

const clock = new Date('2026-11-25T18:00:00.000Z');

function prismaDouble(row) {
  const recipes = [];
  let transactionTail = Promise.resolve();
  const batch = {
    async findUnique({ where }) { return where.id === row.id ? row : null; },
    async findFirst({ where }) {
      if (typeof where.status === 'string') return row.status === where.status ? row : null;
      if (where.status?.in) return where.status.in.includes(row.status) ? row : null;
      return null;
    },
    async findMany({ where }) { return row.status === where.status ? [row] : []; },
    async updateMany({ where, data }) {
      if (row.id !== where.id || row.status !== where.status) return { count: 0 };
      Object.assign(row, data, { updatedAt: clock }); return { count: 1 };
    },
    async update({ where, data }) {
      assert.equal(where.id, row.id); Object.assign(row, data, { updatedAt: clock }); return row;
    },
  };
  const prisma = {
    bouquetImportBatch: batch,
    bouquetRecipe: {
      async create({ data }) { const value = { id: `recipe-${recipes.length + 1}`, ...data }; recipes.push(value); return value; },
      async findMany() { return recipes; },
    },
    async $queryRawUnsafe() { return [{ locked: true }]; },
    async $executeRawUnsafe() { return 1; },
    async $transaction(callback) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(prisma); } finally { release(); }
    },
    recipes,
  };
  return prisma;
}

function queuedRow(count = 3) {
  return {
    id: 'sync-import', status: 'QUEUED', createdAt: new Date(clock.getTime() - 1000), updatedAt: new Date(clock.getTime() - 1000),
    state: {
      finalizeRequested: true,
      notes: [{ text: 'Original florist note' }],
      files: Array.from({ length: count }, (_, index) => ({ id: `photo-${index + 1}`, status: 'STORED', storageKey: `flowie-import/sync/${index + 1}.jpg` })),
    },
  };
}

async function images(count) {
  const values = [];
  for (let index = 0; index < count; index++) {
    values.push(await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 80 + index * 40, g: 30, b: 120 } } }).png().toBuffer());
  }
  return values;
}

function response(name) {
  return {
    id: `resp-${name}`,
    output_text: JSON.stringify({ draft_name: name, palette: ['pink'], likely_flowers: ['rose'], notes: 'Unconfirmed.' }),
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function groupingResponse() { return { output_text: JSON.stringify({ groups: [] }), usage: { input_tokens: 5, output_tokens: 2 } }; }

test('sync is the default, runs at concurrency two, and never calls batch submit', async () => {
  const row = queuedRow(3); const prisma = prismaDouble(row); const bytes = await images(3);
  let active = 0; let maximum = 0; let submitted = 0; const calls = [];
  const provider = {
    async respond({ body, idempotencyKey }) {
      if (body?.text?.format?.name === 'bouquet_visual_groups') return groupingResponse();
      active++; maximum = Math.max(maximum, active); calls.push({ body, idempotencyKey });
      await new Promise((resolve) => setTimeout(resolve, 5)); active--;
      return response(`Draft ${calls.length}`);
    },
    async submit() { submitted++; },
  };
  const worker = createBouquetImportWorker({
    prisma,
    storage: { get: async (key) => ({ buffer: bytes[Number(key.match(/(\d+)\.jpg$/)[1]) - 1] }) },
    provider,
    now: () => clock,
    telegramFetchImpl: async () => { throw new Error('not configured'); },
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(calls.length, 3);
  assert.equal(maximum, 2);
  assert.equal(submitted, 0);
  assert.ok(Object.values(row.state.syncResponses).every((item) => item.status === 'DONE'));
  assert.equal(JSON.stringify(row.state).includes('data:image'), false);
  assert.deepEqual(row.state.notes, [{ text: 'Original florist note' }]);
  assert.equal(prisma.recipes.length, 3);
});

test('seeded DONE, RUNNING, and UNCERTAIN responses are never charged again after restart', async () => {
  const row = queuedRow(3); const prisma = prismaDouble(row); const bytes = await images(3);
  row.state.syncResponses = {
    'bouquet-sync-import-1': { status: 'DONE', response: response('Recovered'), photoIds: ['photo-1'] },
    'bouquet-sync-import-2': { status: 'RUNNING', photoIds: ['photo-2'] },
    'bouquet-sync-import-3': { status: 'UNCERTAIN', photoIds: ['photo-3'] },
  };
  let responses = 0;
  const worker = createBouquetImportWorker({
    prisma, storage: { get: async (key) => ({ buffer: bytes[Number(key.match(/(\d+)\.jpg$/)[1]) - 1] }) },
    provider: { async respond() { responses++; return response('Unexpected'); } }, now: () => clock,
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'PARTIAL_REVIEW_REQUIRED');
  assert.equal(responses, 0);
  assert.equal(row.state.drafts.length, 1);
  assert.equal(row.state.syncResponses['bouquet-sync-import-2'].status, 'UNCERTAIN');
});

test('HTTP failures are FAILED, network ambiguity is UNCERTAIN, and neither is auto-retried', async () => {
  const row = queuedRow(2); const prisma = prismaDouble(row); const bytes = await images(2); let call = 0;
  const provider = { async respond() {
    call++;
    if (call === 1) throw Object.assign(new Error('bad request'), { status: 400 });
    throw new TypeError('socket closed');
  } };
  const worker = createBouquetImportWorker({
    prisma, storage: { get: async (key) => ({ buffer: bytes[Number(key.match(/(\d+)\.jpg$/)[1]) - 1] }) }, provider, now: () => clock,
    env: { FLOWIE_IMPORT_AI_CONCURRENCY: '3', BOUQUET_IMPORT_AI_BATCH_ENABLED: 'true' },
  });
  assert.equal((await worker.runOnce()).status, 'PARTIAL_REVIEW_REQUIRED');
  assert.deepEqual(Object.values(row.state.syncResponses).map((item) => item.status).sort(), ['FAILED', 'UNCERTAIN']);
  assert.equal(call, 2);
  assert.equal((await worker.runOnce()).status, 'IDLE');
  assert.equal(call, 2);
});

test('finalize gate prevents every provider request', async () => {
  const row = queuedRow(1); row.state.finalizeRequested = false;
  let calls = 0;
  const worker = createBouquetImportWorker({
    prisma: prismaDouble(row), storage: { get: async () => ({ buffer: Buffer.from('unused') }) },
    provider: { async respond() { calls++; } }, now: () => clock,
  });
  assert.equal((await worker.runOnce()).status, 'PREPARE_FAILED');
  assert.equal(calls, 0);
});

test('continuous intake processes each newly stored photo while keeping the import COLLECTING', async () => {
  const row = queuedRow(1); row.status = 'COLLECTING'; row.state.finalizeRequested = false;
  const prisma = prismaDouble(row); const bytes = await images(2); let calls = 0; let groupCalls = 0; const reads = new Map();
  const worker = createBouquetImportWorker({
    prisma,
    storage: { get: async (key) => { reads.set(key, (reads.get(key) || 0) + 1); return { buffer: bytes[Number(key.match(/(\d+)\.jpg$/)[1]) - 1] }; } },
    provider: { async respond({ body }) { if (body?.text?.format?.name === 'bouquet_visual_groups') { groupCalls++; return groupingResponse(); } calls++; row.state.notes.push({ text: `Concurrent note ${calls}` }); return response(`Auto ${calls}`); } },
    now: () => clock,
  });
  assert.equal((await worker.runOnce()).status, 'COLLECTING');
  assert.equal(row.status, 'COLLECTING');
  assert.equal(calls, 1);
  assert.equal(row.state.drafts.length, 1);
  assert.equal(prisma.recipes.length, 1);
  assert.deepEqual(row.state.syncKnownPhotoIds, ['photo-1']);
  assert.ok(row.state.notes.some((note) => note.text === 'Concurrent note 1'));

  row.state.files.push({ id: 'photo-2', status: 'STORED', storageKey: 'flowie-import/sync/2.jpg' });
  assert.equal((await worker.runOnce()).status, 'COLLECTING');
  assert.equal(calls, 2);
  assert.equal(row.state.drafts.length, 2);
  assert.equal(prisma.recipes.length, 2);
  assert.deepEqual(row.state.syncKnownPhotoIds, ['photo-1', 'photo-2']);
  assert.equal(reads.get('flowie-import/sync/1.jpg'), 2); // one classification + one bounded grouping representative read
  assert.equal(reads.get('flowie-import/sync/2.jpg'), 1);
  assert.equal(groupCalls, 1);
  await worker.groupImport(row.id);
  assert.equal(groupCalls, 1);
  assert.equal((await worker.runOnce()).status, 'IDLE');
});

test('a later-resolved earlier file cannot steal an existing result identity', async () => {
  const row = queuedRow(2); row.status = 'COLLECTING'; row.state.finalizeRequested = false;
  row.state.files[0].status = 'PENDING';
  const prisma = prismaDouble(row); const bytes = await images(2); const reads = []; let calls = 0;
  const worker = createBouquetImportWorker({
    prisma,
    storage: { get: async (key) => { reads.push(key); return { buffer: bytes[Number(key.match(/(\d+)\.jpg$/)[1]) - 1] }; } },
    provider: { async respond({ body }) { if (body?.text?.format?.name === 'bouquet_visual_groups') return groupingResponse(); calls++; return response(`Delayed ${calls}`); } }, now: () => clock,
  });
  await worker.runOnce();
  const firstCustomId = row.state.drafts[0].customId;
  assert.deepEqual(row.state.drafts[0].photoIds, ['photo-2']);
  row.state.files[0].status = 'STORED';
  await worker.runOnce();
  assert.equal(calls, 2);
  assert.equal(row.state.drafts.length, 2);
  assert.equal(row.state.drafts.find((draft) => draft.customId === firstCustomId).photoIds[0], 'photo-2');
  assert.equal(new Set(row.state.drafts.map((draft) => draft.customId)).size, 2);
  assert.deepEqual(reads, ['flowie-import/sync/2.jpg', 'flowie-import/sync/1.jpg', 'flowie-import/sync/2.jpg']);
});

test('an exact duplicate upload reuses the existing result and only expands photo membership', async () => {
  const row = queuedRow(1); row.status = 'COLLECTING'; row.state.finalizeRequested = false;
  const prisma = prismaDouble(row); const [bytes] = await images(1); let calls = 0;
  const worker = createBouquetImportWorker({
    prisma, storage: { get: async () => ({ buffer: bytes }) },
    provider: { async respond() { calls++; return response('Same bouquet'); } }, now: () => clock,
  });
  await worker.runOnce();
  row.state.files.push({ id: 'photo-duplicate', status: 'STORED', storageKey: 'flowie-import/sync/duplicate.jpg' });
  await worker.runOnce();
  assert.equal(calls, 1);
  assert.equal(row.state.drafts.length, 1);
  assert.deepEqual(row.state.drafts[0].photoIds, ['photo-1', 'photo-duplicate']);
  assert.equal(prisma.recipes.length, 1);
  assert.ok(row.state.syncKnownPhotoIds.includes('photo-duplicate'));
});

test('continuous preparation failure clears its lease without overwriting concurrent intake', async () => {
  const row = queuedRow(1); row.status = 'COLLECTING'; row.state.finalizeRequested = false;
  const prisma = prismaDouble(row);
  const worker = createBouquetImportWorker({
    prisma,
    storage: { get: async () => {
      row.state.files.push({ id: 'arrived-during-failure', status: 'PENDING', storageKey: 'flowie-import/sync/later.jpg' });
      row.state.notes.push({ text: 'Arrived during failure' });
      return { buffer: Buffer.from('not-an-image') };
    } },
    provider: { async respond() { throw new Error('must not run'); } }, now: () => clock,
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'COLLECTING');
  assert.equal(row.state.syncLease, undefined);
  assert.ok(row.state.files.some((file) => file.id === 'arrived-during-failure'));
  assert.ok(row.state.notes.some((note) => note.text === 'Arrived during failure'));
  assert.match(row.state.syncLastError, /Input buffer|unsupported image|decode/i);
});

