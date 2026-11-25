'use strict';

const crypto = require('node:crypto');
const {
  getTelegramBouquetImportConfig,
  isAuthorized,
} = require('./telegramBouquetImport');
const { BouquetEconomicsError, validateRecipe } = require('./bouquetEconomics');

const MAX_LINES = 100;
const MAX_QUANTITY = 10000;
const HELP = [
  'Формат команды:',
  '/recipe <id рецепта>',
  'Название; количество; единица; ingredientId (необязательно); supplierId (необязательно)',
  'Пример: Роза Пинк Флойд; 9; шт',
  'После проверки отправьте /recipe_confirm <id рецепта>.',
].join('\n');

class TelegramRecipeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function bounded(value, max, label) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) {
    throw new TelegramRecipeError('INVALID_LINE', `${label}: значение отсутствует или слишком длинное.`);
  }
  return normalized;
}

function normalizedFlowerName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function draftIngredientId(name) {
  const normalized = normalizedFlowerName(name);
  if (!normalized) throw new TelegramRecipeError('INVALID_LINE', 'Название цветка не распознано.');
  return `draft:${crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 24)}`;
}

function parseRecipeText(text) {
  const rows = String(text || '').replace(/\r/g, '').split('\n');
  const header = rows.shift()?.trim() || '';
  const match = /^\/recipe(?:@[a-zA-Z0-9_]+)?\s+([^\s]+)\s*$/i.exec(header);
  if (!match || match[1].length > 100) throw new TelegramRecipeError('INVALID_COMMAND', HELP);
  const recipeId = match[1];
  const inputLines = rows.map((row) => row.trim()).filter(Boolean);
  if (inputLines.length < 1 || inputLines.length > MAX_LINES) {
    throw new TelegramRecipeError('INVALID_LINES', `Нужно указать от 1 до ${MAX_LINES} строк состава.\n\n${HELP}`);
  }

  const lines = inputLines.map((row, index) => {
    const fields = row.split(';').map((field) => field.trim());
    if (fields.length < 3 || fields.length > 5) {
      throw new TelegramRecipeError('INVALID_LINE', `Строка ${index + 1}: ожидается от 3 до 5 полей через «;».`);
    }
    const name = bounded(fields[0], 240, `Строка ${index + 1}, название`);
    const quantityText = fields[1].replace(',', '.');
    const quantity = Number(quantityText);
    if (!/^\d+(?:[.,]\d+)?$/.test(fields[1]) || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      throw new TelegramRecipeError('INVALID_QUANTITY', `Строка ${index + 1}: количество должно быть больше 0 и не больше ${MAX_QUANTITY}.`);
    }
    const unit = bounded(fields[2], 40, `Строка ${index + 1}, единица`);
    const ingredientId = fields[3]
      ? bounded(fields[3], 160, `Строка ${index + 1}, ingredientId`)
      : draftIngredientId(name);
    const supplierId = fields[4]
      ? bounded(fields[4], 100, `Строка ${index + 1}, supplierId`)
      : null;
    return { ingredientId, name, quantity, unit, supplierId };
  });

  validateRecipe(lines);
  return { recipeId, lines };
}

function parseConfirmText(text) {
  const match = /^\/recipe_confirm(?:@[a-zA-Z0-9_]+)?\s+([^\s]+)\s*$/i.exec(String(text || '').trim());
  if (!match || match[1].length > 100) {
    throw new TelegramRecipeError('INVALID_COMMAND', 'Формат: /recipe_confirm <id рецепта>');
  }
  return match[1];
}

function commandOf(text) {
  const first = String(text || '').trim().split(/\s+/, 1)[0].toLowerCase();
  return first.replace(/@[a-zA-Z0-9_]+$/, '');
}

function createTelegramBouquetRecipeHandler({ prisma, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('prisma and fetchImpl are required');
  const config = getTelegramBouquetImportConfig(env);

  async function sendMessage(chatId, text) {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error('TELEGRAM_SEND_MESSAGE_FAILED');
  }

  async function ownedRecipe(recipeId, chatId, userId) {
    const recipe = await prisma.bouquetRecipe.findUnique({ where: { id: recipeId } });
    if (!recipe?.importId) return null;
    const batch = await prisma.bouquetImportBatch.findFirst({
      where: {
        id: recipe.importId,
        chatId: String(chatId),
        userId: String(userId),
      },
      select: { id: true },
    });
    return batch ? recipe : null;
  }

  async function handleUpdate(update) {
    const message = update?.message || update?.channel_post;
    const text = message?.text;
    const command = commandOf(text);
    if (!['/recipe', '/recipe_confirm'].includes(command)) return { handled: false };

    const chatId = message?.chat?.id;
    const userId = message?.from?.id;
    if (chatId == null || userId == null || !isAuthorized(config, chatId, userId) || !config.token) {
      return { handled: false, ignored: !config.token ? 'disabled' : 'unauthorized' };
    }

    try {
      if (command === '/recipe') {
        const parsed = parseRecipeText(text);
        const recipe = await ownedRecipe(parsed.recipeId, chatId, userId);
        if (!recipe) {
          await sendMessage(chatId, 'Рецепт не найден в вашей текущей загрузке. Проверьте идентификатор.');
          return { handled: true, status: 'not_found' };
        }
        await prisma.bouquetRecipe.update({
          where: { id: recipe.id },
          data: { lines: parsed.lines, snapshot: null, confirmedAt: null },
        });
        await sendMessage(chatId, [
          `Состав рецепта ${recipe.id} сохранён: ${parsed.lines.length} поз.`,
          'Строки без ingredientId сохранены как черновые SKU и не сопоставлены с закупочными ценами.',
          `Проверьте состав и отправьте /recipe_confirm ${recipe.id}`,
        ].join('\n'));
        return { handled: true, status: 'saved', recipeId: recipe.id };
      }

      const recipeId = parseConfirmText(text);
      const recipe = await ownedRecipe(recipeId, chatId, userId);
      if (!recipe) {
        await sendMessage(chatId, 'Рецепт не найден в вашей текущей загрузке. Проверьте идентификатор.');
        return { handled: true, status: 'not_found' };
      }
      validateRecipe(recipe.lines);
      await prisma.bouquetRecipe.update({
        where: { id: recipe.id },
        data: { confirmedAt: new Date() },
      });
      await sendMessage(chatId, `Состав рецепта ${recipe.id} подтверждён. Закупочные цены подтверждаются отдельно.`);
      return { handled: true, status: 'confirmed', recipeId: recipe.id };
    } catch (error) {
      if (error instanceof TelegramRecipeError || error instanceof BouquetEconomicsError) {
        const messageText = error instanceof TelegramRecipeError
          ? error.message
          : `Состав не сохранён: проверьте названия, количество, единицы и уникальность ingredientId + единица.\n\n${HELP}`;
        await sendMessage(chatId, messageText);
        return { handled: true, status: 'invalid', error: error.code };
      }
      throw error;
    }
  }

  handleUpdate.handleUpdate = handleUpdate;
  return handleUpdate;
}

module.exports = {
  HELP,
  createTelegramBouquetRecipeHandler,
  draftIngredientId,
  normalizedFlowerName,
  parseRecipeText,
};
