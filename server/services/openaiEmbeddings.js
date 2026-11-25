const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 512;

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function embeddingConfig(env = process.env) {
  const explicitlyEnabled = String(env.CATALOG_EMBEDDINGS_ENABLED || '').toLowerCase() === 'true';
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const model = String(env.CATALOG_EMBEDDING_MODEL || DEFAULT_MODEL).trim().slice(0, 100) || DEFAULT_MODEL;
  const dimensions = boundedInteger(env.CATALOG_EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS, 16, 3072);
  const timeoutMs = boundedInteger(env.CATALOG_EMBEDDING_TIMEOUT_MS, 2500, 500, 10_000);
  return {
    explicitlyEnabled,
    enabled: explicitlyEnabled && Boolean(apiKey),
    apiKey,
    baseUrl: String(env.OPENAI_API_BASE_URL || 'https://api.openai.com').trim().replace(/\/+$/, ''),
    model,
    dimensions,
    timeoutMs,
  };
}

function validVector(vector, dimensions) {
  return Array.isArray(vector)
    && vector.length === dimensions
    && vector.every((value) => typeof value === 'number' && Number.isFinite(value))
    && vector.some((value) => value !== 0);
}

class EmbeddingProviderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function createOpenAIEmbeddingProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = embeddingConfig(env);
  return {
    config,
    async embed(inputs) {
      if (!config.enabled) throw new EmbeddingProviderError('EMBEDDINGS_DISABLED');
      if (typeof fetchImpl !== 'function') throw new EmbeddingProviderError('EMBEDDINGS_FETCH_UNAVAILABLE');
      if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 50) {
        throw new EmbeddingProviderError('EMBEDDING_INPUT_COUNT_INVALID');
      }
      const normalized = inputs.map((input) => String(input || '').trim());
      if (normalized.some((input) => !input || input.length > 4_000)) {
        throw new EmbeddingProviderError('EMBEDDING_INPUT_INVALID');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(`${config.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: normalized,
            model: config.model,
            dimensions: config.dimensions,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        });
        if (!response?.ok) throw new EmbeddingProviderError(`EMBEDDINGS_HTTP_${response?.status || 0}`);
        const payload = await response.json().catch(() => null);
        if (payload?.model && payload.model !== config.model) throw new EmbeddingProviderError('EMBEDDINGS_MODEL_MISMATCH');
        if (!Array.isArray(payload?.data) || payload.data.length !== normalized.length) {
          throw new EmbeddingProviderError('EMBEDDINGS_RESPONSE_INVALID');
        }
        const sorted = [...payload.data].sort((a, b) => Number(a?.index) - Number(b?.index));
        const vectors = sorted.map((item, index) => {
          if (Number(item?.index) !== index || !validVector(item?.embedding, config.dimensions)) {
            throw new EmbeddingProviderError('EMBEDDINGS_VECTOR_INVALID');
          }
          return item.embedding;
        });
        return vectors;
      } catch (error) {
        if (error?.name === 'AbortError') throw new EmbeddingProviderError('EMBEDDINGS_TIMEOUT');
        if (error instanceof EmbeddingProviderError) throw error;
        throw new EmbeddingProviderError('EMBEDDINGS_REQUEST_FAILED');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = {
  DEFAULT_DIMENSIONS,
  DEFAULT_MODEL,
  EmbeddingProviderError,
  createOpenAIEmbeddingProvider,
  embeddingConfig,
  validVector,
};
