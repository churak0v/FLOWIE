const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BouquetEconomicsError,
  buildRecipeCostSnapshot,
  calculateBouquetEconomics,
  validateRecipe,
} = require('../services/bouquetEconomics');

const AS_OF = '2026-11-25T12:00:00.000Z';
const recipe = [
  { ingredientId: 'rose-red-60', name: 'Роза красная 60 см', quantity: 11, unit: 'stem', supplierId: 'flowers' },
  { ingredientId: 'ribbon-satin', name: 'Лента атласная', quantity: 1.5, unit: 'meter', supplierId: 'packaging' },
];

function price(overrides = {}) {
  return {
    id: 'price-1',
    ingredientId: 'rose-red-60',
    unit: 'stem',
    priceKopecks: 12000,
    effectiveAt: '2026-11-20T08:00:00.000Z',
    confirmed: true,
    supplierId: 'flowers',
    supplier: 'Поставщик цветов',
    source: 'invoice-481',
    ...overrides,
  };
}

test('snapshot selects latest confirmed effective exact SKU and unit with provenance', () => {
  const snapshot = buildRecipeCostSnapshot({
    recipe,
    asOf: AS_OF,
    staleAfterDays: 30,
    purchasePrices: [
      price({ id: 'old', priceKopecks: 11000, effectiveAt: '2026-11-01T00:00:00.000Z' }),
      price({ id: 'unconfirmed', priceKopecks: 10000, effectiveAt: '2026-11-24T00:00:00.000Z', confirmed: false }),
      price({ id: 'future', priceKopecks: 9000, effectiveAt: '2026-11-26T00:00:00.000Z' }),
      price({ id: 'wrong-variant', ingredientId: 'rose-red-50', priceKopecks: 8000 }),
      price({ id: 'wrong-unit', unit: 'bunch', priceKopecks: 7000 }),
      price({ id: 'current', priceKopecks: 12000 }),
      price({
        id: 'ribbon',
        ingredientId: 'ribbon-satin',
        unit: 'meter',
        priceKopecks: 333,
        supplier: 'Упаковка',
        supplierId: 'packaging',
        source: 'invoice-88',
      }),
    ],
  });

  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.ingredientCostKopecks, 132500); // 11 * 12000 + round(1.5 * 333)
  assert.equal(snapshot.lines[0].priceProvenance.priceId, 'current');
  assert.equal(snapshot.lines[0].priceProvenance.source, 'invoice-481');
  assert.equal(snapshot.lines[1].lineCostKopecks, 500);
});

test('missing and stale prices make ingredient economics incomplete rather than zero', () => {
  const snapshot = buildRecipeCostSnapshot({
    recipe,
    asOf: AS_OF,
    staleAfterDays: 7,
    purchasePrices: [price({ effectiveAt: '2026-11-01T00:00:00.000Z' })],
  });

  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.ingredientCostKopecks, null);
  assert.deepEqual(snapshot.issues.map((issue) => issue.code), ['STALE_PRICE', 'MISSING_PRICE']);
  assert.equal(snapshot.lines[0].priceStatus, 'STALE');
  assert.equal(snapshot.lines[0].lineCostKopecks, null);
  assert.equal(snapshot.lines[0].priceProvenance.supplier, 'Поставщик цветов');
  assert.equal(snapshot.lines[1].unitPriceKopecks, null);
});

test('supplier must be selected explicitly and alternatives never choose cheapest silently', () => {
  const line = { ...recipe[0], supplierId: undefined };
  const snapshot = buildRecipeCostSnapshot({
    recipe: [line],
    asOf: AS_OF,
    purchasePrices: [
      price({ supplierId: 'supplier-a', supplier: 'A', priceKopecks: 12000 }),
      price({ supplierId: 'supplier-b', supplier: 'B', priceKopecks: 9000 }),
    ],
  });

  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.issues[0].code, 'MISSING_SUPPLIER_SELECTION');
  assert.equal(snapshot.lines[0].unitPriceKopecks, null);
  assert.deepEqual(snapshot.lines[0].priceAlternatives.map((item) => item.supplierId), ['supplier-a', 'supplier-b']);

  const selected = buildRecipeCostSnapshot({
    recipe: [line],
    asOf: AS_OF,
    selectedSupplierId: 'supplier-a',
    purchasePrices: snapshot.lines[0].priceAlternatives.map((item) => ({
      ...item,
      confirmed: true,
    })),
  });
  assert.equal(selected.complete, true);
  assert.equal(selected.lines[0].unitPriceKopecks, 12000);
});

