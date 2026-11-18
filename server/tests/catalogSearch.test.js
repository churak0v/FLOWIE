const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
  CatalogSearchError,
  DOCUMENT_VERSION,
  buildProductDocument,
  createCatalogSearchService,
  normalizeSearchRequest,
  productContentHash,
  reindexCatalogEmbeddings,
} = require('../services/catalogSearch');
const { createOpenAIEmbeddingProvider, validVector } = require('../services/openaiEmbeddings');
const { createRateLimiter, createSearchRouter } = require('../routes/search');

function collection(id, slug, title, type = 'thematic') {
  return { id, slug, title, type, isActive: true };
}

function product(id, overrides = {}) {
  return {
    id,
    name: `Букет ${id}`,
    description: 'Свежие цветы',
    price: 5_000,
    discount: 0,
    color: 'розовый',
    sort: id,
    isActive: true,
    isUpsell: false,
    composition: [{ id: id * 10, name: 'Роза', quantity: '15 шт.', sort: 1 }],
    collectionItems: [{ id: id * 10, sort: 1, collection: collection(1, 'romantic', 'Романтика') }],
    ...overrides,
  };
}

function createSearchPrisma(products, embeddings) {
  return {
    product: {
      findMany: async ({ where } = {}) => products.filter((item) => {
        if (where?.isActive != null && item.isActive !== where.isActive) return false;
        if (where?.isUpsell != null && item.isUpsell !== where.isUpsell) return false;
        return true;
      }),
    },
    productEmbedding: {
      findMany: async ({ where } = {}) => embeddings.filter((item) => !where?.productId?.in || where.productId.in.includes(item.productId)),
    },
  };
}

function embeddingFor(item, vector, overrides = {}) {
  return {
    productId: item.id,
    contentHash: productContentHash(item),
    documentVersion: DOCUMENT_VERSION,
    model: 'mock-embedding',
    dimensions: 3,
    vector,
    ...overrides,
  };
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('price phrases and explicit body filters form a strict deterministic intersection', () => {
  assert.deepEqual(normalizeSearchRequest({ query: 'до5000' }).maxPrice, 5_000);
  assert.deepEqual(normalizeSearchRequest({ query: 'от3000до5000' }).minPrice, 3_000);
  assert.deepEqual(normalizeSearchRequest({ query: 'от3000до5000' }).maxPrice, 5_000);
  assert.deepEqual(normalizeSearchRequest({ query: 'нежный букет до 5 000' }).query, 'нежный букет');
  assert.deepEqual(normalizeSearchRequest({ query: 'розы от 3 000 до 7 000', minPrice: 4_000, maxPrice: 8_000 }).minPrice, 4_000);
  const request = normalizeSearchRequest({ query: 'нежный букет от3000до5000', minPrice: 3_500 });
  assert.equal(request.query, 'нежный букет');
  assert.deepEqual({ minPrice: request.minPrice, maxPrice: request.maxPrice }, { minPrice: 3_500, maxPrice: 5_000 });
  assert.throws(() => normalizeSearchRequest({ query: 'розы до 3000', minPrice: 4_000 }), /PRICE_RANGE_EMPTY/);
  assert.throws(() => normalizeSearchRequest({ query: 'розы', limit: 101 }), /BAD_LIMIT/);
});

test('hybrid search filters active price and collection candidates before ranking', async () => {
  const rose = product(1, { name: 'Нежные розы', price: 4_500 });
  const tulip = product(2, { name: 'Тюльпаны', price: 4_000, composition: [{ name: 'Тюльпан', quantity: '25 шт.' }] });
  const expensive = product(3, { name: 'Нежный премиум', price: 9_000 });
  const inactive = product(4, { name: 'Нежные скрытые розы', price: 2_000, isActive: false });
  const embeddings = [embeddingFor(rose, [1, 0, 0]), embeddingFor(tulip, [0.8, 0.2, 0])];
  const calls = [];
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async (inputs) => { calls.push(inputs); return [[1, 0, 0]]; },
  };
  const service = createCatalogSearchService({ prisma: createSearchPrisma([rose, tulip, expensive, inactive], embeddings), provider });
  const result = await service.search({ query: 'нежные цветы до5000', collection: 'romantic', limit: 10 });

  assert.deepEqual(result.productIds, [1, 2]);
  assert.equal(result.mode, 'hybrid');
  assert.equal(result.indexReady, true);
  assert.deepEqual(result.appliedFilters, { minPrice: null, maxPrice: 5_000 });
  assert.deepEqual(calls, [['нежные цветы']]);
});

test('disabled, stale, wrong-model and malformed indexes fall back without provider calls', async () => {
  const item = product(1, { name: 'Красные розы' });
  const cases = [
    { providerEnabled: false, row: embeddingFor(item, [1, 0, 0]) },
    { providerEnabled: true, row: embeddingFor(item, [1, 0, 0], { contentHash: 'stale' }) },
    { providerEnabled: true, row: embeddingFor(item, [1, 0, 0], { model: 'old-model' }) },
    { providerEnabled: true, row: embeddingFor(item, [0, 0, 0]) },
  ];
  for (const entry of cases) {
    let calls = 0;
    const provider = {
      config: { enabled: entry.providerEnabled, model: 'mock-embedding', dimensions: 3 },
      embed: async () => { calls += 1; return [[1, 0, 0]]; },
    };
    const service = createCatalogSearchService({ prisma: createSearchPrisma([item], [entry.row]), provider });
    const result = await service.search({ query: 'красные розы' });
    assert.equal(result.mode, 'lexical');
    assert.equal(result.indexReady, false);
    assert.deepEqual(result.productIds, [1]);
    assert.equal(calls, 0);
  }
});

