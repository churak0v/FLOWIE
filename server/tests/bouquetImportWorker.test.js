'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { confirmedLinesFor, createBouquetImportWorker, parseBatchOutput } = require('../services/bouquetImportWorker');

const clock = new Date('2026-11-25T15:00:00.000Z');

function fakePrisma(rows) {
  const recipes = [];
  function matchesStatus(row, where) {
    if (!where?.status) return true;
    return typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status);
  }
  const bouquetImportBatch = {
    async findFirst({ where }) { return rows.filter((row) => matchesStatus(row, where))[0] || null; },
    async findUnique({ where }) { return rows.find((row) => row.id === where.id) || null; },
    async updateMany({ where, data }) {
      const row = rows.find((item) => item.id === where.id && item.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: clock });
      return { count: 1 };
    },
    async update({ where, data }) {
      const row = rows.find((item) => item.id === where.id);
      Object.assign(row, data, { updatedAt: clock });
      return row;
    },
  };
  const prisma = {
    bouquetImportBatch,
    bouquetRecipe: {
      async create({ data }) { const row = { id: `recipe-${recipes.length + 1}`, ...data }; recipes.push(row); return row; },
    },
    async $queryRawUnsafe() { return [{ locked: true }]; },
    async $executeRawUnsafe() { return 1; },
    async $transaction(callback) { return callback(prisma); },
    recipes,
  };
  return prisma;
}

function batchRow(status = 'QUEUED') {
  return {
    id: 'import-1', status, createdAt: new Date(clock.getTime() - 10_000), updatedAt: new Date(clock.getTime() - 10_000),
    state: {
      finalizeRequested: true,
      notes: [{ text: 'Confirmed text stays exact.', targetId: null }],
      files: [
        { id: 'photo-1', status: 'STORED', storageKey: 'flowie-import/import-1/a.jpg' },
        { id: 'photo-2', status: 'STORED', storageKey: 'flowie-import/import-1/b.jpg' },
      ],
    },
  };
}

async function image() {
  return sharp({ create: { width: 12, height: 12, channels: 3, background: '#ee8899' } }).png().toBuffer();
}

test('promotes settled finalized uploads only after the Telegram backlog drains', async () => {
  const row = batchRow('COLLECTING');
  row.state.finalizeRequestedAt = new Date(clock.getTime() - 30000).toISOString();
  row.state.files.forEach((file) => { file.storedAt = new Date(clock.getTime() - 20000).toISOString(); });
  let pending = 8;
  const bytes = await image();
  const worker = createBouquetImportWorker({ prisma: fakePrisma([row]), storage: { get: async () => ({ buffer: bytes }) },
    provider: {}, now: () => clock, env: { FLOWIE_IMPORT_AI_MODE: 'batch', TELEGRAM_ORDER_BOT_TOKEN: 'test', TELEGRAM_ORDER_API_BASE: 'https://telegram.test' },
    telegramFetchImpl: async () => Response.json({ ok: true, result: { pending_update_count: pending } }),
  });
  assert.equal((await worker.runOnce()).status, 'IDLE');
  assert.equal(row.status, 'COLLECTING');
  pending = 0;
  assert.equal((await worker.runOnce()).status, 'PREPARED');
});

test('atomically prepares a finalized queue row, deduplicates originals, and stores no base64', async () => {
  const row = batchRow();
  const prisma = fakePrisma([row]);
  const bytes = await image();
  const storage = { get: async () => ({ buffer: bytes }) };
  let submitted = 0;
  const worker = createBouquetImportWorker({ prisma, storage, provider: { submit: async () => { submitted++; } }, env: { FLOWIE_IMPORT_AI_MODE: 'batch' }, now: () => clock });
  assert.deepEqual(await worker.runOnce(), { status: 'PREPARED', id: 'import-1' });
  assert.equal(row.status, 'PREPARED');
  assert.equal(row.state.aiBatch.requestCount, 1);
  assert.deepEqual(row.state.aiBatch.manifest[0].photoIds, ['photo-1', 'photo-2']);
  assert.equal(JSON.stringify(row.state).includes('base64'), false);
  assert.equal(submitted, 0);
  assert.deepEqual(row.state.notes, [{ text: 'Confirmed text stays exact.', targetId: null }]);
});

test('submits only when explicitly enabled and persists provider ids', async () => {
  const row = batchRow();
  const prisma = fakePrisma([row]);
  const bytes = await image();
  const storage = { get: async () => ({ buffer: bytes }) };
  const calls = [];
  const worker = createBouquetImportWorker({
    prisma, storage, env: { FLOWIE_IMPORT_AI_MODE: 'batch', BOUQUET_IMPORT_AI_BATCH_ENABLED: 'true' }, now: () => clock,
    provider: { submit: async (value) => { calls.push(value); return { providerFileId: 'file-1', providerBatchId: 'batch-1' }; } },
  });
  await worker.runOnce();
  const result = await worker.runOnce();
  assert.equal(result.status, 'WAITING_PROVIDER');
  assert.equal(calls.length, 1);
  assert.equal(row.state.aiBatch.providerBatchId, 'batch-1');
  assert.equal(row.state.aiBatch.submissionState, 'SUBMITTED');
});