test('selected supplier without its own confirmed price remains incomplete', () => {
  const snapshot = buildRecipeCostSnapshot({
    recipe: [{ ...recipe[0], supplierId: 'unknown-supplier' }],
    asOf: AS_OF,
    purchasePrices: [price({ supplierId: 'other-supplier' })],
  });

  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.issues[0], {
    code: 'MISSING_PRICE',
    ingredientId: 'rose-red-60',
    unit: 'stem',
    supplierId: 'unknown-supplier',
  });
  assert.equal(snapshot.lines[0].lineCostKopecks, null);
  assert.equal(snapshot.lines[0].priceAlternatives[0].supplierId, 'other-supplier');
});

test('economics separates gross margin, markup, contribution and break-even CAC', () => {
  const result = calculateBouquetEconomics({
    recipe: [recipe[0]],
    purchasePrices: [price({ priceKopecks: 10000 })],
    asOf: AS_OF,
    staleAfterDays: 30,
    sellingPriceKopecks: 200000,
    discountKopecks: 10000,
    packagingCostKopecks: 5000,
    laborCostKopecks: 15000,
    paymentFeeKopecks: 4000,
    deliverySubsidyKopecks: 6000,
    adCacKopecks: 12000,
  });

  assert.equal(result.complete, true);
  assert.equal(result.netRevenueKopecks, 190000);
  assert.equal(result.ingredientCostKopecks, 110000);
  assert.equal(result.cogsKopecks, 130000);
  assert.equal(result.grossProfitKopecks, 60000);
  assert.equal(result.grossMargin, 60000 / 190000);
  assert.equal(result.markup, 60000 / 130000);
  assert.equal(result.contributionBeforeAdsKopecks, 50000);
  assert.equal(result.maxBreakEvenCacKopecks, 50000);
  assert.equal(result.contributionAfterAdsKopecks, 38000);
});

test('missing commercial cost is explicit and only dependent metrics become null', () => {
  const result = calculateBouquetEconomics({
    recipe: [recipe[0]],
    purchasePrices: [price({ priceKopecks: 10000 })],
    asOf: AS_OF,
    sellingPriceKopecks: 200000,
    discountKopecks: 0,
    packagingCostKopecks: 5000,
    laborCostKopecks: 15000,
    paymentFeeKopecks: null,
    deliverySubsidyKopecks: 6000,
    adCacKopecks: 12000,
  });

  assert.equal(result.complete, false);
  assert.deepEqual(result.issues.find((issue) => issue.field === 'paymentFeeKopecks'), {
    code: 'MISSING_COST',
    field: 'paymentFeeKopecks',
  });
  assert.equal(result.grossProfitKopecks, 70000);
  assert.equal(result.contributionBeforeAdsKopecks, null);
  assert.equal(result.contributionAfterAdsKopecks, null);
  assert.equal(result.maxBreakEvenCacKopecks, null);
});

test('negative break-even CAC exposes a bouquet that loses money before ads', () => {
  const result = calculateBouquetEconomics({
    recipe: [recipe[0]],
    purchasePrices: [price({ priceKopecks: 10000 })],
    asOf: AS_OF,
    sellingPriceKopecks: 100000,
    discountKopecks: 0,
    packagingCostKopecks: 5000,
    laborCostKopecks: 5000,
    paymentFeeKopecks: 1000,
    deliverySubsidyKopecks: 2000,
    adCacKopecks: 0,
  });

  assert.equal(result.contributionBeforeAdsKopecks, -23000);
  assert.equal(result.maxBreakEvenCacKopecks, -23000);
});

test('recipe and monetary validation rejects ambiguous or unsafe input', () => {
  assert.throws(
    () => validateRecipe([...recipe, { ...recipe[0], name: 'Дубликат' }]),
    (error) => error instanceof BouquetEconomicsError && error.code === 'DUPLICATE_RECIPE_LINE',
  );
  assert.throws(
    () => validateRecipe([{ ...recipe[0], quantity: 0 }]),
    (error) => error.code === 'INVALID_QUANTITY',
  );
  assert.throws(
    () => calculateBouquetEconomics({
      recipe: [recipe[0]],
      purchasePrices: [price()],
      asOf: AS_OF,
      sellingPriceKopecks: 1000,
      discountKopecks: 1001,
      packagingCostKopecks: 0,
      laborCostKopecks: 0,
      paymentFeeKopecks: 0,
      deliverySubsidyKopecks: 0,
      adCacKopecks: 0,
    }),
    (error) => error.code === 'DISCOUNT_EXCEEDS_SELLING_PRICE',
  );
});
