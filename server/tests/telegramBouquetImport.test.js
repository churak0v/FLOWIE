'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegramBouquetImportService } = require('../services/telegramBouquetImport');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createRepository() {
  const state = {
    updates: new Set(), imports: [], files: [], notes: [], nextImport: 1, nextFile: 1,
  };
  return {
    state,
    async claimUpdate({ updateId }) {
      if (state.updates.has(updateId)) return false;
      state.updates.add(updateId);
      return true;
    },
    async releaseUpdate(updateId) { state.updates.delete(updateId); },
    async findActiveImport({ chatId, userId }) {
      return state.imports.find((item) => item.chatId === chatId && item.userId === userId && !item.analysisClaimed) || null;
    },
    async createImport(input) {
      const item = { id: String(state.nextImport++), ...input, finalizeRequested: false, analysisClaimed: false };
      state.imports.push(item);
      return item;
    },
    async reserveFile(input) {
      if (state.files.some((item) => item.importId === input.importId &&
        (item.fileUniqueId === input.fileUniqueId || item.messageId === input.messageId))) return null;
      const item = { id: String(state.nextFile++), ...input, status: 'PENDING' };
      state.files.push(item);
      return item;
    },
    async markFileStored({ fileId }) {
      state.files.find((item) => item.id === fileId).status = 'STORED';
    },
    async markFileFailed({ fileId, error }) {
      Object.assign(state.files.find((item) => item.id === fileId), { status: 'FAILED', error });
    },
    async claimFailedFiles(importId) {
      const failed = state.files.filter((item) => item.importId === importId && item.status === 'FAILED');
      failed.forEach((item) => { item.status = 'PENDING'; });
      return failed;
    },
    async findAttachmentTargets({ importId, messageId, mediaGroupId }) {
      const matches = state.files.filter((item) => item.importId === importId &&
        (mediaGroupId ? item.mediaGroupId === mediaGroupId : item.messageId === messageId));
      if (!matches.length) return [];
      if (mediaGroupId) return [{ id: `group:${mediaGroupId}` }];
      return matches.map((item) => ({ id: `file:${item.id}` }));
    },
    async addNote(input) { state.notes.push(input); },
    async requestFinalize({ importId }) {
      state.imports.find((item) => item.id === importId).finalizeRequested = true;
    },
    async getFinalizeState(importId) {
      const item = state.imports.find((entry) => entry.id === importId);
      return {
        finalizeRequested: item.finalizeRequested,
        unresolvedFiles: state.files.filter((file) => file.importId === importId && file.status !== 'STORED').length,
      };
    },
    async claimAnalysis(importId) {
      const item = state.imports.find((entry) => entry.id === importId);
      const unresolved = state.files.some((file) => file.importId === importId && file.status !== 'STORED');
      if (!item.finalizeRequested || unresolved || item.analysisClaimed) return false;
      item.analysisClaimed = true;
      return true;
    },
  };
}

function messageUpdate(updateId, message) {
  return {
    update_id: updateId,
    message: { message_id: updateId, chat: { id: -100 }, from: { id: 7 }, ...message },
  };
}

function callbackUpdate(updateId, data = 'bouquet_import:finish:1') {
  return {
    update_id: updateId,
    callback_query: {
      data,
      from: { id: 7 },
      message: { message_id: updateId, chat: { id: -100 } },
    },
  };
}

function createFixture(overrides = {}) {
  const repository = overrides.repository || createRepository();
  const queued = [];
  const stored = [];
  const service = createTelegramBouquetImportService({
    repository,
    storage: { async put(value) { stored.push(value); } },
    analysisQueue: { async enqueue(value) { queued.push(value); } },
    env: {
      TELEGRAM_ORDER_BOT_TOKEN: 'secret-token',
      TELEGRAM_BOUQUET_IMPORT_CHAT_IDS: '-100',
      TELEGRAM_BOUQUET_IMPORT_USER_IDS: '7',
    },
    fetchImpl: overrides.fetchImpl || (async (url) => {
      if (url.endsWith('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/a.jpg' } }), {
        headers: { 'content-type': 'application/json' },
      });
      return new Response(Buffer.from('original-image'));
    }),
  });
  return { service, repository, queued, stored };
}

test('does not start paid analysis while import is active', async () => {
  const fixture = createFixture();
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  await fixture.service.handleUpdate(messageUpdate(2, {
    photo: [
      { file_id: 'small', file_unique_id: 's', width: 100, height: 100, file_size: 50 },
      { file_id: 'large', file_unique_id: 'l', width: 1000, height: 1000, file_size: 500 },
    ],
    caption: 'пион, эвкалипт',
  }));
  await fixture.service.waitForIdle();

  assert.equal(fixture.queued.length, 0);
  assert.equal(fixture.stored.length, 1);
  assert.match(fixture.stored[0].key, /^flowie-import\/1\/l\.jpg$/);
  assert.equal(fixture.repository.state.files[0].fileId, 'large');
  assert.equal(fixture.repository.state.notes[0].targetId, 'file:1');
});

test('duplicate Telegram updates and files are idempotent', async () => {
  const fixture = createFixture();
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  const update = messageUpdate(2, {
    document: { file_id: 'doc', file_unique_id: 'same', mime_type: 'image/png', file_name: '../../rose.png' },
  });
  await Promise.all([fixture.service.handleUpdate(update), fixture.service.handleUpdate(update)]);
  await fixture.service.waitForIdle();

  assert.equal(fixture.repository.state.imports.length, 1);
  assert.equal(fixture.repository.state.files.length, 1);
  assert.equal(fixture.stored.length, 1);
  assert.equal(fixture.stored[0].key, 'flowie-import/1/same.png');
});