test('provider failure is an explicit lexical fallback while a current index stays ready', async () => {
  const item = product(1, { name: 'Белые розы' });
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async () => { throw new Error('provider unavailable'); },
  };
  const service = createCatalogSearchService({ prisma: createSearchPrisma([item], [embeddingFor(item, [1, 0, 0])]), provider });
  const result = await service.search({ query: 'белые розы' });
  assert.equal(result.mode, 'lexical');
  assert.equal(result.indexReady, true);
  assert.deepEqual(result.productIds, [1]);
});

test('catalog is not silently truncated at fifty products', async () => {
  const products = Array.from({ length: 60 }, (_, index) => product(index + 1, {
    name: index === 59 ? 'Уникальная орхидея' : `Букет роз ${index + 1}`,
  }));
  const provider = { config: { enabled: false, model: 'mock-embedding', dimensions: 3 }, embed: async () => { throw new Error('must not run'); } };
  const service = createCatalogSearchService({ prisma: createSearchPrisma(products, []), provider });
  const result = await service.search({ query: 'уникальная орхидея', limit: 100 });
  assert.deepEqual(result.productIds, [60]);
});

test('query vector cache never caches live product availability or prices', async () => {
  const first = product(1, { name: 'Белые розы', price: 4_000 });
  const second = product(2, { name: 'Красные розы', price: 4_500 });
  const products = [first, second];
  const embeddings = [embeddingFor(first, [1, 0, 0]), embeddingFor(second, [0.9, 0.1, 0])];
  const prisma = createSearchPrisma(products, embeddings);
  let providerCalls = 0;
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async () => { providerCalls += 1; return [[1, 0, 0]]; },
  };
  const service = createCatalogSearchService({ prisma, provider });
  const initial = await service.search({ query: 'розы до5000' });
  assert.deepEqual(initial.productIds, [1, 2]);
  first.isActive = false;
  second.price = 6_000;
  const changed = await service.search({ query: 'розы до5000' });
  assert.deepEqual(changed.productIds, []);
  assert.equal(providerCalls, 1);
});

test('query PII is redacted before the embedding provider sees it', async () => {
  const item = product(1, { name: 'Розы' });
  let providerInput = '';
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async ([input]) => { providerInput = input; return [[1, 0, 0]]; },
  };
  const service = createCatalogSearchService({ prisma: createSearchPrisma([item], [embeddingFor(item, [1, 0, 0])]), provider });
  await service.search({ query: 'розы user@example.com +7 999 123-45-67' });
  assert.doesNotMatch(providerInput, /example|999|123/);
  assert.match(providerInput, /\[email\].*\[phone\]/);
});

function createReindexPrisma(products, initialRows) {
  const rows = new Map(initialRows.map((row) => [row.productId, { ...row }]));
  const stats = { deletes: 0, upserts: [] };
  return {
    stats,
    rows,
    product: {
      findMany: async ({ where, take } = {}) => products
        .filter((item) => (where?.isActive == null || item.isActive === where.isActive) && (where?.isUpsell == null || item.isUpsell === where.isUpsell))
        .slice(0, take),
    },
    productEmbedding: {
      findMany: async () => [...rows.values()],
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const id of [...rows.keys()]) {
          if (!where.productId || !where.productId.notIn.includes(id)) { rows.delete(id); count += 1; }
        }
        stats.deletes += count;
        return { count };
      },
      upsert: async ({ where, update, create }) => {
        const next = rows.has(where.productId) ? { ...rows.get(where.productId), ...update } : { ...create };
        rows.set(where.productId, next);
        stats.upserts.push(where.productId);
        return next;
      },
    },
  };
}

test('incremental reindex skips current rows, repairs stale/malformed rows and deletes inactive rows', async () => {
  const current = product(1);
  const stale = product(2, { description: 'Обновлённое описание' });
  const malformed = product(3);
  const inactive = product(4, { isActive: false });
  const prisma = createReindexPrisma([current, stale, malformed, inactive], [
    embeddingFor(current, [1, 0, 0]),
    embeddingFor(stale, [1, 0, 0], { contentHash: 'old' }),
    embeddingFor(malformed, [0, 0, 0]),
    embeddingFor(inactive, [1, 0, 0]),
  ]);
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async (inputs) => inputs.map((_, index) => [1, index + 1, 0]),
  };
  const result = await reindexCatalogEmbeddings({ prisma, provider, maxProducts: 50, batchSize: 20 });
  assert.deepEqual(result, { active: 3, indexed: 2, skipped: 1, deleted: 1 });
  assert.deepEqual(prisma.stats.upserts, [2, 3]);
  assert.equal(prisma.rows.has(4), false);
  assert.equal(prisma.rows.get(2).documentVersion, DOCUMENT_VERSION);
});

