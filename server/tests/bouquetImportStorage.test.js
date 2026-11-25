'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBouquetImportStorage,
  loadBouquetImportStorageConfig,
} = require('../services/bouquetImportStorage');

const fixedDate = new Date('2026-11-25T09:10:11.000Z');
const fixedUuid = '11111111-2222-4333-8444-555555555555';

function config(overrides = {}) {
  return {
    endpoint: 'https://s3.example.test',
    bucket: 'flowie-private-imports',
    region: 'ru-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    sessionToken: null,
    maxUploadBytes: 32,
    maxReadBytes: 32,
    timeoutMs: 1_000,
    ...overrides,
  };
}

test('loads only the dedicated FLOWIE import S3 environment contract', () => {
  assert.throws(() => loadBouquetImportStorageConfig({
    S3_BUCKET: 'generic-media-bucket',
    FLOWIE_IMPORT_S3_ENDPOINT: 'https://s3.example.test',
    FLOWIE_IMPORT_S3_REGION: 'ru-1',
    FLOWIE_IMPORT_S3_ACCESS_KEY_ID: 'access',
    FLOWIE_IMPORT_S3_SECRET_ACCESS_KEY: 'secret',
  }), (error) => error.code === 'BOUQUET_IMPORT_STORAGE_CONFIG' && /FLOWIE_IMPORT_S3_BUCKET/.test(error.message));

  const loaded = loadBouquetImportStorageConfig({
    FLOWIE_IMPORT_S3_BUCKET: 'flowie-private-imports',
    FLOWIE_IMPORT_S3_ENDPOINT: 'https://s3.example.test',
    FLOWIE_IMPORT_S3_REGION: 'ru-1',
    FLOWIE_IMPORT_S3_ACCESS_KEY_ID: 'access',
    FLOWIE_IMPORT_S3_SECRET_ACCESS_KEY: 'secret',
  });
  assert.equal(loaded.bucket, 'flowie-private-imports');
});

test('uploads unchanged original bytes to a private prefix with SigV4 and no ACL', async () => {
  const calls = [];
  const original = Buffer.from('original-photo');
  const storage = createBouquetImportStorage({
    config: config(),
    now: () => fixedDate,
    randomUUID: () => fixedUuid,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 200, headers: { etag: '"etag-1"' } });
    },
  });

  const result = await storage.uploadOriginal({ buffer: original, filename: '../Букет № 1.JPG', contentType: 'image/jpeg', metadata: { 'photo-id': 'photo-1' } });
  assert.equal(result.key, `flowie-import/2026/11/25/${fixedUuid}-No-1.JPG`);
  assert.deepEqual(original, Buffer.from('original-photo'));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/s3\.example\.test\/flowie-private-imports\/flowie-import\/2026\/11\/25\//);
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.body, original);
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(calls[0].init.headers['content-type'], 'image/jpeg');
  assert.equal(calls[0].init.headers['x-amz-meta-photo-id'], 'photo-1');
  assert.equal(calls[0].init.headers['x-amz-acl'], undefined);
  assert.equal(calls[0].init.headers.acl, undefined);
});

test('accepts Telegram import keys through put and rejects traversal or encoded slashes', async () => {
  const calls = [];
  const storage = createBouquetImportStorage({
    config: config(),
    now: () => fixedDate,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    },
  });
  const result = await storage.put({
    key: 'flowie-import/import-123/AQAD_file-unique.jpg',
    body: Buffer.from('photo'),
    contentType: 'image/jpeg',
    metadata: { telegram_file_id: 'bad-name' },
  }).catch((error) => error);
  assert.equal(result.code, 'BOUQUET_IMPORT_STORAGE_INVALID_METADATA');
  assert.equal(calls.length, 0);

  const saved = await storage.put({
    key: 'flowie-import/import-123/AQAD_file-unique.jpg',
    body: Buffer.from('photo'),
    contentType: 'image/jpeg',
    metadata: { 'telegram-file-id': 'file-1' },
  });
  assert.equal(saved.key, 'flowie-import/import-123/AQAD_file-unique.jpg');
  await assert.rejects(() => storage.get('flowie-import/import-123/../catalog.jpg'), (error) => error.code === 'BOUQUET_IMPORT_STORAGE_INVALID_KEY');
  await assert.rejects(() => storage.get('flowie-import/import-123/a%2Fb.jpg'), (error) => error.code === 'BOUQUET_IMPORT_STORAGE_INVALID_KEY');
});

test('rejects an oversized upload before making a request', async () => {
  let called = false;
  const storage = createBouquetImportStorage({
    config: config({ maxUploadBytes: 3 }),
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    () => storage.uploadOriginal({ buffer: Buffer.from('four'), filename: 'photo.jpg', contentType: 'image/jpeg' }),
    (error) => error.code === 'BOUQUET_IMPORT_STORAGE_UPLOAD_TOO_LARGE',
  );
  assert.equal(called, false);
});

test('reads a bounded private original and rejects keys outside the import prefix', async () => {
  const key = `flowie-import/2026/11/25/${fixedUuid}-photo.jpg`;
  const storage = createBouquetImportStorage({
    config: config(),
    now: () => fixedDate,
    fetchImpl: async () => new Response(Buffer.from('photo-bytes'), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', etag: '"etag-2"' },
    }),
  });
  const result = await storage.readOriginal(key);
  assert.equal(result.key, key);
  assert.deepEqual(result.buffer, Buffer.from('photo-bytes'));
  assert.equal(result.contentType, 'image/jpeg');
  await assert.rejects(() => storage.readOriginal('catalog/photo.jpg'), (error) => error.code === 'BOUQUET_IMPORT_STORAGE_INVALID_KEY');
});

test('stops a streamed read when the configured byte bound is exceeded', async () => {
  const key = `flowie-import/2026/11/25/${fixedUuid}-photo.jpg`;
  const storage = createBouquetImportStorage({
    config: config({ maxReadBytes: 4 }),
    now: () => fixedDate,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('abc'));
        controller.enqueue(Buffer.from('def'));
        controller.close();
      },
    }), { status: 200 }),
  });
  await assert.rejects(() => storage.readOriginal(key), (error) => error.code === 'BOUQUET_IMPORT_STORAGE_READ_TOO_LARGE');
});

