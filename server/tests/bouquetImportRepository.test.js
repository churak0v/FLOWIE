'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBouquetImportRepository,
  DEFAULT_STALE_PENDING_MS,
} = require('../services/bouquetImportRepository');

function createPrisma() {
  const state = { batches: [], updates: new Set(), locks: [], findManyArgs: [] };
  const bouquetImportBatch = {
    async findUnique({ where }) { return state.batches.find((row) => row.id === where.id) || null; },
    async findFirst({ where }) {
      return state.batches.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null;
    },
    async create({ data }) {
      const row = { id: `batch-${state.batches.length + 1}`, status: 'COLLECTING', createdAt: new Date(), ...data };
      state.batches.push(row);
      return row;
    },
    async update({ where, data }) {
      const row = state.batches.find((item) => item.id === where.id);
      Object.assign(row, data);
      return row;
    },
    async findMany(args) {
      state.findManyArgs.push(args);
      const wanted = args.where.state.array_contains[0].id;
      return state.batches
        .filter((row) => row.status === args.where.status && row.state.files.some((file) => file.id === wanted))
        .map((row) => ({ id: row.id }));
    },
  };
  const prisma = {
    state,
    bouquetImportBatch,
    bouquetImportUpdate: {
      async create({ data }) {
        if (state.updates.has(data.updateId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        state.updates.add(data.updateId);
        return data;
      },
      async deleteMany({ where }) {
        const deleted = state.updates.delete(where.updateId);
        return { count: deleted ? 1 : 0 };
      },
    },
    async $executeRaw(strings, ...values) {
      state.locks.push({ sql: strings.join('?'), values });
      return 1;
    },
    async $transaction(callback) { return callback(prisma); },
  };
  return prisma;
}

const clock = new Date('2026-11-25T12:00:00.000Z');

test('claims Telegram updates once using the unique update row', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma);
  assert.equal(await repository.claimUpdate({ updateId: 42 }), true);
  assert.equal(await repository.claimUpdate({ updateId: 42 }), false);
  await repository.releaseUpdate(42);
  assert.equal(await repository.claimUpdate({ updateId: 42 }), true);
  assert.deepEqual([...prisma.state.updates], ['42']);
});

test('serializes batch creation and JSON mutations with advisory transaction locks', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7, startedAt: clock });
  const same = await repository.createImport({ chatId: -100, userId: 7, startedAt: clock });
  assert.equal(same.id, batch.id);

  const file = await repository.reserveFile({
    importId: batch.id, messageId: 10, fileId: 'tg-file', fileUniqueId: 'unique',
    storageKey: 'flowie-import/batch-1/unique.jpg', createdAt: clock,
  });
  assert.equal(file.status, 'PENDING');
  assert.equal(file.pendingAt, clock.toISOString());
  assert.equal(prisma.state.locks.length, 3);
  assert.ok(prisma.state.locks.every((entry) => entry.sql.includes('pg_advisory_xact_lock')));
});

test('deduplicates both Telegram file identity and message identity', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  await repository.reserveFile({ importId: batch.id, messageId: 10, fileUniqueId: 'one', createdAt: clock });
  assert.equal(await repository.reserveFile({ importId: batch.id, messageId: 11, fileUniqueId: 'one', createdAt: clock }), null);
  assert.equal(await repository.reserveFile({ importId: batch.id, messageId: 10, fileUniqueId: 'two', createdAt: clock }), null);
  assert.equal(batch.state.files.length, 1);
});

test('uses Prisma JSONB array_contains lookup and completes a reserved file', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  const file = await repository.reserveFile({ importId: batch.id, messageId: 10, fileUniqueId: 'one', createdAt: clock });
  const storedAt = new Date('2026-11-25T12:01:00.000Z');
  await repository.markFileStored({ fileId: file.id, storageKey: 'flowie-import/batch-1/one.jpg', storedAt });

  assert.deepEqual(prisma.state.findManyArgs[0].where.state, {
    path: ['files'], array_contains: [{ id: file.id }],
  });
  assert.equal(file.status, 'STORED');
  assert.equal(file.storedAt, storedAt.toISOString());
});

