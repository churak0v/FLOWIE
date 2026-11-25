'use strict';

const express = require('express');
const { requireAuth, requireSameOrigin } = require('../middleware/auth');
const {
  BouquetEconomicsError,
  calculateBouquetEconomics,
  validateRecipe,
} = require('../services/bouquetEconomics');

const READ_ROLES = new Set(['admin', 'moderator', 'florist']);
const PRICE_WRITE_ROLES = new Set(['admin', 'moderator']);
const MAX_PRICE_BATCH = 100;
const MAX_RECIPE_LINES = 100;
const MAX_QUANTITY = 10000;
const MAX_PRICE_QUERY = 100;
const COST_KEYS = new Set([
  'sellingPriceKopecks',
  'packagingCostKopecks',
  'laborCostKopecks',
  'paymentFeeKopecks',
  'discountKopecks',
  'deliverySubsidyKopecks',
  'adCacKopecks',
  'staleAfterDays',
  'selectedSupplierId',
]);

class ApiError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function boundedString(value, field, max, { optional = false } = {}) {
  if (optional && value == null) return null;
  if (typeof value !== 'string') throw new ApiError(`INVALID_${field.toUpperCase()}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ApiError(`INVALID_${field.toUpperCase()}`);
  return normalized;
}

function positiveId(value, field, { optional = false } = {}) {
  if (optional && value == null) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(`INVALID_${field.toUpperCase()}`);
  return id;
}

function money(value, field, { optional = false } = {}) {
  if (optional && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(`INVALID_${field.toUpperCase()}`);
  return value;
}

function onlyKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(code);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ApiError(code);
}

function normalizePrice(row) {
  onlyKeys(row, new Set([
    'supplierId', 'ingredientId', 'name', 'unit', 'priceKopecks', 'effectiveAt', 'source', 'confirmed',
  ]), 'INVALID_PRICE');
  if (row.confirmed !== true) throw new ApiError('PRICE_CONFIRMATION_REQUIRED');
  const effectiveAt = new Date(row.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())) throw new ApiError('INVALID_EFFECTIVE_AT');
  return {
    supplierId: boundedString(row.supplierId, 'supplier_id', 100),
    ingredientId: boundedString(row.ingredientId, 'ingredient_id', 160),
    name: boundedString(row.name, 'name', 240),
    unit: boundedString(row.unit, 'unit', 40),
    priceKopecks: money(row.priceKopecks, 'price_kopecks'),
    effectiveAt,
    source: boundedString(row.source, 'source', 500),
    confirmed: true,
  };
}

function normalizeCosts(raw) {
  onlyKeys(raw, COST_KEYS, 'INVALID_COSTS');
  const costs = {};
  for (const key of COST_KEYS) {
    if (key === 'selectedSupplierId') {
      costs[key] = boundedString(raw[key], 'selected_supplier_id', 100, { optional: true });
    } else if (key === 'staleAfterDays') {
      const value = raw[key];
      if (value == null) costs[key] = 30;
      else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 3650) {
        throw new ApiError('INVALID_STALE_AFTER_DAYS');
      } else costs[key] = value;
    } else {
      costs[key] = money(raw[key], key, { optional: true });
    }
  }
  return costs;
}

function normalizeRecipeBody(body) {
  onlyKeys(body, new Set(['name', 'productId', 'importId', 'lines', 'costs']), 'INVALID_RECIPE');
  if (!Array.isArray(body.lines) || body.lines.length > MAX_RECIPE_LINES) throw new ApiError('INVALID_RECIPE_LINES');
  for (const line of body.lines) {
    onlyKeys(line, new Set(['ingredientId', 'name', 'quantity', 'unit', 'supplierId']), 'INVALID_RECIPE_LINE');
  }
  const lines = validateRecipe(body.lines);
  if (lines.some((line) => line.quantity > MAX_QUANTITY)) throw new ApiError('QUANTITY_LIMIT_EXCEEDED');
  return {
    name: boundedString(body.name, 'name', 240),
    productId: positiveId(body.productId, 'product_id', { optional: true }),
    importId: boundedString(body.importId, 'import_id', 160, { optional: true }),
    lines,
    costs: normalizeCosts(body.costs),
    snapshot: null,
    confirmedAt: null,
  };
}

function publicPrice(row) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    ingredientId: row.ingredientId,
    name: row.name,
    unit: row.unit,
    priceKopecks: row.priceKopecks,
    effectiveAt: row.effectiveAt,
    source: row.source,
    confirmed: row.confirmed,
    createdAt: row.createdAt,
  };
}

function sendError(res, error, fallback) {
  if (error instanceof ApiError) return res.status(error.status).json({ ok: false, error: error.code });
  if (error instanceof BouquetEconomicsError) return res.status(400).json({ ok: false, error: error.code, details: error.details });
  if (error?.code === 'P2025') return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  return res.status(500).json({ ok: false, error: fallback });
}

function createBouquetEconomicsRouter({ prisma }) {
  if (!prisma) throw new TypeError('prisma is required');
  const router = express.Router();

  router.use(requireSameOrigin, requireAuth, async (req, res, next) => {
    try {
      const staff = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, staffRole: true, staffActive: true },
      });
      if (!staff?.staffActive || !READ_ROLES.has(staff.staffRole)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }
      req.bouquetStaff = staff;
      return next();
    } catch {
      return res.status(500).json({ ok: false, error: 'STAFF_LOOKUP_FAILED' });
    }
  });

  router.post('/prices', async (req, res) => {
    if (!PRICE_WRITE_ROLES.has(req.bouquetStaff.staffRole)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    try {
      onlyKeys(req.body, new Set(['prices']), 'INVALID_PRICE_BATCH');
      if (!Array.isArray(req.body.prices) || req.body.prices.length < 1 || req.body.prices.length > MAX_PRICE_BATCH) {
        throw new ApiError('INVALID_PRICE_BATCH');
      }
      const data = req.body.prices.map(normalizePrice);
      const prices = await prisma.$transaction(data.map((entry) => prisma.flowerPurchasePrice.create({ data: entry })));
      return res.status(201).json({ ok: true, prices: prices.map(publicPrice) });
    } catch (error) {
      return sendError(res, error, 'PRICE_SAVE_FAILED');
    }
  });

  router.get('/prices', async (req, res) => {
    try {
      if (Object.keys(req.query).some((key) => !['supplierId', 'limit'].includes(key))) throw new ApiError('INVALID_QUERY');
      const supplierId = req.query.supplierId == null
        ? null
        : boundedString(req.query.supplierId, 'supplier_id', 100);
      const limit = req.query.limit == null ? 50 : Number(req.query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PRICE_QUERY) throw new ApiError('INVALID_LIMIT');
      const rows = await prisma.flowerPurchasePrice.findMany({
        where: {
          confirmed: true,
          effectiveAt: { lte: new Date() },
          ...(supplierId ? { supplierId } : {}),
        },
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        take: 1001,
      });
      const seen = new Set();
      const latest = [];
      for (const row of rows.slice(0, 1000)) {
        const key = `${row.supplierId}\u0000${row.ingredientId}\u0000${row.unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latest.push(publicPrice(row));
        if (latest.length === limit) break;
      }
      return res.json({
        ok: true,
        prices: latest,
        scan: { limit: 1000, scanned: Math.min(rows.length, 1000), truncated: rows.length > 1000 },
      });
    } catch (error) {
      return sendError(res, error, 'PRICE_LIST_FAILED');
    }
  });

  router.post('/recipes', async (req, res) => {
    try {
      const data = normalizeRecipeBody(req.body);
      const recipe = await prisma.bouquetRecipe.create({ data });
      return res.status(201).json({ ok: true, recipe });
    } catch (error) {
      return sendError(res, error, 'RECIPE_SAVE_FAILED');
    }
  });

  router.get('/recipes', async (req, res) => {
    try {
      if (Object.keys(req.query).some((key) => !['importId', 'limit'].includes(key))) throw new ApiError('INVALID_QUERY');
      const importId = boundedString(req.query.importId, 'import_id', 160);
      const limit = req.query.limit == null ? 50 : Number(req.query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ApiError('INVALID_LIMIT');
      const recipes = await prisma.bouquetRecipe.findMany({
        where: { importId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: limit,
      });
      return res.json({ ok: true, recipes });
    } catch (error) {
      return sendError(res, error, 'RECIPE_LIST_FAILED');
    }
  });

  router.get('/recipes/:id', async (req, res) => {
    try {
      const id = boundedString(req.params.id, 'id', 100);
      const recipe = await prisma.bouquetRecipe.findUnique({ where: { id } });
      if (!recipe) throw new ApiError('NOT_FOUND', 404);
      return res.json({ ok: true, recipe });
    } catch (error) {
      return sendError(res, error, 'RECIPE_READ_FAILED');
    }
  });

  router.patch('/recipes/:id', async (req, res) => {
    try {
      onlyKeys(req.body, new Set(['name', 'productId', 'importId', 'lines', 'costs']), 'INVALID_RECIPE_PATCH');
      if (Object.keys(req.body).length === 0) throw new ApiError('INVALID_RECIPE_PATCH');
      const id = boundedString(req.params.id, 'id', 100);
      const current = await prisma.bouquetRecipe.findUnique({ where: { id } });
      if (!current) throw new ApiError('NOT_FOUND', 404);
      if (Object.hasOwn(req.body, 'costs')) onlyKeys(req.body.costs, COST_KEYS, 'INVALID_COSTS');
      const merged = {
        name: Object.hasOwn(req.body, 'name') ? req.body.name : current.name,
        productId: Object.hasOwn(req.body, 'productId') ? req.body.productId : current.productId,
        importId: Object.hasOwn(req.body, 'importId') ? req.body.importId : current.importId,
        lines: Object.hasOwn(req.body, 'lines') ? req.body.lines : current.lines,
        costs: Object.hasOwn(req.body, 'costs') ? { ...current.costs, ...req.body.costs } : current.costs,
      };
      const normalized = normalizeRecipeBody(merged);
      const recipe = await prisma.bouquetRecipe.update({
        where: { id },
        data: { ...normalized, snapshot: null, confirmedAt: null },
      });
      return res.json({ ok: true, recipe });
    } catch (error) {
      return sendError(res, error, 'RECIPE_UPDATE_FAILED');
    }
  });

  router.post('/recipes/:id/confirm', async (req, res) => {
    try {
      onlyKeys(req.body || {}, new Set(), 'INVALID_CONFIRMATION');
      const id = boundedString(req.params.id, 'id', 100);
      const current = await prisma.bouquetRecipe.findUnique({ where: { id } });
      if (!current) throw new ApiError('NOT_FOUND', 404);
      // Confirmation is a human decision about composition. It deliberately does
      // not require, select, or infer purchase prices.
      normalizeRecipeBody({
        name: current.name,
        productId: current.productId,
        importId: current.importId,
        lines: current.lines,
        costs: current.costs,
      });
      const recipe = await prisma.bouquetRecipe.update({
        where: { id },
        data: { confirmedAt: new Date() },
      });
      return res.json({ ok: true, recipe });
    } catch (error) {
      return sendError(res, error, 'RECIPE_CONFIRM_FAILED');
    }
  });

  router.post('/recipes/:id/quote', async (req, res) => {
    try {
      onlyKeys(req.body || {}, new Set(['asOf']), 'INVALID_QUOTE');
      const id = boundedString(req.params.id, 'id', 100);
      const asOf = req.body?.asOf == null ? new Date() : new Date(req.body.asOf);
      if (!Number.isFinite(asOf.getTime())) throw new ApiError('INVALID_AS_OF');
      const recipe = await prisma.bouquetRecipe.findUnique({ where: { id } });
      if (!recipe) throw new ApiError('NOT_FOUND', 404);
      const lines = validateRecipe(recipe.lines);
      const ingredientIds = [...new Set(lines.map((line) => line.ingredientId))];
      const rows = await prisma.flowerPurchasePrice.findMany({
        where: { confirmed: true, ingredientId: { in: ingredientIds }, effectiveAt: { lte: asOf } },
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        take: 5000,
      });
      const costs = normalizeCosts(recipe.costs);
      const quote = calculateBouquetEconomics({
        recipe: lines,
        purchasePrices: rows.map((row) => ({ ...row, supplier: row.supplierId })),
        asOf,
        ...costs,
      });
      const snapshot = { quotedAt: asOf.toISOString(), quote };
      await prisma.bouquetRecipe.update({ where: { id }, data: { snapshot } });
      return res.json({ ok: true, quote });
    } catch (error) {
      return sendError(res, error, 'QUOTE_FAILED');
    }
  });

  return router;
}

module.exports = {
  createBouquetEconomicsRouter,
  _test: { normalizeCosts, normalizePrice, normalizeRecipeBody },
};
