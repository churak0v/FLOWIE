const crypto = require('crypto');
const { createOpenAIEmbeddingProvider, validVector } = require('./openaiEmbeddings');

const DOCUMENT_VERSION = 'catalog-public-v1';
const MAX_CANDIDATES = 2_000;
const ALLOWED_REQUEST_FIELDS = new Set(['query', 'minPrice', 'maxPrice', 'collection', 'scenario', 'limit']);

class CatalogSearchError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function publicText(value, max = 500) {
  return [...String(value || '')]
    .map((character) => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function activeCollections(product) {
  return (product?.collectionItems || [])
    .map((item) => item?.collection)
    .filter((collection) => collection?.isActive !== false && collection?.title);
}

function buildProductDocument(product) {
  const composition = (product?.composition || [])
    .map((item) => [publicText(item?.name, 120), publicText(item?.quantity, 60)].filter(Boolean).join(' — '))
    .filter(Boolean);
  const collections = activeCollections(product).map((item) => publicText(item.title, 120)).filter(Boolean);
  return [
    `Название: ${publicText(product?.name, 200)}`,
    product?.description ? `Описание: ${publicText(product.description, 1_000)}` : '',
    product?.color ? `Цвет: ${publicText(product.color, 100)}` : '',
    composition.length ? `Состав: ${composition.join('; ')}` : '',
    collections.length ? `Подборки: ${collections.join('; ')}` : '',
  ].filter(Boolean).join('\n').slice(0, 4_000);
}

function productContentHash(product) {
  return crypto.createHash('sha256').update(`${DOCUMENT_VERSION}\n${buildProductDocument(product)}`).digest('hex');
}

function redactQuery(value) {
  return publicText(value, 200)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]*){7,}/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function parseMoney(value, code) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number') throw new CatalogSearchError(code);
  const number = value;
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) throw new CatalogSearchError(code);
  return number;
}

function parsePricePhrases(query) {
  let rest = String(query || '').replace(/\u00a0/g, ' ');
  let minPrice = null;
  let maxPrice = null;
  const number = '(\\d{1,3}(?:\\s\\d{3})+|\\d+)';
  const combined = new RegExp(`(?<![\\p{L}\\p{N}])от\\s*${number}\\s*до\\s*${number}`, 'iu');
  const combinedMatch = rest.match(combined);
  if (combinedMatch) {
    minPrice = Number(combinedMatch[1].replace(/\s/g, ''));
    maxPrice = Number(combinedMatch[2].replace(/\s/g, ''));
    rest = rest.replace(combined, ' ');
  } else {
    const from = new RegExp(`(?<![\\p{L}\\p{N}])от\\s*${number}`, 'iu');
    const to = new RegExp(`(?<![\\p{L}\\p{N}])до\\s*${number}`, 'iu');
    const fromMatch = rest.match(from);
    const toMatch = rest.match(to);
    if (fromMatch) {
      minPrice = Number(fromMatch[1].replace(/\s/g, ''));
      rest = rest.replace(from, ' ');
    }
    if (toMatch) {
      maxPrice = Number(toMatch[1].replace(/\s/g, ''));
      rest = rest.replace(to, ' ');
    }
  }
  if (minPrice != null && (!Number.isSafeInteger(minPrice) || minPrice > 1_000_000)) throw new CatalogSearchError('BAD_MIN_PRICE');
  if (maxPrice != null && (!Number.isSafeInteger(maxPrice) || maxPrice > 1_000_000)) throw new CatalogSearchError('BAD_MAX_PRICE');
  return { query: rest.replace(/\s+/g, ' ').trim(), minPrice, maxPrice };
}

function safeSelector(value, code) {
  if (value == null || value === '') return null;
  const selector = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(selector)) throw new CatalogSearchError(code);
  return selector;
}

function normalizeSearchRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CatalogSearchError('BAD_SEARCH_BODY');
  for (const key of Object.keys(body)) if (!ALLOWED_REQUEST_FIELDS.has(key)) throw new CatalogSearchError('UNKNOWN_SEARCH_FIELD');
  if (typeof body.query !== 'string') throw new CatalogSearchError('QUERY_REQUIRED');
  const redacted = redactQuery(body.query);
  if (!redacted) throw new CatalogSearchError('QUERY_REQUIRED');
  const phrase = parsePricePhrases(redacted);
  const requestMin = parseMoney(body.minPrice, 'BAD_MIN_PRICE');
  const requestMax = parseMoney(body.maxPrice, 'BAD_MAX_PRICE');
  const minimums = [requestMin, phrase.minPrice].filter((value) => value != null);
  const maximums = [requestMax, phrase.maxPrice].filter((value) => value != null);
  const minPrice = minimums.length ? Math.max(...minimums) : null;
  const maxPrice = maximums.length ? Math.min(...maximums) : null;
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) throw new CatalogSearchError('PRICE_RANGE_EMPTY');
  const limit = body.limit == null ? 20 : body.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new CatalogSearchError('BAD_LIMIT');
  return {
    query: phrase.query,
    providerQuery: phrase.query,
    minPrice,
    maxPrice,
    collection: safeSelector(body.collection, 'BAD_COLLECTION'),
    scenario: safeSelector(body.scenario, 'BAD_SCENARIO'),
    limit,
  };
}

function effectivePrice(product) {
  return Math.max(0, Number(product?.price || 0) - Math.max(0, Number(product?.discount || 0)));
}

function collectionMatches(product, selector, type) {
  if (!selector) return true;
  return activeCollections(product).some((collection) => {
    if (String(collection.type) !== type) return false;
    return String(collection.id) === selector || String(collection.slug) === selector;
  });
}

function normalizeWords(value) {
  return publicText(value, 4_000).toLocaleLowerCase('ru-RU').match(/[\p{L}\p{N}]+/gu) || [];
}

function tokenSimilarity(queryToken, candidateToken) {
  if (queryToken === candidateToken) return 1;
  if (queryToken.length >= 4 && candidateToken.length >= 4 && queryToken.slice(0, 4) === candidateToken.slice(0, 4)) return 0.6;
  return 0;
}

function fieldTokenScore(queryTokens, field, weight) {
  const candidate = normalizeWords(field);
  return queryTokens.reduce((sum, queryToken) => {
    const best = candidate.reduce((max, token) => Math.max(max, tokenSimilarity(queryToken, token)), 0);
    return sum + best * weight;
  }, 0);
}

