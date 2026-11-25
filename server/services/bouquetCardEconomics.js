'use strict';

const { draftIngredientId } = require('./telegramBouquetRecipe');
const { buildRecipeCostSnapshot, validateRecipe } = require('./bouquetEconomics');

class BouquetCardError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function parseNaturalComposition(text) {
  const value = String(text || '').trim();
  if (!value) throw new BouquetCardError('COMPOSITION_EMPTY', 'Напишите состав, например: Роза 9 шт, эвкалипт 2 ветки.');
  const parts = value.split(/\n|;|,(?!\d)/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 100) throw new BouquetCardError('COMPOSITION_SIZE', 'Укажите от 1 до 100 позиций состава.');
  const lines = parts.map((part, index) => {
    const match = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\p{L}][\p{L}.\-]*)$/u.exec(part);
    if (!match) throw new BouquetCardError('COMPOSITION_AMBIGUOUS', `Не понял позицию ${index + 1}. Напишите: название, количество и единицу.`);
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 240 || /(^|\s)\d+(?:[.,]\d+)?($|\s)/.test(name)) {
      throw new BouquetCardError('COMPOSITION_AMBIGUOUS', `Уточните название в позиции ${index + 1}.`);
    }
    const quantity = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new BouquetCardError('COMPOSITION_QUANTITY', `Проверьте количество в позиции ${index + 1}.`);
    }
    const unit = match[3].toLocaleLowerCase('ru-RU').replace(/\.$/, '');
    return { ingredientId: draftIngredientId(name), name, quantity, unit, supplierId: null };
  });
  try { return validateRecipe(lines); } catch {
    throw new BouquetCardError('COMPOSITION_DUPLICATE', 'Объедините одинаковые позиции состава в одну строку.');
  }
}

async function getCardEconomics({ prisma, recipe, asOf = new Date() }) {
  if (!prisma || !recipe || !Array.isArray(recipe.lines)) throw new TypeError('BOUQUET_CARD_ECONOMICS_INPUT');
  const lines = validateRecipe(recipe.lines);
  const at = asOf instanceof Date ? asOf : new Date(asOf);
  if (!Number.isFinite(at.getTime())) throw new TypeError('BOUQUET_CARD_ECONOMICS_AS_OF');
  const rows = await prisma.flowerPurchasePrice.findMany({
    where: { confirmed: true, ingredientId: { in: [...new Set(lines.map((line) => line.ingredientId))] }, effectiveAt: { lte: at } },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    take: 5000,
  });
  const snapshot = buildRecipeCostSnapshot({ recipe: lines,
    purchasePrices: rows.map((row) => ({ ...row, supplier: row.supplierId })), asOf: at,
    staleAfterDays: Number(recipe.costs?.staleAfterDays ?? 30) });
  const confirmed = Boolean(recipe.confirmedAt);
  const missingPrices = snapshot.issues.map((issue) => ({
    ingredientId: issue.ingredientId,
    unit: issue.unit,
    supplierId: issue.supplierId || null,
    reason: issue.code,
  }));
  if (!confirmed) missingPrices.unshift({ ingredientId: null, unit: null, supplierId: null, reason: 'UNCONFIRMED_RECIPE' });
  return {
    lines: snapshot.lines,
    confirmed,
    totalPurchaseKopecks: confirmed && snapshot.complete ? snapshot.ingredientCostKopecks : null,
    missingPrices,
    priceAsOf: snapshot.asOf,
  };
}

module.exports = { BouquetCardError, getCardEconomics, parseNaturalComposition };
