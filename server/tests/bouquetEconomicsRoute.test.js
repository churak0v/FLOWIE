'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createBouquetEconomicsRouter } = require('../routes/bouquetEconomics');

function createPrisma({ role = 'admin', active = true } = {}) {
  const state = { prices: [], recipes: [], recipeUpdates: [] };
  let sequence = 0;
  const prisma = {
    user: {
      findUnique: async () => ({ id: 7, staffRole: role, staffActive: active }),
    },
    flowerPurchasePrice: {
      create: async ({ data }) => {
        const row = { id: `price-${++sequence}`, createdAt: new Date('2026-11-25T10:00:00Z'), ...data };
        state.prices.push(row);
        return row;
      },
      findMany: async () => [...state.prices]
        .sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt)),
    },
    bouquetRecipe: {
      create: async ({ data }) => {
        const row = {
          id: `recipe-${++sequence}`,
          createdAt: new Date('2026-11-25T10:00:00Z'),
          updatedAt: new Date('2026-11-25T10:00:00Z'),
          ...data,
        };
        state.recipes.push(row);
        return row;
      },
      findUnique: async ({ where }) => state.recipes.find((row) => row.id === where.id) || null,
      findMany: async ({ where, take }) => state.recipes.filter((row) => row.importId === where.importId).slice(0, take),
      update: async ({ where, data }) => {
        const row = state.recipes.find((item) => item.id === where.id);
        if (!row) throw Object.assign(new Error('missing'), { code: 'P2025' });
        Object.assign(row, data);
        state.recipeUpdates.push(data);
        return row;
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  return { prisma, state };
}

async function withServer({ prisma, authenticated = true }, run) {
  const app = express();
  app.use(express.json());
  if (authenticated) app.use((req, _res, next) => { req.user = { id: 7 }; next(); });
  app.use('/api/admin/bouquet-economics', createBouquetEconomicsRouter({ prisma }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(base, path, options = {}) {
  const headers = { origin: base, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers };
  const response = await fetch(`${base}/api/admin/bouquet-economics${path}`, { ...options, headers });
  return { status: response.status, body: await response.json() };
}

function price(overrides = {}) {
  return {
    supplierId: 'supplier-a',
    ingredientId: 'rose-red-60',
    name: 'Роза красная 60 см',
    unit: 'stem',
    priceKopecks: 10000,
    effectiveAt: '2026-11-20T00:00:00.000Z',
    source: 'invoice-10',
    confirmed: true,
    ...overrides,
  };
}

function recipe(overrides = {}) {
  return {
    name: '11 красных роз',
    lines: [{
      ingredientId: 'rose-red-60',
      name: 'Роза красная 60 см',
      quantity: 11,
      unit: 'stem',
      supplierId: 'supplier-a',
    }],
    costs: {
      sellingPriceKopecks: 200000,
      packagingCostKopecks: 5000,
      laborCostKopecks: 15000,
      paymentFeeKopecks: 4000,
      discountKopecks: 0,
      deliverySubsidyKopecks: 6000,
      adCacKopecks: 12000,
    },
    ...overrides,
  };
}

test('all endpoints require authentication and active bouquet staff without leaking data', async () => {
  const unauthenticated = createPrisma();
  await withServer({ prisma: unauthenticated.prisma, authenticated: false }, async (base) => {
    const result = await request(base, '/prices');
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { ok: false, error: 'UNAUTHORIZED' });
  });

  const inactive = createPrisma({ active: false });
  inactive.state.prices.push({ id: 'private-price', ...price(), createdAt: new Date() });
  await withServer({ prisma: inactive.prisma }, async (base) => {
    const result = await request(base, '/prices');
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, { ok: false, error: 'FORBIDDEN' });
    assert.equal(JSON.stringify(result.body).includes('private-price'), false);
  });
});

test('price ingestion requires admin or moderator and explicit confirmation', async () => {
  const florist = createPrisma({ role: 'florist' });
  await withServer({ prisma: florist.prisma }, async (base) => {
    const denied = await request(base, '/prices', { method: 'POST', body: JSON.stringify({ prices: [price()] }) });
    assert.equal(denied.status, 403);
    assert.equal(florist.state.prices.length, 0);
  });

  const moderator = createPrisma({ role: 'moderator' });
  await withServer({ prisma: moderator.prisma }, async (base) => {
    const unconfirmed = await request(base, '/prices', {
      method: 'POST',
      body: JSON.stringify({ prices: [price({ confirmed: false })] }),
    });
    assert.equal(unconfirmed.status, 400);
    assert.equal(unconfirmed.body.error, 'PRICE_CONFIRMATION_REQUIRED');

    const saved = await request(base, '/prices', { method: 'POST', body: JSON.stringify({ prices: [price()] }) });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.prices[0].supplierId, 'supplier-a');
    assert.equal(moderator.state.prices.length, 1);
  });
});

test('quote rereads current DB prices and honors the selected supplier, not the cheapest alternative', async () => {
  const { prisma, state } = createPrisma({ role: 'florist' });
  state.prices.push(
    { id: 'a', createdAt: new Date(), ...price({ supplierId: 'supplier-a', priceKopecks: 10000 }) },
    { id: 'b', createdAt: new Date(), ...price({ supplierId: 'supplier-b', priceKopecks: 5000 }) },
  );
  state.recipes.push({
    id: 'recipe-mixed',
    ...recipe(),
    snapshot: { quote: { ingredientCostKopecks: 1 } },
  });

  await withServer({ prisma }, async (base) => {
    const quoted = await request(base, '/recipes/recipe-mixed/quote', {
      method: 'POST',
      body: JSON.stringify({ asOf: '2026-11-25T12:00:00.000Z' }),
    });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.quote.ingredientCostKopecks, 110000);
    assert.equal(quoted.body.quote.recipeSnapshot.lines[0].selectedSupplierId, 'supplier-a');
    assert.deepEqual(
      quoted.body.quote.recipeSnapshot.lines[0].priceAlternatives.map((item) => item.supplierId),
      ['supplier-a', 'supplier-b'],
    );
    assert.equal(state.recipeUpdates.length, 1);
    assert.equal(state.recipeUpdates[0].snapshot.quote.ingredientCostKopecks, 110000);
  });
});

