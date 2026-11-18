const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { CatalogSearchError, createCatalogSearchService } = require('../services/catalogSearch');

function createRateLimiter({ max = 30, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    consume(key) {
      const current = now();
      const normalized = String(key || 'unknown').slice(0, 200);
      if (buckets.size >= 10_000 && !buckets.has(normalized)) buckets.delete(buckets.keys().next().value);
      const existing = buckets.get(normalized);
      if (!existing || current - existing.startedAt >= windowMs) {
        buckets.set(normalized, { startedAt: current, count: 1 });
        return { allowed: true, retryAfter: 0 };
      }
      existing.count += 1;
      return {
        allowed: existing.count <= max,
        retryAfter: Math.max(1, Math.ceil((windowMs - (current - existing.startedAt)) / 1000)),
      };
    },
  };
}

function createSearchRouter({ prisma = new PrismaClient(), service, rateLimiter = createRateLimiter() } = {}) {
  const router = express.Router();
  const catalogSearch = service || createCatalogSearchService({ prisma });

  router.post('/catalog', async (req, res) => {
    const limit = rateLimiter.consume(req.ip || req.socket?.remoteAddress || 'unknown');
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      return res.status(429).json({ ok: false, error: 'SEARCH_RATE_LIMITED' });
    }
    try {
      const result = await catalogSearch.search(req.body);
      return res.json(result);
    } catch (error) {
      if (error instanceof CatalogSearchError) {
        return res.status(error.status).json({ ok: false, error: error.code });
      }
      return res.status(500).json({ ok: false, error: 'CATALOG_SEARCH_FAILED' });
    }
  });

  return router;
}

module.exports = createSearchRouter();
module.exports.createRateLimiter = createRateLimiter;
module.exports.createSearchRouter = createSearchRouter;