test('a stale SUBMITTING row becomes UNCERTAIN and is never resubmitted', async () => {
  const row = batchRow('SUBMITTING');
  row.updatedAt = new Date(clock.getTime() - 2_000_000);
  row.state.aiBatch = { submissionState: 'SUBMITTING' };
  let submitted = 0;
  const worker = createBouquetImportWorker({
    prisma: fakePrisma([row]), storage: {}, now: () => clock,
    env: { FLOWIE_IMPORT_AI_MODE: 'batch', BOUQUET_IMPORT_AI_BATCH_ENABLED: 'true' },
    provider: { submit: async () => { submitted++; } },
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'UNCERTAIN');
  assert.equal(row.status, 'UNCERTAIN');
  assert.equal(row.state.aiBatch.submissionState, 'UNCERTAIN');
  assert.equal(submitted, 0);
  assert.equal((await worker.runOnce()).status, 'IDLE');
});

test('preparation failure is explicit and is not silently retried', async () => {
  const row = batchRow();
  const worker = createBouquetImportWorker({
    prisma: fakePrisma([row]),
    storage: { get: async () => { throw new Error('private object unavailable'); } },
    provider: {},
    env: { FLOWIE_IMPORT_AI_MODE: 'batch' },
    now: () => clock,
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'PREPARE_FAILED');
  assert.equal(row.status, 'PREPARE_FAILED');
  assert.match(row.state.aiBatch.prepareError, /private object unavailable/);
  assert.equal((await worker.runOnce()).status, 'IDLE');
});

test('recovers interrupted polling promptly without waiting for the image preparation lease', async () => {
  const row = batchRow('POLLING');
  row.updatedAt = new Date(clock.getTime() - 100000);
  const worker = createBouquetImportWorker({ prisma: fakePrisma([row]), storage: {}, provider: {}, now: () => clock });
  assert.equal((await worker.runOnce()).status, 'WAITING_PROVIDER');
  assert.equal(row.status, 'WAITING_PROVIDER');
});

test('completed partial output persists successful drafts and empty recipe lines without human confirmation', async () => {
  const row = batchRow('WAITING_PROVIDER');
  row.state.aiBatch = {
    providerBatchId: 'batch-1',
    manifest: [
      { customId: 'c1', photoIds: ['photo-1'], originalSha256: 'a' },
      { customId: 'c2', photoIds: ['photo-2'], originalSha256: 'b' },
    ],
  };
  const prisma = fakePrisma([row]);
  const output = JSON.stringify({
    custom_id: 'c1',
    response: { status_code: 200, body: { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ draft_name: 'Pink', palette: ['pink'], likely_flowers: ['rose'], notes: 'Possible rose.' }) }] }] } },
  }) + '\n' + JSON.stringify({ custom_id: 'c2', error: { code: 'failed' } }) + '\n';
  const worker = createBouquetImportWorker({
    prisma, storage: {}, now: () => clock, env: { FLOWIE_IMPORT_AI_MODE: 'batch' },
    provider: {
      retrieve: async () => ({ status: 'completed', output_file_id: 'out-1', request_counts: { total: 2, completed: 1, failed: 1 } }),
      downloadOutput: async () => output,
    },
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'PARTIAL_REVIEW_REQUIRED');
  assert.equal(row.state.drafts.length, 1);
  assert.equal(row.state.drafts[0].needsComposition, true);
  assert.deepEqual(prisma.recipes[0].lines, []);
  assert.deepEqual(row.state.notes, [{ text: 'Confirmed text stays exact.', targetId: null }]);
});

test('only explicitly human-confirmed structured composition becomes recipe lines', () => {
  const manifest = [{ customId: 'c1', photoIds: ['p1'] }];
  const output = JSON.stringify({ custom_id: 'c1', response: { status_code: 200, body: { output_text: JSON.stringify({ draft_name: 'Draft', palette: [], likely_flowers: [], notes: '' }) } } });
  assert.equal(parseBatchOutput(output, manifest).complete, true);
  const line = { ingredientId: 'rose-red', name: 'Rose', quantity: 7, unit: 'stem' };
  assert.deepEqual(confirmedLinesFor({
    confirmedCompositions: [{ source: 'AI', status: 'CONFIRMED', photoIds: ['p1'], lines: [line] }],
  }, ['p1']), []);
  assert.deepEqual(confirmedLinesFor({
    confirmedCompositions: [{ source: 'HUMAN', status: 'CONFIRMED', photoIds: ['p1'], lines: [line] }],
  }, ['p1']), [line]);
});
