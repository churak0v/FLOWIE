require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createOpenAIEmbeddingProvider } = require('../services/openaiEmbeddings');
const { reindexCatalogEmbeddings } = require('../services/catalogSearch');

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

async function main() {
  const prisma = new PrismaClient();
  const provider = createOpenAIEmbeddingProvider();
  try {
    if (!provider.config.enabled) {
      throw new Error(provider.config.explicitlyEnabled ? 'OPENAI_API_KEY_REQUIRED' : 'CATALOG_EMBEDDINGS_DISABLED');
    }
    const result = await reindexCatalogEmbeddings({
      prisma,
      provider,
      maxProducts: boundedInteger(process.env.CATALOG_REINDEX_MAX_PRODUCTS, 2_000, 1, 2_000),
      batchSize: boundedInteger(process.env.CATALOG_REINDEX_BATCH_SIZE, 20, 1, 50),
    });
    console.info(`Catalog embeddings indexed=${result.indexed} skipped=${result.skipped} deleted=${result.deleted} active=${result.active}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Catalog embedding reindex failed: ${error?.code || error?.message || 'UNKNOWN'}`);
  process.exitCode = 1;
});