test('reindex product budget stops before provider calls or deletes, and partial success remains safe', async () => {
  const products = [product(1), product(2), product(3)];
  const budgetPrisma = createReindexPrisma(products, [embeddingFor(product(99), [1, 0, 0])]);
  let calls = 0;
  const provider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async () => { calls += 1; return [[1, 0, 0]]; },
  };
  await assert.rejects(() => reindexCatalogEmbeddings({ prisma: budgetPrisma, provider, maxProducts: 2 }), /PRODUCT_BUDGET_EXCEEDED/);
  assert.equal(calls, 0);
  assert.equal(budgetPrisma.stats.deletes, 0);

  const partialPrisma = createReindexPrisma(products.slice(0, 2), []);
  const partialProvider = {
    config: { enabled: true, model: 'mock-embedding', dimensions: 3 },
    embed: async () => {
      calls += 1;
      if (calls > 1) throw new Error('second batch failed');
      return [[1, 0, 0]];
    },
  };
  calls = 0;
  await assert.rejects(() => reindexCatalogEmbeddings({ prisma: partialPrisma, provider: partialProvider, maxProducts: 2, batchSize: 1 }), /second batch failed/);
  assert.equal(partialPrisma.rows.has(1), true);
  assert.equal(partialPrisma.rows.has(2), false);
});

test('OpenAI provider is disabled without key and validates model, dimensions and non-zero vectors', async () => {
  let fetchCalls = 0;
  const disabled = createOpenAIEmbeddingProvider({
    env: { CATALOG_EMBEDDINGS_ENABLED: 'true' },
    fetchImpl: async () => { fetchCalls += 1; },
  });
  await assert.rejects(() => disabled.embed(['розы']), /EMBEDDINGS_DISABLED/);
  assert.equal(fetchCalls, 0);
  assert.equal(validVector([0, 0, 0], 3), false);

  const mismatch = createOpenAIEmbeddingProvider({
    env: { CATALOG_EMBEDDINGS_ENABLED: 'true', OPENAI_API_KEY: 'test-key', CATALOG_EMBEDDING_MODEL: 'expected', CATALOG_EMBEDDING_DIMENSIONS: '16' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ model: 'other', data: [{ index: 0, embedding: [1, 0, 0] }] }) }),
  });
  await assert.rejects(() => mismatch.embed(['розы']), /EMBEDDINGS_MODEL_MISMATCH/);

  let request;
  const enabled = createOpenAIEmbeddingProvider({
    env: { CATALOG_EMBEDDINGS_ENABLED: 'true', OPENAI_API_KEY: 'test-key', CATALOG_EMBEDDING_MODEL: 'text-embedding-3-small', CATALOG_EMBEDDING_DIMENSIONS: '16' },
    fetchImpl: async (_url, init) => {
      request = init;
      return { ok: true, json: async () => ({ model: 'text-embedding-3-small', data: [{ index: 0, embedding: [1, ...Array(15).fill(0)] }] }) };
    },
  });
  assert.deepEqual(await enabled.embed(['публичный товар']), [[1, ...Array(15).fill(0)]]);
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(request.body), {
    input: ['публичный товар'],
    model: 'text-embedding-3-small',
    dimensions: 16,
    encoding_format: 'float',
  });
});

test('catalog document contains public product fields only and rate limiting is bounded', () => {
  const item = product(1, { user: { phone: '+7999' }, secret: 'hidden', description: 'Нежный букет' });
  const document = buildProductDocument(item);
  assert.match(document, /Нежный букет|Букет 1/);
  assert.match(document, /Роза/);
  assert.doesNotMatch(document, /7999|hidden/);

  let now = 0;
  const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => now });
  assert.equal(limiter.consume('ip').allowed, true);
  assert.equal(limiter.consume('ip').allowed, true);
  assert.equal(limiter.consume('ip').allowed, false);
  now = 1_001;
  assert.equal(limiter.consume('ip').allowed, true);
});

test('catalog endpoint returns the narrow contract and enforces request rate limits', async () => {
  const responseBody = {
    productIds: [2, 1],
    mode: 'lexical',
    appliedFilters: { minPrice: null, maxPrice: 5_000 },
    indexReady: false,
  };
  const service = { search: async () => responseBody };
  const rateLimiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  await withServer(createSearchRouter({ service, rateLimiter, prisma: {} }), async (base) => {
    const first = await fetch(`${base}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'розы до5000' }),
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), responseBody);
    const limited = await fetch(`${base}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'розы' }),
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
  });
});

test('invalid request errors remain explicit', async () => {
  assert.throws(() => normalizeSearchRequest({ query: 'розы', surprise: true }), CatalogSearchError);
  assert.throws(() => normalizeSearchRequest({ query: 'розы', maxPrice: '5000' }), /BAD_MAX_PRICE/);
  assert.throws(() => normalizeSearchRequest({ query: 'розы', limit: '10' }), /BAD_LIMIT/);
});
