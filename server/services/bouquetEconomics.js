const DAY_MS = 24 * 60 * 60 * 1000;

class BouquetEconomicsError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BouquetEconomicsError('INVALID_FIELD', { field });
  }
  return value.trim();
}

function finiteDate(value, field) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BouquetEconomicsError('INVALID_DATE', { field });
  }
  return date;
}

function nonNegativeKopecks(value, field, { optional = false } = {}) {
  if (optional && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BouquetEconomicsError('INVALID_MONEY', { field });
  }
  return value;
}

function validateRecipe(recipe) {
  if (!Array.isArray(recipe) || recipe.length === 0) {
    throw new BouquetEconomicsError('RECIPE_REQUIRED');
  }

  const seen = new Set();
  return recipe.map((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new BouquetEconomicsError('INVALID_RECIPE_LINE', { index });
    }
    const ingredientId = nonEmptyString(line.ingredientId, `recipe[${index}].ingredientId`);
    const name = nonEmptyString(line.name, `recipe[${index}].name`);
    const unit = nonEmptyString(line.unit, `recipe[${index}].unit`);
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new BouquetEconomicsError('INVALID_QUANTITY', { index });
    }
    const key = `${ingredientId}\u0000${unit}`;
    if (seen.has(key)) {
      throw new BouquetEconomicsError('DUPLICATE_RECIPE_LINE', { index, ingredientId, unit });
    }
    seen.add(key);
    const supplierId = line.supplierId == null
      ? null
      : nonEmptyString(line.supplierId, `recipe[${index}].supplierId`);
    return { ingredientId, name, quantity: line.quantity, unit, supplierId };
  });
}

function selectEffectivePurchasePrice(line, purchasePrices, asOf, selectedSupplierId = line.supplierId) {
  if (!Array.isArray(purchasePrices)) {
    throw new BouquetEconomicsError('PURCHASE_PRICES_REQUIRED');
  }
  if (selectedSupplierId == null) return null;
  const supplierId = nonEmptyString(selectedSupplierId, 'selectedSupplierId');
  const at = finiteDate(asOf, 'asOf');
  const candidates = purchasePrices
    .filter((row) => row
      && row.confirmed === true
      && row.ingredientId === line.ingredientId
      && row.unit === line.unit
      && row.supplierId === supplierId)
    .map((row, index) => ({ row, index, effectiveAt: finiteDate(row.effectiveAt, `purchasePrices[${index}].effectiveAt`) }))
    .filter(({ effectiveAt }) => effectiveAt.getTime() <= at.getTime())
    .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());

  if (candidates.length === 0) return null;
  const selected = candidates[0];
  const row = selected.row;
  return {
    priceId: row.id == null ? null : String(row.id),
    ingredientId: line.ingredientId,
    unit: line.unit,
    supplierId,
    priceKopecks: nonNegativeKopecks(row.priceKopecks, `purchasePrices[${selected.index}].priceKopecks`),
    effectiveAt: selected.effectiveAt.toISOString(),
    supplier: nonEmptyString(row.supplier, `purchasePrices[${selected.index}].supplier`),
    source: nonEmptyString(row.source, `purchasePrices[${selected.index}].source`),
  };
}

function effectiveSupplierAlternatives(line, purchasePrices, asOf) {
  const supplierIds = [...new Set(purchasePrices
    .filter((row) => row
      && row.confirmed === true
      && row.ingredientId === line.ingredientId
      && row.unit === line.unit
      && typeof row.supplierId === 'string'
      && row.supplierId.trim())
    .map((row) => row.supplierId))];
  return supplierIds
    .map((supplierId) => selectEffectivePurchasePrice(line, purchasePrices, asOf, supplierId))
    .filter(Boolean)
    .sort((a, b) => a.supplierId.localeCompare(b.supplierId));
}

