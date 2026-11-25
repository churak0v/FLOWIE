'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTelegramBouquetRecipeHandler,
  draftIngredientId,
  parseRecipeText,
} = require('../services/telegramBouquetRecipe');

function update(text, overrides = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: -100 },
      from: { id: 1780687976 },
      text,
      ...overrides,
    },
  };
}

function fixture() {
  const state = {
    recipes: [{
      id: 'recipe-1',
      importId: 'batch-1',
      lines: [{ ingredientId: 'old', name: 'Старый состав', quantity: 1, unit: 'шт', supplierId: null }],
      snapshot: { old: true },
      confirmedAt: new Date('2026-11-24T00:00:00Z'),
    }],
    batches: [{ id: 'batch-1', chatId: '-100', userId: '1780687976' }],
    sent: [],
    updates: [],
  };
  const prisma = {
    bouquetRecipe: {
      findUnique: async ({ where }) => state.recipes.find((item) => item.id === where.id) || null,
      update: async ({ where, data }) => {
        const recipe = state.recipes.find((item) => item.id === where.id);
        Object.assign(recipe, data);
        state.updates.push(data);
        return recipe;
      },
    },
    bouquetImportBatch: {
      findFirst: async ({ where }) => state.batches.find((item) => item.id === where.id
        && item.chatId === where.chatId && item.userId === where.userId) || null,
    },
  };
  const handler = createTelegramBouquetRecipeHandler({
    prisma,
    env: {
      TELEGRAM_ORDER_BOT_TOKEN: 'not-a-real-token',
      TELEGRAM_BOUQUET_IMPORT_CHAT_IDS: '-100',
      TELEGRAM_BOUQUET_IMPORT_USER_IDS: '1780687976',
    },
    fetchImpl: async (_url, options) => {
      state.sent.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { handler, state };
}

test('parser creates a stable draft SKU without pretending it is a procurement match', () => {
  const first = parseRecipeText('/recipe recipe-1\nРоза Пинк Флойд; 9; шт');
  const second = parseRecipeText('/recipe recipe-1\n  РОЗА   Пинк Флойд ; 9,5; шт');
  assert.match(first.lines[0].ingredientId, /^draft:[0-9a-f]{24}$/);
  assert.equal(first.lines[0].ingredientId, second.lines[0].ingredientId);
  assert.equal(second.lines[0].quantity, 9.5);
  assert.equal(first.lines[0].supplierId, null);
  assert.equal(first.lines[0].ingredientId, draftIngredientId('роза пинк флойд'));
});

test('explicit SKU and supplier are retained, and editing resets snapshot and confirmation', async () => {
  const { handler, state } = fixture();
  const result = await handler(update([
    '/recipe recipe-1',
    'Роза Пинк Флойд; 9; шт; rose-pink-floyd-60; supplier-a',
    'Эвкалипт; 1.5; ветка',
  ].join('\n')));

  assert.deepEqual(result, { handled: true, status: 'saved', recipeId: 'recipe-1' });
  assert.equal(state.recipes[0].lines[0].ingredientId, 'rose-pink-floyd-60');
  assert.equal(state.recipes[0].lines[0].supplierId, 'supplier-a');
  assert.match(state.recipes[0].lines[1].ingredientId, /^draft:/);
  assert.equal(state.recipes[0].snapshot, null);
  assert.equal(state.recipes[0].confirmedAt, null);
  assert.match(state.sent[0].text, /черновые SKU/);
});

test('confirmation is explicit and does not read or expose prices', async () => {
  const { handler, state } = fixture();
  const result = await handler(update('/recipe_confirm recipe-1'));
  assert.equal(result.status, 'confirmed');
  assert.ok(state.recipes[0].confirmedAt instanceof Date);
  assert.deepEqual(Object.keys(state.updates[0]), ['confirmedAt']);
  assert.match(state.sent[0].text, /Закупочные цены подтверждаются отдельно/);
  assert.equal(JSON.stringify(state.sent).includes('priceKopecks'), false);
});

test('ownership is bound to both import chat and user without revealing another recipe', async () => {
  const { handler, state } = fixture();
  state.batches[0].userId = '999';
  const result = await handler(update('/recipe recipe-1\nРоза; 3; шт'));
  assert.equal(result.status, 'not_found');
  assert.equal(state.updates.length, 0);
  assert.match(state.sent[0].text, /не найден/);
  assert.equal(state.sent[0].text.includes('999'), false);
});

test('uses the import allowlist and leaves unrelated updates for the existing handler', async () => {
  const { handler, state } = fixture();
  assert.deepEqual(await handler(update('/import')), { handled: false });
  assert.deepEqual(await handler(update('/recipe recipe-1\nРоза; 3; шт', { from: { id: 7 } })), {
    handled: false,
    ignored: 'unauthorized',
  });
  assert.equal(state.sent.length, 0);
  assert.equal(state.updates.length, 0);
});

test('invalid line syntax returns Russian guidance and does not mutate the recipe', async () => {
  const { handler, state } = fixture();
  const result = await handler(update('/recipe recipe-1\nРоза; много; шт'));
  assert.equal(result.status, 'invalid');
  assert.equal(state.updates.length, 0);
  assert.match(state.sent[0].text, /количество/);
});
