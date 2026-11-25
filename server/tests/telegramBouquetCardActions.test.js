'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegramBouquetCardActionsHandler } = require('../services/telegramBouquetCardActions');

function update(id, text) {
  return { update_id: id, message: { message_id: id, chat: { id: -100 }, from: { id: 1780687976 }, text } };
}

function fixture() {
  const state = {
    locks: [], sends: [], claims: new Set(), products: new Map(),
    batch: { id: 'batch-1', chatId: '-100', userId: '1780687976', status: 'COLLECTING', state: {
      reviewCursor: 0,
      drafts: [
        { customId: 'card-a', recipeId: 'recipe-a', draft_name: 'Первый', photoIds: ['p1'] },
        { customId: 'card-b', recipeId: 'recipe-b', draft_name: 'Второй', photoIds: ['p2', 'p3'] },
      ],
    } },
    recipes: new Map([
      ['recipe-a', { id: 'recipe-a', lines: [], confirmedAt: null }],
      ['recipe-b', { id: 'recipe-b', lines: [], confirmedAt: null }],
    ]),
  };
  const tx = {
    $executeRawUnsafe: async (...args) => { state.locks.push(args); },
    bouquetImportBatch: {
      findUnique: async () => structuredClone(state.batch),
      update: async ({ data }) => { state.batch.state = structuredClone(data.state); return state.batch; },
    },
    bouquetRecipe: {
      findUnique: async ({ where }) => structuredClone(state.recipes.get(where.id) || null),
      update: async ({ where, data }) => {
        const recipe = state.recipes.get(where.id); Object.assign(recipe, structuredClone(data)); return recipe;
      },
    },
    product: { update: async ({ where, data }) => {
      const product = state.products.get(where.id);
      assert.ok(product); Object.assign(product, structuredClone(data)); return product;
    } },
  };
  const prisma = {
    bouquetImportBatch: { findMany: async () => [structuredClone(state.batch)] },
    bouquetImportUpdate: {
      create: async ({ data }) => {
        if (state.claims.has(data.updateId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state.claims.add(data.updateId);
      },
      deleteMany: async ({ where }) => { state.claims.delete(where.updateId); },
    },
    $transaction: async (callback) => callback(tx),
  };
  const handler = createTelegramBouquetCardActionsHandler({ prisma,
    env: { TELEGRAM_ORDER_BOT_TOKEN: 'token', TELEGRAM_BOUQUET_IMPORT_CHAT_IDS: '-100', TELEGRAM_BOUQUET_IMPORT_USER_IDS: '1780687976' },
    fetchImpl: async (_url, options) => {
      state.sends.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    },
  });
  return { handler, state };
}

test('name editing uses current card state and natural text without exposing identifiers', async () => {
  const { handler, state } = fixture();
  assert.equal((await handler(update(1, 'Изменить название'))).status, 'awaiting_name');
  assert.deepEqual(state.batch.state.cardEdit, { mode: 'name', targetCustomId: 'card-a' });
  assert.equal((await handler(update(2, 'Нежный розовый'))).status, 'name_saved');
  assert.equal(state.batch.state.drafts[0].draft_name, 'Нежный розовый');
  assert.equal(state.batch.state.cardEdit, undefined);
  assert.doesNotMatch(JSON.stringify(state.sends), /card-a|recipe-a|\//);
  assert.deepEqual(state.locks[0], ['SELECT pg_advisory_xact_lock(hashtext($1))', 'batch-1']);
});

test('selling price is entered in rubles and saved to the selected draft, product and recipe only', async () => {
  const { handler, state } = fixture();
  state.batch.state.drafts[0].productId = 79;
  state.products.set(79, { id: 79, price: 0, isActive: false });
  state.recipes.get('recipe-a').costs = { packagingCostKopecks: 20000 };
  await handler(update(1, 'Изменить цену'));
  assert.equal((await handler(update(2, '4 500 ₽'))).status, 'price_saved');
  assert.equal(state.products.get(79).price, 4500);
  assert.equal(state.products.get(79).isActive, false);
  assert.equal(state.batch.state.drafts[0].sellingPriceRubles, 4500);
  assert.equal(state.batch.state.drafts[1].sellingPriceRubles, undefined);
  assert.deepEqual(state.recipes.get('recipe-a').costs, { packagingCostKopecks: 20000, sellingPriceKopecks: 450000 });
  assert.equal(state.batch.state.cardEdit, undefined);
});

test('invalid prices leave the edit open without changing the product', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Изменить цену'));
  for (const [index, text] of ['0', '-4500', '45abc', '4500,50', '4 50', '2147483648'].entries()) {
    assert.equal((await handler(update(index + 2, text))).status, 'invalid_price');
    assert.equal(state.batch.state.cardEdit.mode, 'price');
    assert.equal(state.batch.state.drafts[0].sellingPriceRubles, undefined);
  }
  await handler(update(20, 'Отмена'));
  assert.equal(state.batch.state.cardEdit, undefined);
});

test('price input remains attached to the selected card even if the cursor changes', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Изменить цену'));
  state.batch.state.reviewCursor = 1;
  assert.equal((await handler(update(2, '5500 рублей'))).status, 'price_saved');
  assert.equal(state.batch.state.drafts[0].sellingPriceRubles, 5500);
  assert.equal(state.batch.state.drafts[1].sellingPriceRubles, undefined);
});

test('composition editing accepts natural lines and leaves confirmation explicit', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Изменить состав'));
  assert.equal((await handler(update(2, 'Роза 9 шт, Эвкалипт 2 ветки'))).status, 'composition_saved');
  assert.equal(state.recipes.get('recipe-a').lines.length, 2);
  assert.equal(state.recipes.get('recipe-a').confirmedAt, null);
  assert.match(state.sends.at(-1).text, /проверьте.*подтвердите/iu);
});

