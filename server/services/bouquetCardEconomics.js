'use strict';

const { draftIngredientId } = require('./telegramBouquetRecipe');
const { buildRecipeCostSnapshot, validateRecipe } = require('./bouquetEconomics');

class BouquetCardError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function parseSellingPrice(text) {
  const value = String(text || '').trim().replace(/\s*(?:₽|руб(?:\.|ля|лей)?|р\.?)$/iu, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(value)) return null;
  const price = Number(value.replace(/[ \u00a0\u202f]/g, ''));
  return Number.isSafeInteger(price) && price > 0 && price <= 2147483647 ? price : null;
}

function parseCardComposition(text) {
  const value = String(text || '').trim();
  if (!value) throw new BouquetCardError('COMPOSITION_EMPTY', 'Напишите состав, например: Роза 9 шт, эвкалипт 2 ветки.');
  const parts = value.split(/\n|;|,(?!\d)/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 100) throw new BouquetCardError('COMPOSITION_SIZE', 'Укажите от 1 до 100 позиций состава.');
  const lines = []; const notes = []; let sellingPriceRubles = null;
  for (const [index, part] of parts.entries()) {
    const priceLine = /^(?:цена(?:\s+продажи)?|продажная\s+цена|стоимость)\s*[:—–-]?\s*(\d.*)$/iu.exec(part);
    if (priceLine) {
      const price = parseSellingPrice(priceLine[1]);
      if (price == null || (sellingPriceRubles != null && sellingPriceRubles !== price)) {
        throw new BouquetCardError('COMPOSITION_PRICE', 'Уточните продажную цену в рублях, например: Цена: 7560.');
      }
      sellingPriceRubles = price; continue;
    }
    const normalized = part.replace(/\s*[:—–-]\s*(?=\d)/gu, ' ');
    const match = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([\p{L}][\p{L}.\-]*)?$/u.exec(normalized);
    if (!match) {
      if (part.length <= 240 && /[\p{L}]/u.test(part) && !/\d/.test(part)) { notes.push(part); continue; }
      throw new BouquetCardError('COMPOSITION_AMBIGUOUS', `Уточните строку «${part.slice(0, 60)}». Можно написать: Розы — 9.`);
    }
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 240 || /(^|\s)\d+(?:[.,]\d+)?($|\s)/.test(name)) {
      throw new BouquetCardError('COMPOSITION_AMBIGUOUS', `Уточните название в позиции ${index + 1}.`);
    }
    const quantity = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new BouquetCardError('COMPOSITION_QUANTITY', `Проверьте количество в позиции ${index + 1}.`);
    }
    const unit = (match[3] || 'шт').toLocaleLowerCase('ru-RU').replace(/\.$/, '');
    lines.push({ ingredientId: draftIngredientId(name), name, quantity, unit, supplierId: null });
  }
  if (!lines.length) throw new BouquetCardError('COMPOSITION_AMBIGUOUS', 'Укажите количество цветов, например: Розы — 9. Декор можно написать без количества.');
  try { return { lines: validateRecipe(lines), notes, sellingPriceRubles }; } catch {
    throw new BouquetCardError('COMPOSITION_DUPLICATE', 'Объедините одинаковые позиции состава в одну строку.');
  }
}

function parseNaturalComposition(text) { return parseCardComposition(text).lines; }

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

module.exports = { BouquetCardError, getCardEconomics, parseNaturalComposition, parseCardComposition, parseSellingPrice };
