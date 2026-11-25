const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenAIBatchProvider } = require('../services/bouquetImportBatch');
const { createOpenAIEmbeddingProvider } = require('../services/openaiEmbeddings');

test('Batch uploads, submits, polls and reads results through configured relay', async () => {
  const calls = [];
  const provider = createOpenAIBatchProvider({ apiKey: 'test-key', baseUrl: 'https://speka.test/flowie-openai',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/content')) return new Response('result');
      return Response.json({ id: url.endsWith('/files') ? 'file-1' : 'batch-1' });
    },
  });
  await provider.submit({ jsonl: Buffer.from('{}'), idempotencyKey: 'digest', importId: 'test' });
  await provider.retrieve('batch-1');
  assert.equal(await provider.downloadOutput('file-1'), 'result');
  assert.deepEqual(calls.map((call) => call.url), [
    'https://speka.test/flowie-openai/v1/files', 'https://speka.test/flowie-openai/v1/batches',
    'https://speka.test/flowie-openai/v1/batches/batch-1', 'https://speka.test/flowie-openai/v1/files/file-1/content',
  ]);
  assert.ok(calls.every((call) => call.options.headers.authorization === 'Bearer test-key'));
});

test('Embeddings use the same relay without direct-origin fallback', async () => {
  const urls = [];
  const provider = createOpenAIEmbeddingProvider({ env: {
    OPENAI_API_KEY: 'test-key', CATALOG_EMBEDDINGS_ENABLED: 'true',
    OPENAI_API_BASE_URL: 'https://speka.test/flowie-openai/', CATALOG_EMBEDDING_DIMENSIONS: '16',
  }, fetchImpl: async (url) => { urls.push(url); return new Response('{}', { status: 403 }); } });
  await assert.rejects(provider.embed(['bouquet']), /EMBEDDINGS_HTTP_403/);
  assert.deepEqual(urls, ['https://speka.test/flowie-openai/v1/embeddings']);
});