test('rejects unauthorized chats and users without persisting the update', async () => {
  const fixture = createFixture();
  const badChat = messageUpdate(1, { text: '/import', chat: { id: -999 } });
  const badUser = messageUpdate(2, { text: '/import', from: { id: 8 } });

  assert.deepEqual(await fixture.service.handleUpdate(badChat), { ignored: 'unauthorized' });
  assert.deepEqual(await fixture.service.handleUpdate(badUser), { ignored: 'unauthorized' });
  assert.equal(fixture.repository.state.updates.size, 0);
  assert.equal(fixture.repository.state.imports.length, 0);
});

test('finalize waits for pending downloads and queues analysis exactly once', async () => {
  const gate = deferred();
  const fixture = createFixture({
    fetchImpl: async (url) => {
      if (url.endsWith('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/a.jpg' } }));
      await gate.promise;
      return new Response(Buffer.from('image'));
    },
  });
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  await fixture.service.handleUpdate(messageUpdate(2, {
    photo: [{ file_id: 'a', file_unique_id: 'a', width: 10, height: 10 }],
  }));

  const firstFinish = await fixture.service.handleUpdate(callbackUpdate(3));
  const duplicateFinish = await fixture.service.handleUpdate(callbackUpdate(3));
  assert.equal(firstFinish.status, 'waiting_for_files');
  assert.deepEqual(duplicateFinish, { ignored: 'duplicate' });
  assert.equal(fixture.queued.length, 0);

  gate.resolve();
  await fixture.service.waitForIdle();
  assert.deepEqual(fixture.queued, [{ importId: '1' }]);
});

test('unreferenced composition text is retained as an unassigned note', async () => {
  const fixture = createFixture();
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  await fixture.service.handleUpdate(messageUpdate(2, { text: 'роза, маттиола' }));
  assert.equal(fixture.repository.state.notes[0].targetId, null);
});

test('failed files block finalization until an explicit retry succeeds', async () => {
  let downloadAttempts = 0;
  const fixture = createFixture({
    fetchImpl: async (url) => {
      if (url.endsWith('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/a.jpg' } }));
      downloadAttempts += 1;
      if (downloadAttempts === 1) return new Response('bad gateway', { status: 502 });
      return new Response(Buffer.from('image'));
    },
  });
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  await fixture.service.handleUpdate(messageUpdate(2, {
    photo: [{ file_id: 'a', file_unique_id: 'a', width: 10, height: 10 }],
  }));
  await fixture.service.waitForIdle();
  assert.equal(fixture.repository.state.files[0].status, 'FAILED');

  assert.equal((await fixture.service.handleUpdate(callbackUpdate(3))).status, 'waiting_for_files');
  assert.equal(fixture.queued.length, 0);
  assert.equal((await fixture.service.handleUpdate(messageUpdate(4, { text: '/import_retry' }))).status, 'retrying_files');
  await fixture.service.waitForIdle();

  assert.equal(fixture.repository.state.files[0].status, 'STORED');
  assert.deepEqual(fixture.queued, [{ importId: '1' }]);
});

test('an old finish button cannot finalize a newer active import', async () => {
  const fixture = createFixture();
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  const result = await fixture.service.handleUpdate(callbackUpdate(2, 'bouquet_import:finish:old-batch'));
  assert.equal(result.status, 'stale_callback');
  assert.equal(fixture.repository.state.imports[0].finalizeRequested, false);
  assert.equal(fixture.queued.length, 0);
});

test('releases a claimed photo update after transient reserve failure so Telegram retry succeeds', async () => {
  const repository = createRepository();
  const originalReserve = repository.reserveFile.bind(repository);
  let failOnce = true;
  repository.reserveFile = async (input) => {
    if (failOnce) { failOnce = false; throw new Error('temporary database failure'); }
    return originalReserve(input);
  };
  const fixture = createFixture({ repository });
  await fixture.service.handleUpdate(messageUpdate(1, { text: '/import' }));
  const photo = messageUpdate(2, {
    photo: [{ file_id: 'a', file_unique_id: 'a', width: 10, height: 10 }],
  });
  await assert.rejects(fixture.service.handleUpdate(photo), /temporary database failure/);
  assert.equal(repository.state.updates.has(2), false);

  assert.equal((await fixture.service.handleUpdate(photo)).status, 'file_pending');
  await fixture.service.waitForIdle();
  assert.equal(repository.state.files.length, 1);
});

test('releases a claimed import command after transient create failure', async () => {
  const repository = createRepository();
  const originalCreate = repository.createImport.bind(repository);
  let failOnce = true;
  repository.createImport = async (input) => {
    if (failOnce) { failOnce = false; throw new Error('temporary create failure'); }
    return originalCreate(input);
  };
  const fixture = createFixture({ repository });
  const start = messageUpdate(1, { text: '/import' });
  await assert.rejects(fixture.service.handleUpdate(start), /temporary create failure/);
  assert.equal(repository.state.updates.has(1), false);

  assert.equal((await fixture.service.handleUpdate(start)).status, 'started');
  assert.equal(repository.state.imports.length, 1);
});