function lexicalScore(product, query) {
  const normalizedQuery = publicText(query, 160).toLocaleLowerCase('ru-RU');
  const tokens = normalizeWords(normalizedQuery).filter((token) => token !== 'email' && token !== 'phone');
  if (!tokens.length) return 0;
  const name = publicText(product?.name, 200).toLocaleLowerCase('ru-RU');
  const composition = (product?.composition || []).map((item) => `${item?.name || ''} ${item?.quantity || ''}`).join(' ');
  const collections = activeCollections(product).map((item) => item.title).join(' ');
  let score = name === normalizedQuery ? 20 : name.includes(normalizedQuery) ? 10 : 0;
  score += fieldTokenScore(tokens, name, 4);
  score += fieldTokenScore(tokens, composition, 3);
  score += fieldTokenScore(tokens, product?.color, 2);
  score += fieldTokenScore(tokens, collections, 2);
  score += fieldTokenScore(tokens, product?.description, 1);
  return score;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (!leftNorm || !rightNorm) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function searchConfig(env = process.env) {
  const rawThreshold = Number(env.CATALOG_SEARCH_MIN_SIMILARITY);
  return {
    minSimilarity: Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 1 ? rawThreshold : 0.25,
    cacheTtlMs: 5 * 60_000,
    cacheMax: 100,
  };
}

function productQuery() {
  return {
    where: { isActive: true, isUpsell: false },
    include: {
      composition: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
      collectionItems: { include: { collection: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
    },
    orderBy: [{ sort: 'asc' }, { id: 'asc' }],
  };
}

function createCatalogSearchService({ prisma, provider = createOpenAIEmbeddingProvider(), env = process.env } = {}) {
  if (!prisma) throw new Error('PRISMA_REQUIRED');
  const config = searchConfig(env);
  const queryVectorCache = new Map();

  function cacheGet(key) {
    const hit = queryVectorCache.get(key);
    if (!hit || Date.now() - hit.createdAt > config.cacheTtlMs) {
      queryVectorCache.delete(key);
      return null;
    }
    return hit.value;
  }

  function cacheSet(key, value) {
    if (queryVectorCache.size >= config.cacheMax && !queryVectorCache.has(key)) queryVectorCache.delete(queryVectorCache.keys().next().value);
    queryVectorCache.set(key, { createdAt: Date.now(), value });
  }

  async function search(body) {
    const request = normalizeSearchRequest(body);
    const allProducts = await prisma.product.findMany(productQuery());
    const candidates = allProducts.filter((product) => {
      const price = effectivePrice(product);
      if (request.minPrice != null && price < request.minPrice) return false;
      if (request.maxPrice != null && price > request.maxPrice) return false;
      if (!collectionMatches(product, request.collection, 'thematic')) return false;
      if (!collectionMatches(product, request.scenario, 'scenario')) return false;
      return true;
    });

    const base = {
      appliedFilters: { minPrice: request.minPrice, maxPrice: request.maxPrice },
    };
    const lexicalRanked = candidates
      .map((product) => ({ product, lexical: lexicalScore(product, request.query) }))
      .filter((item) => !request.query || item.lexical > 0)
      .sort((a, b) => b.lexical - a.lexical || Number(a.product.sort || 0) - Number(b.product.sort || 0) || a.product.id - b.product.id);

    if (!provider?.config?.enabled || !request.providerQuery || !candidates.length) {
      const result = { productIds: lexicalRanked.slice(0, request.limit).map((item) => item.product.id), mode: 'lexical', ...base, indexReady: false };
      return result;
    }

    if (candidates.length > MAX_CANDIDATES) {
      return { productIds: lexicalRanked.slice(0, request.limit).map((item) => item.product.id), mode: 'lexical', ...base, indexReady: false };
    }

    const embeddings = await prisma.productEmbedding.findMany({ where: { productId: { in: candidates.map((product) => product.id) } } });
    const embeddingByProduct = new Map(embeddings.map((embedding) => [Number(embedding.productId), embedding]));
    const indexReady = candidates.every((product) => {
      const row = embeddingByProduct.get(Number(product.id));
      return row
        && row.contentHash === productContentHash(product)
        && row.documentVersion === DOCUMENT_VERSION
        && row.model === provider.config.model
        && row.dimensions === provider.config.dimensions
        && validVector(row.vector, provider.config.dimensions);
    });
    if (!indexReady) {
      const result = { productIds: lexicalRanked.slice(0, request.limit).map((item) => item.product.id), mode: 'lexical', ...base, indexReady: false };
      return result;
    }

    try {
      const queryCacheKey = JSON.stringify([provider.config.model, provider.config.dimensions, request.providerQuery]);
      let queryVector = cacheGet(queryCacheKey);
      if (!queryVector) {
        [queryVector] = await provider.embed([request.providerQuery]);
        if (validVector(queryVector, provider.config.dimensions)) cacheSet(queryCacheKey, queryVector);
      }
      if (!validVector(queryVector, provider.config.dimensions)) throw new Error('QUERY_VECTOR_INVALID');
      const ranked = candidates
        .map((product) => {
          const similarity = cosineSimilarity(queryVector, embeddingByProduct.get(Number(product.id)).vector);
          const lexical = lexicalScore(product, request.query);
          return { product, similarity, lexical, score: lexical + Math.max(0, similarity || 0) * 8 };
        })
        .filter((item) => item.lexical > 0 || (item.similarity != null && item.similarity >= config.minSimilarity))
        .sort((a, b) => b.score - a.score || b.lexical - a.lexical || b.similarity - a.similarity || a.product.id - b.product.id);
      const result = { productIds: ranked.slice(0, request.limit).map((item) => item.product.id), mode: 'hybrid', ...base, indexReady: true };
      return result;
    } catch {
      const result = { productIds: lexicalRanked.slice(0, request.limit).map((item) => item.product.id), mode: 'lexical', ...base, indexReady: true };
      return result;
    }
  }

  return { search, clearCache: () => queryVectorCache.clear() };
}

async function reindexCatalogEmbeddings({ prisma, provider = createOpenAIEmbeddingProvider(), maxProducts = 2_000, batchSize = 20 } = {}) {
  if (!prisma) throw new Error('PRISMA_REQUIRED');
  if (!provider?.config?.enabled) throw new CatalogSearchError('EMBEDDINGS_DISABLED', 503);
  const safeMax = Number(maxProducts);
  const safeBatch = Number(batchSize);
  if (!Number.isSafeInteger(safeMax) || safeMax < 1 || safeMax > 2_000) throw new CatalogSearchError('BAD_PRODUCT_BUDGET');
  if (!Number.isSafeInteger(safeBatch) || safeBatch < 1 || safeBatch > 50) throw new CatalogSearchError('BAD_BATCH_SIZE');

  const products = await prisma.product.findMany({ ...productQuery(), take: safeMax + 1 });
  if (products.length > safeMax) throw new CatalogSearchError('PRODUCT_BUDGET_EXCEEDED', 409);
  const productIds = products.map((product) => product.id);
  const existing = await prisma.productEmbedding.findMany({});
  const existingByProduct = new Map(existing.map((row) => [Number(row.productId), row]));
  const pending = products.filter((product) => {
    const row = existingByProduct.get(Number(product.id));
    return !row
      || row.contentHash !== productContentHash(product)
      || row.documentVersion !== DOCUMENT_VERSION
      || row.model !== provider.config.model
      || row.dimensions !== provider.config.dimensions
      || !validVector(row.vector, provider.config.dimensions);
  });

  const deleted = await prisma.productEmbedding.deleteMany({
    where: productIds.length ? { productId: { notIn: productIds } } : {},
  });
  let indexed = 0;
  for (let offset = 0; offset < pending.length; offset += safeBatch) {
    const batch = pending.slice(offset, offset + safeBatch);
    const vectors = await provider.embed(batch.map(buildProductDocument));
    if (!Array.isArray(vectors) || vectors.length !== batch.length) throw new CatalogSearchError('EMBEDDINGS_RESPONSE_INVALID', 502);
    for (let index = 0; index < batch.length; index += 1) {
      const product = batch[index];
      const vector = vectors[index];
      if (!validVector(vector, provider.config.dimensions)) throw new CatalogSearchError('EMBEDDINGS_VECTOR_INVALID', 502);
      await prisma.productEmbedding.upsert({
        where: { productId: product.id },
        update: {
          contentHash: productContentHash(product),
          documentVersion: DOCUMENT_VERSION,
          model: provider.config.model,
          dimensions: provider.config.dimensions,
          vector,
        },
        create: {
          productId: product.id,
          contentHash: productContentHash(product),
          documentVersion: DOCUMENT_VERSION,
          model: provider.config.model,
          dimensions: provider.config.dimensions,
          vector,
        },
      });
      indexed += 1;
    }
  }
  return { active: products.length, indexed, skipped: products.length - pending.length, deleted: Number(deleted?.count || 0) };
}

module.exports = {
  CatalogSearchError,
  DOCUMENT_VERSION,
  MAX_CANDIDATES,
  buildProductDocument,
  cosineSimilarity,
  createCatalogSearchService,
  effectivePrice,
  normalizeSearchRequest,
  parsePricePhrases,
  productContentHash,
  redactQuery,
  reindexCatalogEmbeddings,
};