test('represents a referenced media group as one unambiguous attachment target', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  await repository.reserveFile({ importId: batch.id, messageId: 10, mediaGroupId: 'album', fileUniqueId: 'one', createdAt: clock });
  await repository.reserveFile({ importId: batch.id, messageId: 11, mediaGroupId: 'album', fileUniqueId: 'two', createdAt: clock });
  assert.deepEqual(await repository.findAttachmentTargets({
    importId: batch.id, messageId: 10, mediaGroupId: 'album',
  }), [{ id: 'media-group:album' }]);
});

test('finalize is idempotent and analysis is claimed only after every file is stored', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  const file = await repository.reserveFile({ importId: batch.id, messageId: 10, fileUniqueId: 'one', createdAt: clock });
  await repository.requestFinalize({ importId: batch.id, requestedAt: clock });
  await repository.requestFinalize({ importId: batch.id, requestedAt: new Date(clock.getTime() + 1000) });
  assert.equal(batch.state.finalizeRequestedAt, clock.toISOString());
  assert.deepEqual(await repository.getFinalizeState(batch.id), { finalizeRequested: true, unresolvedFiles: 1, settled: false, schedulerRequired: true });
  assert.equal(await repository.claimAnalysis(batch.id), false);

  await repository.markFileStored({ fileId: file.id, storageKey: file.storageKey, storedAt: clock });
  assert.equal(await repository.claimAnalysis(batch.id), false);
  const settledRepository = createBouquetImportRepository(prisma, { now: () => new Date(clock.getTime() + 15000) });
  assert.equal(await settledRepository.claimAnalysis(batch.id), true);
  assert.equal(await repository.claimAnalysis(batch.id), false);
  assert.equal(batch.status, 'QUEUED');
});

test('accepts delayed pre-confirmation photos and deduplicates retries after finish', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  await repository.requestFinalize({ importId: batch.id, requestedAt: clock });
  const photo = { importId: batch.id, messageId: 10, fileUniqueId: 'delayed', createdAt: clock,
    sentAt: new Date(clock.getTime() - 1000).toISOString() };
  assert.ok(await repository.reserveFile(photo));
  assert.equal(await repository.reserveFile(photo), null);
  await assert.rejects(repository.reserveFile({ ...photo, messageId: 11, fileUniqueId: 'new',
    sentAt: new Date(clock.getTime() + 1000).toISOString() }), /IMPORT_ALREADY_FINALIZED/);
});

test('bottom confirmation cannot finalize a stale prompt after new photos arrive', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  await repository.reserveFile({ importId: batch.id, messageId: 1, fileUniqueId: 'first', createdAt: clock });
  batch.state.confirmationPrompt = { status: 'SENT', revision: 1 };
  await repository.reserveFile({ importId: batch.id, messageId: 2, fileUniqueId: 'second', createdAt: clock });
  await assert.rejects(repository.requestFinalize({ importId: batch.id, requirePrompt: true }), /IMPORT_CONFIRMATION_STALE/);
  assert.equal(batch.state.finalizeRequested, false);
  batch.state.confirmationPrompt = { status: 'SENT', revision: 2 };
  await repository.requestFinalize({ importId: batch.id, requirePrompt: true });
  assert.equal(batch.state.finalizeRequested, true);
});

test('explicit retry reclaims failed and stale PENDING files after a process crash', async () => {
  const prisma = createPrisma();
  const repository = createBouquetImportRepository(prisma, { now: () => clock });
  const batch = await repository.createImport({ chatId: -100, userId: 7 });
  batch.state.files.push(
    { id: 'failed', status: 'FAILED', error: 'network', failedAt: '2026-11-25T11:59:00.000Z' },
    { id: 'stale', status: 'PENDING', pendingAt: new Date(clock.getTime() - DEFAULT_STALE_PENDING_MS - 1).toISOString() },
    { id: 'fresh', status: 'PENDING', pendingAt: new Date(clock.getTime() - 1000).toISOString() },
  );
  const claimed = await repository.claimFailedFiles(batch.id);
  assert.deepEqual(claimed.map((file) => file.id), ['failed', 'stale']);
  assert.ok(claimed.every((file) => file.status === 'PENDING' && file.pendingAt === clock.toISOString()));
  assert.equal(batch.state.files.find((file) => file.id === 'fresh').pendingAt, '2026-11-25T11:59:59.000Z');
});