test('the failed phone message saves roses, ribbon and selling price together without inventing ribbon quantity', async () => {
  const { handler, state } = fixture();
  state.batch.state.drafts[0].productId = 79;
  state.products.set(79, { id: 79, price: 0, isActive: false });
  await handler(update(1, 'Изменить состав'));
  assert.equal((await handler(update(2, 'Розы кустовые -9\nЛента атласная\nЦена : 7560'))).status, 'composition_saved');
  const draft = state.batch.state.drafts[0];
  assert.deepEqual(draft.compositionNotes, ['Лента атласная']);
  assert.equal(state.recipes.get('recipe-a').lines[0].quantity, 9);
  assert.equal(state.recipes.get('recipe-a').lines.length, 1);
  assert.equal(state.products.get(79).price, 7560);
  assert.equal(state.recipes.get('recipe-a').confirmedAt, null);
  assert.match(state.sends.at(-1).text, /Лента атласная/);
  await handler(update(3, 'Подтвердить состав'));
  assert.match(state.products.get(79).description, /Лента атласная/);
  assert.equal(state.products.get(79).isActive, false);
});

test('add photo records the worker handoff marker for the current card', async () => {
  const { handler, state } = fixture();
  assert.equal((await handler(update(1, 'Добавить фото'))).status, 'awaiting_photo');
  assert.deepEqual(state.batch.state.cardEdit, { mode: 'photo', targetCustomId: 'card-a' });
  assert.match(state.sends[0].text, /Пришлите фотографию/);
});

test('pending photo mode never claims or consumes the incoming photo update', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Добавить фото'));
  const photo = { update_id: 2, message: { message_id: 2, chat: { id: -100 }, from: { id: 1780687976 },
    photo: [{ file_id: 'new-photo' }] } };
  assert.deepEqual(await handler(photo), { handled: false });
  assert.equal(state.claims.has('2'), false);
  assert.deepEqual(state.batch.state.cardEdit, { mode: 'photo', targetCustomId: 'card-a' });
});

test('moving on clears a pending edit without claiming the review update', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Изменить название'));
  assert.deepEqual(await handler(update(2, '/next')), { handled: false });
  assert.equal(state.batch.state.cardEdit, undefined);
  assert.equal(state.claims.has('2'), false);
});

test('empty recipe cannot be confirmed', async () => {
  const { handler, state } = fixture();
  assert.equal((await handler(update(1, 'Подтвердить состав'))).status, 'composition_missing');
  assert.equal(state.recipes.get('recipe-a').confirmedAt, null);
  assert.match(state.sends[0].text, /Сначала укажите состав/);
});

test('merge requires an explicit card number, transfers photos and hides the secondary card', async () => {
  const { handler, state } = fixture();
  await handler(update(1, 'Объединить карточки'));
  assert.match(state.sends[0].text, /2\. Второй/);
  assert.doesNotMatch(state.sends[0].text, /1\. Первый/);
  assert.equal((await handler(update(2, '2'))).status, 'merge_saved');
  assert.deepEqual(state.batch.state.drafts[0].photoIds, ['p1', 'p2', 'p3']);
  assert.equal(state.batch.state.drafts[1].mergedInto, 'card-a');
  assert.equal(state.batch.state.cardEdit, undefined);
});

test('merge refuses to absorb a card with a different confirmed composition', async () => {
  const { handler, state } = fixture();
  Object.assign(state.recipes.get('recipe-b'), {
    confirmedAt: new Date('2026-11-25T12:00:00Z'),
    lines: [{ name: 'Роза', quantity: 9, unit: 'шт' }],
  });
  await handler(update(1, 'Объединить карточки'));
  assert.equal((await handler(update(2, '2'))).status, 'merge_protected');
  assert.equal(state.batch.state.drafts[1].mergedInto, undefined);
  assert.match(state.sends.at(-1).text, /подтверждён другой состав/iu);
});

