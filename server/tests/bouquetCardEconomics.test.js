'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BouquetCardError, getCardEconomics, parseNaturalComposition } = require('../services/bouquetCardEconomics');

test('ordinary Russian composition parses commas, newlines, semicolons and decimal quantities', () => {
  const lines = parseNaturalComposition('Роза Пинк Флойд 9 шт, эвкалипт 2 ветки\nЛента 1,5 м; Пион 3 шт.');
  assert.deepEqual(lines.map((line) => [line.name, line.quantity, line.unit]), [
    ['Роза Пинк Флойд', 9, 'шт'], ['эвкалипт', 2, 'ветки'], ['Лента', 1.5, 'м'], ['Пион', 3, 'шт'],
  ]);
  assert.equal(lines.every((line) => /^draft:[0-9a-f]{24}$/.test(line.ingredientId)), true);
  assert.equal(lines.every((line) => line.supplierId === null), true);
});

test('ambiguous natural text gets a short friendly error', () => {
  for (const input of ['Роза девять штук', '9 шт', 'Роза 5 красная 9 шт']) {
    assert.throws(() => parseNaturalComposition(input), (error) => error instanceof BouquetCardError && error.message.length < 100);
  }
});

function price(overrides = {}) { return { id: 'p1', ingredientId: 'rose-60', name: 'Роза', unit: 'шт',
  supplierId: 'supplier-a', priceKopecks: 10000, effectiveAt: new Date('2026-11-24T00:00:00Z'),
  createdAt: new Date('2026-11-24T00:00:00Z'), source: 'invoice', confirmed: true, ...overrides }; }
function prisma(prices) { return { flowerPurchasePrice: { findMany: async () => prices } }; }
function recipe(overrides = {}) { return { confirmedAt: new Date(), costs: { staleAfterDays: 30 },
  lines: [{ ingredientId: 'rose-60', name: 'Роза', quantity: 9, unit: 'шт', supplierId: 'supplier-a' }], ...overrides }; }

test('confirmed card uses only exact selected supplier and never the cheapest alternative', async () => {
  const result = await getCardEconomics({ prisma: prisma([
    price({ supplierId: 'supplier-b', priceKopecks: 5000 }), price({ supplierId: 'supplier-a', priceKopecks: 10000 }),
  ]), recipe: recipe(), asOf: '2026-11-25T00:00:00Z' });
  assert.equal(result.confirmed, true);
  assert.equal(result.totalPurchaseKopecks, 90000);
  assert.equal(result.lines[0].selectedSupplierId, 'supplier-a');
  assert.deepEqual(result.missingPrices, []);
});

test('unconfirmed composition never presents an exact purchase total', async () => {
  const result = await getCardEconomics({ prisma: prisma([price()]),
    recipe: recipe({ confirmedAt: null }), asOf: '2026-11-25T00:00:00Z' });
  assert.equal(result.confirmed, false);
  assert.equal(result.totalPurchaseKopecks, null);
  assert.equal(result.missingPrices[0].reason, 'UNCONFIRMED_RECIPE');
});

test('draft SKU or missing supplier reports no price instead of guessing', async () => {
  const parsed = parseNaturalComposition('Роза 9 шт');
  const result = await getCardEconomics({ prisma: prisma([price()]),
    recipe: recipe({ lines: parsed }), asOf: '2026-11-25T00:00:00Z' });
  assert.equal(result.totalPurchaseKopecks, null);
  assert.equal(result.missingPrices[0].reason, 'MISSING_SUPPLIER_SELECTION');
});