test('draft recipes preserve explicit missing costs and quote only nulls dependent metrics', async () => {
  const { prisma, state } = createPrisma({ role: 'florist' });
  state.prices.push({ id: 'a', createdAt: new Date(), ...price() });
  await withServer({ prisma }, async (base) => {
    const draft = recipe({ costs: { sellingPriceKopecks: 200000, discountKopecks: 0 } });
    const saved = await request(base, '/recipes', { method: 'POST', body: JSON.stringify(draft) });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.recipe.snapshot, null);
    assert.equal(saved.body.recipe.costs.packagingCostKopecks, null);

    const quoted = await request(base, `/recipes/${saved.body.recipe.id}/quote`, {
      method: 'POST',
      body: JSON.stringify({ asOf: '2026-11-25T12:00:00.000Z' }),
    });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.quote.complete, false);
    assert.equal(quoted.body.quote.ingredientCostKopecks, 110000);
    assert.equal(quoted.body.quote.cogsKopecks, null);
    assert.equal(quoted.body.quote.issues.some((issue) => issue.field === 'packagingCostKopecks'), true);
  });
});

test('human confirmation permits missing prices, while later edits reset confirmation and snapshot', async () => {
  const { prisma, state } = createPrisma({ role: 'florist' });
  state.recipes.push({
    id: 'recipe-human',
    importId: 'telegram-import-4',
    productId: null,
    ...recipe(),
    snapshot: { old: true },
    confirmedAt: null,
  });
  await withServer({ prisma }, async (base) => {
    const confirmed = await request(base, '/recipes/recipe-human/confirm', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(confirmed.status, 200);
    assert.ok(confirmed.body.recipe.confirmedAt);
    assert.equal(state.prices.length, 0);

    const invalid = await request(base, '/recipes/recipe-human', {
      method: 'PATCH',
      body: JSON.stringify({ aiConfidence: 0.99 }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'INVALID_RECIPE_PATCH');

    const edited = await request(base, '/recipes/recipe-human', {
      method: 'PATCH',
      body: JSON.stringify({
        lines: [{ ...recipe().lines[0], quantity: 15 }],
        costs: { laborCostKopecks: 18000 },
      }),
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.recipe.lines[0].quantity, 15);
    assert.equal(edited.body.recipe.costs.laborCostKopecks, 18000);
    assert.equal(edited.body.recipe.snapshot, null);
    assert.equal(edited.body.recipe.confirmedAt, null);
  });
});

test('worker draft lookup is bounded to an explicit import id', async () => {
  const { prisma, state } = createPrisma({ role: 'florist' });
  state.recipes.push(
    { id: 'one', importId: 'import-1', ...recipe() },
    { id: 'two', importId: 'import-2', ...recipe() },
  );
  await withServer({ prisma }, async (base) => {
    const missing = await request(base, '/recipes');
    assert.equal(missing.status, 400);
    const found = await request(base, '/recipes?importId=import-1&limit=10');
    assert.equal(found.status, 200);
    assert.deepEqual(found.body.recipes.map((item) => item.id), ['one']);
    const excessive = await request(base, '/recipes?importId=import-1&limit=101');
    assert.equal(excessive.status, 400);
  });
});

test('price listing reports when its bounded source scan is truncated', async () => {
  const { prisma } = createPrisma();
  prisma.flowerPurchasePrice.findMany = async () => Array.from({ length: 1001 }, (_, index) => ({
    id: `p-${index}`,
    createdAt: new Date(),
    ...price({ ingredientId: `sku-${index}` }),
  }));
  await withServer({ prisma }, async (base) => {
    const listed = await request(base, '/prices?limit=1');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.scan, { limit: 1000, scanned: 1000, truncated: true });
  });
});
