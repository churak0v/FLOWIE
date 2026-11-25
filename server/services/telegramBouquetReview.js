'use strict';

const { getTelegramBouquetImportConfig, isAuthorized } = require('./telegramBouquetImport');
const { bouquetKeyboard } = require('./telegramBouquetKeyboard');

const REVIEW_STATUSES = ['REVIEW_REQUIRED', 'PARTIAL_REVIEW_REQUIRED'];
const WELCOME = [
  'Добро пожаловать в FLOWIE.',
  'Просто присылайте фотографии букетов. Через минуту после последней фотографии спрошу, всё ли загружено. При желании начать загрузку вручную можно командой /import.',
  'После разбора нажмите «Посмотреть результат» внизу или отправьте /review.',
  'Магазин: https://flowie.art',
  'Панель команды: https://admin.flowie.art',
].join('\n');

function commandOf(text) {
  return String(text || '').trim().split(/\s+/, 1)[0].toLowerCase().replace(/@[a-zA-Z0-9_]+$/, '');
}

function array(value) { return Array.isArray(value) ? value : []; }

function createTelegramBouquetReviewHandler({ prisma, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('prisma and fetchImpl are required');
  const config = getTelegramBouquetImportConfig(env);

  return async (update) => {
    const message = update?.message;
    const command = commandOf(message?.text);
    if (!['/start', '/review', '/next'].includes(command)) return { handled: false };
    const chatId = message?.chat?.id;
    const userId = message?.from?.id;
    if (!config.token || chatId == null || userId == null || !isAuthorized(config, chatId, userId)) {
      return { handled: true, ignored: !config.token ? 'disabled' : 'unauthorized' };
    }
    if (!Number.isSafeInteger(update?.update_id)) return { handled: true, ignored: 'unsupported' };

    const updateId = String(update.update_id);
    try {
      await prisma.bouquetImportUpdate.create({ data: { updateId } });
    } catch (error) {
      if (error?.code === 'P2002') return { handled: true, status: 'duplicate' };
      throw error;
    }

    let completed = false;
    const send = async (method, payload) => {
      const response = await fetchImpl(`${config.apiBase}/bot${config.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, ...payload,
          ...(method === 'sendMessage' ? { reply_markup: bouquetKeyboard(command === '/start' ? 'collecting' : 'review') } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('BOUQUET_REVIEW_SEND_FAILED');
    };

    try {
      if (command === '/start') {
        await send('sendMessage', { text: WELCOME });
        completed = true;
        return { handled: true, status: 'welcome' };
      }

      const batch = await prisma.bouquetImportBatch.findFirst({
        where: { chatId: String(chatId), userId: String(userId), status: { in: REVIEW_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (!batch) {
        await send('sendMessage', { text: 'Готовых подборок пока нет. После завершения пакетного разбора отправьте /review.' });
        completed = true;
        return { handled: true, status: 'not_ready' };
      }

      const state = batch.state && typeof batch.state === 'object' ? batch.state : {};
      const drafts = array(state.drafts);
      const hasCursor = Number.isInteger(state.reviewCursor) && state.reviewCursor >= 0;
      const previous = hasCursor ? state.reviewCursor : null;
      const cursor = command === '/next' && previous != null ? previous + 1 : (previous ?? 0);

      if (cursor >= drafts.length) {
        if (command === '/next' && state.reviewCompleted === true) {
          completed = true;
          return { handled: true, status: 'complete' };
        }
        await send('sendMessage', { text: 'Все фотографии этой загрузки просмотрены. Составы сохранены; цены сможем рассчитать после загрузки прайсов.' });
        if (command === '/next') {
          await prisma.bouquetImportBatch.update({
            where: { id: batch.id },
            data: { state: { ...state, reviewCursor: drafts.length, reviewCompleted: true } },
          });
        }
        completed = true;
        return { handled: true, status: 'complete' };
      }

      const draft = drafts[cursor] && typeof drafts[cursor] === 'object' ? drafts[cursor] : {};
      const photoIds = new Set(array(draft.photoIds).map(String));
      const relatedFiles = array(state.files).filter((item) => item && photoIds.has(String(item.id)));
      const file = relatedFiles.find((item) => item.status === 'STORED' && typeof item.fileId === 'string' && item.fileId.trim());
      const mediaGroups = new Set(relatedFiles.map((item) => item.mediaGroupId).filter(Boolean).map(String));
      const notes = array(state.notes)
        .filter((note) => note && (photoIds.has(String(note.targetId))
          || [...mediaGroups].some((groupId) => note.targetId === `media-group:${groupId}`)))
        .map((note) => String(note.text || '').trim()).filter(Boolean);
      const title = String(draft.draft_name || 'Букет без названия').trim().slice(0, 240);
      const likelyFlowers = array(draft.likely_flowers).map((item) => String(item).trim()).filter(Boolean);
      const description = [
        `${cursor + 1}/${drafts.length}. ${title}`,
        likelyFlowers.length ? `Предположительно: ${likelyFlowers.join(', ')}.` : 'Предполагаемый состав ещё не указан.',
        ...notes,
      ].join('\n');

      if (file) {
        // Use Telegram's private fileId directly; never expose storageKey or an object URL.
        await send('sendPhoto', { photo: file.fileId, caption: description.slice(0, 1000) });
      } else {
        await send('sendMessage', { text: description.slice(0, 3500) });
      }

      const recipeId = typeof draft.recipeId === 'string' ? draft.recipeId.trim() : '';
      if (recipeId) {
        await send('sendMessage', { text: [
          'Запишите состав сообщением:', `/recipe ${recipeId}`,
          'Роза Пинк Флойд; 9; шт', 'Эвкалипт; 2; ветка', '',
          'Потом подтвердите:', `/recipe_confirm ${recipeId}`, '', 'Следующее фото — /next',
        ].join('\n') });
      } else {
        await send('sendMessage', { text: 'Для этого черновика рецепт ещё не создан. Перейдите к следующему фото командой /next и сообщите администратору.' });
      }

      await prisma.bouquetImportBatch.update({
        where: { id: batch.id },
        data: { state: { ...state, reviewCursor: cursor, reviewCompleted: false } },
      });
      completed = true;
      return { handled: true, status: 'shown', cursor, recipeId: recipeId || null };
    } finally {
      // On any transient send/write failure, release the claim so Telegram can retry.
      if (!completed) {
        try { await prisma.bouquetImportUpdate.delete({ where: { updateId } }); } catch { /* Keep the persisted claim if the database is unavailable. */ }
      }
    }
  };
}

module.exports = { WELCOME, createTelegramBouquetReviewHandler };