function buildRecipeCostSnapshot({ recipe, purchasePrices, asOf, staleAfterDays = 30, selectedSupplierId = null }) {
  const normalizedRecipe = validateRecipe(recipe);
  const snapshotAt = finiteDate(asOf, 'asOf');
  if (!Array.isArray(purchasePrices)) throw new BouquetEconomicsError('PURCHASE_PRICES_REQUIRED');
  const scenarioSupplierId = selectedSupplierId == null
    ? null
    : nonEmptyString(selectedSupplierId, 'selectedSupplierId');
  if (typeof staleAfterDays !== 'number' || !Number.isFinite(staleAfterDays) || staleAfterDays < 0) {
    throw new BouquetEconomicsError('INVALID_STALE_AFTER_DAYS');
  }

  const issues = [];
  const lines = normalizedRecipe.map((line) => {
    const supplierId = line.supplierId || scenarioSupplierId;
    const alternatives = effectiveSupplierAlternatives(line, purchasePrices, snapshotAt).map((candidate) => {
      const ageDays = (snapshotAt.getTime() - new Date(candidate.effectiveAt).getTime()) / DAY_MS;
      return {
        ...candidate,
        priceStatus: ageDays > staleAfterDays ? 'STALE' : 'CURRENT',
        lineCostKopecks: ageDays > staleAfterDays ? null : Math.round(line.quantity * candidate.priceKopecks),
      };
    });
    if (!supplierId) {
      const issue = { code: 'MISSING_SUPPLIER_SELECTION', ingredientId: line.ingredientId, unit: line.unit };
      issues.push(issue);
      return {
        ...line,
        selectedSupplierId: null,
        priceStatus: 'MISSING',
        unitPriceKopecks: null,
        lineCostKopecks: null,
        priceProvenance: null,
        priceAlternatives: alternatives,
      };
    }
    const price = selectEffectivePurchasePrice(line, purchasePrices, snapshotAt, supplierId);
    if (!price) {
      const issue = { code: 'MISSING_PRICE', ingredientId: line.ingredientId, unit: line.unit, supplierId };
      issues.push(issue);
      return {
        ...line,
        selectedSupplierId: supplierId,
        priceStatus: 'MISSING',
        unitPriceKopecks: null,
        lineCostKopecks: null,
        priceProvenance: null,
        priceAlternatives: alternatives,
      };
    }

    const ageDays = (snapshotAt.getTime() - new Date(price.effectiveAt).getTime()) / DAY_MS;
    if (ageDays > staleAfterDays) {
      const issue = {
        code: 'STALE_PRICE',
        ingredientId: line.ingredientId,
        unit: line.unit,
        effectiveAt: price.effectiveAt,
        ageDays,
      };
      issues.push(issue);
      return {
        ...line,
        selectedSupplierId: supplierId,
        priceStatus: 'STALE',
        unitPriceKopecks: price.priceKopecks,
        lineCostKopecks: null,
        priceProvenance: price,
        priceAlternatives: alternatives,
      };
    }

    return {
      ...line,
      selectedSupplierId: supplierId,
      priceStatus: 'CURRENT',
      unitPriceKopecks: price.priceKopecks,
      lineCostKopecks: Math.round(line.quantity * price.priceKopecks),
      priceProvenance: price,
      priceAlternatives: alternatives,
    };
  });
  const complete = issues.length === 0;
  return {
    asOf: snapshotAt.toISOString(),
    staleAfterDays,
    complete,
    issues,
    lines,
    ingredientCostKopecks: complete
      ? lines.reduce((sum, line) => sum + line.lineCostKopecks, 0)
      : null,
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function calculateBouquetEconomics({
  recipe,
  purchasePrices,
  asOf,
  staleAfterDays = 30,
  selectedSupplierId = null,
  sellingPriceKopecks,
  packagingCostKopecks,
  laborCostKopecks,
  paymentFeeKopecks,
  discountKopecks,
  deliverySubsidyKopecks,
  adCacKopecks,
}) {
  const recipeSnapshot = buildRecipeCostSnapshot({
    recipe,
    purchasePrices,
    asOf,
    staleAfterDays,
    selectedSupplierId,
  });
  const sellingPrice = nonNegativeKopecks(sellingPriceKopecks, 'sellingPriceKopecks');
  const suppliedCosts = {
    packagingCostKopecks,
    laborCostKopecks,
    paymentFeeKopecks,
    discountKopecks,
    deliverySubsidyKopecks,
    adCacKopecks,
  };
  const costs = {};
  const issues = [...recipeSnapshot.issues];
  for (const [field, value] of Object.entries(suppliedCosts)) {
    costs[field] = nonNegativeKopecks(value, field, { optional: true });
    if (costs[field] == null) issues.push({ code: 'MISSING_COST', field });
  }
  if (costs.discountKopecks != null && costs.discountKopecks > sellingPrice) {
    throw new BouquetEconomicsError('DISCOUNT_EXCEEDS_SELLING_PRICE');
  }

  const netRevenueKopecks = costs.discountKopecks == null ? null : sellingPrice - costs.discountKopecks;
  const cogsComplete = recipeSnapshot.complete
    && costs.packagingCostKopecks != null
    && costs.laborCostKopecks != null;
  const cogsKopecks = cogsComplete
    ? recipeSnapshot.ingredientCostKopecks + costs.packagingCostKopecks + costs.laborCostKopecks
    : null;
  const grossProfitKopecks = cogsKopecks == null || netRevenueKopecks == null
    ? null
    : netRevenueKopecks - cogsKopecks;
  const contributionBeforeAdsKopecks = grossProfitKopecks == null
    || costs.paymentFeeKopecks == null
    || costs.deliverySubsidyKopecks == null
    ? null
    : grossProfitKopecks - costs.paymentFeeKopecks - costs.deliverySubsidyKopecks;
  const contributionAfterAdsKopecks = contributionBeforeAdsKopecks == null || costs.adCacKopecks == null
    ? null
    : contributionBeforeAdsKopecks - costs.adCacKopecks;

  return {
    complete: issues.length === 0,
    issues,
    recipeSnapshot,
    sellingPriceKopecks: sellingPrice,
    discountKopecks: costs.discountKopecks,
    netRevenueKopecks,
    ingredientCostKopecks: recipeSnapshot.ingredientCostKopecks,
    packagingCostKopecks: costs.packagingCostKopecks,
    laborCostKopecks: costs.laborCostKopecks,
    cogsKopecks,
    grossProfitKopecks,
    grossMargin: grossProfitKopecks == null ? null : ratio(grossProfitKopecks, netRevenueKopecks),
    markup: grossProfitKopecks == null ? null : ratio(grossProfitKopecks, cogsKopecks),
    paymentFeeKopecks: costs.paymentFeeKopecks,
    deliverySubsidyKopecks: costs.deliverySubsidyKopecks,
    contributionBeforeAdsKopecks,
    adCacKopecks: costs.adCacKopecks,
    contributionAfterAdsKopecks,
    maxBreakEvenCacKopecks: contributionBeforeAdsKopecks,
  };
}

module.exports = {
  BouquetEconomicsError,
  buildRecipeCostSnapshot,
  calculateBouquetEconomics,
  selectEffectivePurchasePrice,
  validateRecipe,
};
