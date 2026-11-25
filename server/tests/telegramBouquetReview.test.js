'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cardCaption, createTelegramBouquetReviewHandler } = require('../services/telegramBouquetReview');

function telegramUpdate(updateId, text, overrides = {}) {
  return { update_id: updateId, message: {
    message_id: updateId, chat: { id: -100 }, from: { id: 1780687976 }, text, ...overrides,
  } };
}

function fixture({ failSendAt = null } = {}) {
  const state = {
    claims: new Set(), sends: [], sendAttempts: 0, updates: [], locks: [],
    batch: {
      id: 'batch-1', chatId: '-100', userId: '1780687976', status: 'REVIEW_REQUIRED',
      state: {
        drafts: [
          { recipeId: 'recipe-1', draft_name: 'Первый', likely_flowers: ['Роза'], photoIds: ['photo-1'] },
          { recipeId: 'recipe-2', draft_name: 'Второй', likely_flowers: ['Эвкалипт'], photoIds: ['photo-2'] },
        ],
        files: [
          { id: 'photo-1', status: 'STORED', fileId: 'telegram-private-1', storageKey: 'private/one.jpg', mediaGroupId: 'g1' },
          { id: 'photo-2', status: 'STORED', fileId: 'telegram-private-2', storageKey: 'private/two.jpg' },
        ],
        notes: [
          { targetId: 'photo-1', text: '11 стеблей' },
          { targetId: 'media-group:g1', text: 'Без упаковки' },
          { targetId: 'photo-2', text: 'Чужая заметка' },
        ],
      },
    },
  };
  state.batches = [state.batch];
  const tx = {
    $executeRawUnsafe: async (...args) => { state.locks.push(args); return 1; },
    bouquetImportBatch: {
      findUnique: async ({ where }) => {
        state.onFindUnique?.();
        const row = state.batches.find((item) => item.id === where.id);
        return row ? structuredClone(row) : null;
      },
      update: async ({ data }) => {
        const row = state.batches.find((item) => item.id === state.lockedBatchId) || state.batch;
        row.state = structuredClone(data.state);
        state.updates.push(structuredClone(data.state));
        return structuredClone(row);
      },
    },
  };
  const prisma = {
    $transaction: async (callback) => callback({
      ...tx,
      $executeRawUnsafe: async (...args) => {
        state.locks.push(args); state.lockedBatchId = args[1]; return 1;
      },
    }),
    bouquetImportUpdate: {
      create: async ({ data }) => {
        if (state.claims.has(data.updateId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state.claims.add(data.updateId);
      },
      delete: async ({ where }) => { state.claims.delete(where.updateId); },
    },
    bouquetImportBatch: {
      findMany: async ({ where }) => state.batches.filter((row) => row.chatId === where.chatId
        && row.userId === where.userId && where.status.in.includes(row.status)).map((row) => structuredClone(row)),
    },
  };
  const handler = createTelegramBouquetReviewHandler({
    prisma,
    env: {
      TELEGRAM_ORDER_BOT_TOKEN: 'test-token',
      TELEGRAM_BOUQUET_IMPORT_CHAT_IDS: '-100',
      TELEGRAM_BOUQUET_IMPORT_USER_IDS: '1780687976',
    },
    fetchImpl: async (_url, options) => {
      state.sendAttempts += 1;
      if (state.sendAttempts === failSendAt) return new Response('{}', { status: 503 });
      state.sends.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    },
  });
  return { handler, state };
}

test('/start guides only an authorized user to current FLOWIE domains and import flow', async () => {
  const { handler, state } = fixture();
  const welcome = await handler(telegramUpdate(1, '/start'));
  assert.equal(welcome.status, 'welcome');
  assert.match(state.sends[0].text, /автоматически/);
  assert.doesNotMatch(state.sends[0].text, /минут/);
  assert.match(state.sends[0].text, /https:\/\/flowie\.art/);
  assert.match(state.sends[0].text, /https:\/\/admin\.flowie\.art/);

  const unauthorized = await handler(telegramUpdate(2, '/start', { from: { id: 7 } }));
  assert.equal(unauthorized.ignored, 'unauthorized');
  assert.equal(state.sends.length, 1);
});

test('/review uses Telegram fileId and renders a clean product card without private storage or commands', async () => {
  const { handler, state } = fixture();
  const result = await handler(telegramUpdate(10, '/review'));
  assert.deepEqual(result, { handled: true, status: 'shown', cursor: 0, recipeId: 'recipe-1' });
  assert.equal(state.sends[0].photo, 'telegram-private-1');
  assert.match(state.sends[0].caption, /Название: Первый/);
  assert.match(state.sends[0].caption, /Состав — проверьте/);
  assert.match(state.sends[0].caption, /Закупка: не рассчитана/);
  assert.match(state.sends[0].caption, /Фото: 1/);
  assert.equal(JSON.stringify(state.sends).includes('private/one.jpg'), false);
  assert.doesNotMatch(JSON.stringify(state.sends), /\/recipe|recipe-1/);
  assert.equal(state.batch.state.reviewCursor, 0);
  assert.deepEqual(state.locks[0], ['SELECT pg_advisory_xact_lock(hashtext($1))', 'batch-1']);
});

test('/next starts at the first draft when no cursor exists and duplicate updates never advance twice', async () => {
  const { handler, state } = fixture();
  const first = await handler(telegramUpdate(20, '/next'));
  assert.equal(first.cursor, 0);
  const sendCount = state.sends.length;
  const duplicate = await handler(telegramUpdate(20, '/next'));
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(state.batch.state.reviewCursor, 0);
  assert.equal(state.sends.length, sendCount);

  const second = await handler(telegramUpdate(21, '/next'));
  assert.equal(second.cursor, 1);
  assert.equal(state.batch.state.reviewCursor, 1);
});

test('completion is persisted once and repeated /next sends nothing impossible', async () => {
  const { handler, state } = fixture();
  state.batch.state.reviewCursor = 1;
  const complete = await handler(telegramUpdate(30, '/next'));
  assert.equal(complete.status, 'complete');
  assert.equal(state.batch.state.reviewCursor, 2);
  assert.equal(state.batch.state.reviewCompleted, true);
  const sends = state.sends.length;
  const repeated = await handler(telegramUpdate(31, '/next'));
  assert.equal(repeated.status, 'complete');
  assert.equal(state.sends.length, sends);
  assert.equal(state.updates.length, 1);
});

test('transient send failure releases dedup claim and does not advance the cursor', async () => {
  const { handler, state } = fixture({ failSendAt: 1 });
  await assert.rejects(() => handler(telegramUpdate(40, '/next')), /BOUQUET_REVIEW_SEND_FAILED/);
  assert.equal(state.batch.state.reviewCursor, undefined);
  assert.equal(state.claims.has('40'), false);

  const retried = await handler(telegramUpdate(40, '/next'));
  assert.equal(retried.cursor, 0);
  assert.equal(state.batch.state.reviewCursor, 0);
});

test('missing recipe id still renders one clean card without a technical follow-up', async () => {
  const { handler, state } = fixture();
  delete state.batch.state.drafts[0].recipeId;
  const result = await handler(telegramUpdate(50, '/review'));
  assert.equal(result.recipeId, null);
  assert.equal(JSON.stringify(state.sends).includes('/recipe undefined'), false);
  assert.equal(state.sends.length, 1);
});

test('/review accepts COLLECTING drafts and writes cursor under the bare batch-id lock', async () => {
  const { handler, state } = fixture();
  state.batch.status = 'COLLECTING';
  const result = await handler(telegramUpdate(60, '/review'));
  assert.equal(result.status, 'shown');
  assert.deepEqual(state.locks[0], ['SELECT pg_advisory_xact_lock(hashtext($1))', 'batch-1']);
});

test('newest empty COLLECTING batch does not hide an older usable result and latest state is merged', async () => {
  const { handler, state } = fixture();
  state.batches.unshift({
    id: 'batch-empty', chatId: '-100', userId: '1780687976', status: 'COLLECTING',
    state: { drafts: [] },
  });
  state.onFindUnique = () => { state.batch.state.syncKnownPhotoIds = ['photo-concurrent']; };
  const result = await handler(telegramUpdate(70, '/review'));
  assert.equal(result.status, 'shown');
  assert.deepEqual(state.locks[0], ['SELECT pg_advisory_xact_lock(hashtext($1))', 'batch-1']);
  assert.deepEqual(state.batch.state.syncKnownPhotoIds, ['photo-concurrent']);
  assert.equal(state.batch.state.reviewCursor, 0);
});

test('multiple unique photos are sent as a media group with the card caption only on the first item', async () => {
  const { handler, state } = fixture();
  state.batch.state.drafts[0].photoIds = ['photo-1', 'photo-2'];
  await handler(telegramUpdate(80, '/review'));
  assert.equal(state.sends[0].media.length, 2);
  assert.equal(state.sends[0].media[0].media, 'telegram-private-1');
  assert.match(state.sends[0].media[0].caption, /Фото: 2/);
  assert.equal(state.sends[0].media[1].caption, undefined);
  assert.equal(state.sends[1].text, 'Изменить карточку можно кнопками внизу.');
  assert.equal(state.sends[1].reply_markup.keyboard[0][0].text, 'Изменить состав');
});

test('single-photo cards replace an old persistent keyboard with the polished actions', async () => {
  const { handler, state } = fixture();
  await handler(telegramUpdate(81, '/review'));
  assert.equal(state.sends[0].photo, 'telegram-private-1');
  assert.equal(state.sends[0].reply_markup.keyboard[0][0].text, 'Изменить состав');
});

test('confirmed composition and purchase cost render without uncertainty or internal ids', () => {
  const caption = cardCaption({
    draft: { draft_name: 'Розовый букет', likely_flowers: ['розы — предположительно'] },
    recipe: { confirmedAt: new Date(), lines: [{ ingredientId: 'secret', name: 'Роза', quantity: 9, unit: 'шт' }] },
    economics: { totalPurchaseKopecks: 123450 }, photoCount: 3,
  });
  assert.match(caption, /• Роза — 9 шт/);
  assert.match(caption, /Закупка: 1 234,5 ₽/);
  assert.doesNotMatch(caption, /проверьте|предположительно|secret/iu);
});

test('card cleans draft qualifiers and prefers an edited unconfirmed recipe over an old AI proposal', () => {
  const caption = cardCaption({
    draft: { draft_name: 'Корзина (предварительный вариант)', compositionProposal: ['Старая роза'] },
    recipe: { confirmedAt: null, lines: [{ name: 'Новая роза', quantity: 7, unit: 'шт' }] },
    economics: null, photoCount: 1,
  });
  assert.match(caption, /Название: Корзина/);
  assert.match(caption, /Новая роза — 7 шт/);
  assert.doesNotMatch(caption, /Старая|предварительный вариант/iu);
  assert.match(caption, /проверьте/iu);
});
