'use strict';

const { getTelegramBouquetImportConfig, isAuthorized } = require('./telegramBouquetImport');
const { bouquetKeyboard } = require('./telegramBouquetKeyboard');

const REVIEW_STATUSES = ['COLLECTING', 'REVIEW_REQUIRED', 'PARTIAL_REVIEW_REQUIRED'];
const WELCOME = [
  'Добро пожаловать в FLOWIE.',
  'Просто присылайте фотографии букетов. Каждая фотография автоматически отправляется на разбор сразу после сохранения.',
  'Готовые результаты можно открыть кнопкой «Посмотреть результат» внизу или командой /review.',
  'Магазин: https://flowie.art',
  'Панель команды: https://admin.flowie.art',
].join('\n');

function commandOf(text) { return String(text || '').trim().split(/\s+/, 1)[0].toLowerCase().replace(/@[a-zA-Z0-9_]+$/, ''); }
function array(value) { return Array.isArray(value) ? value : []; }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function hasDrafts(row) { return array(row?.state?.drafts).length > 0; }

function createTelegramBouquetReviewHandler({ prisma, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('prisma and fetchImpl are required');
  const config = getTelegramBouquetImportConfig(env);
  return async (update) => {
    const message = update?.message;
    const command = commandOf(message?.text);
    if (!['/start', '/review', '/next'].includes(command)) return { handled: false };
    const chatId = message?.chat?.id; const userId = message?.from?.id;
    if (!config.token || chatId == null || userId == null || !isAuthorized(config, chatId, userId)) {
      return { handled: true, ignored: !config.token ? 'disabled' : 'unauthorized' };
    }
    if (!Number.isSafeInteger(update?.update_id)) return { handled: true, ignored: 'unsupported' };
    const updateId = String(update.update_id);
    try { await prisma.bouquetImportUpdate.create({ data: { updateId } }); }
    catch (error) { if (error?.code === 'P2002') return { handled: true, status: 'duplicate' }; throw error; }

    let completed = false;
    const send = async (method, payload) => {
      const response = await fetchImpl(`${config.apiBase}/bot${config.token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, ...payload,
          ...(method === 'sendMessage' ? { reply_markup: bouquetKeyboard(command === '/start' ? 'collecting' : 'review') } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('BOUQUET_REVIEW_SEND_FAILED');
    };

    try {
      if (command === '/start') {
        await send('sendMessage', { text: WELCOME }); completed = true;
        return { handled: true, status: 'welcome' };
      }
      const candidates = await prisma.bouquetImportBatch.findMany({
        where: { chatId: String(chatId), userId: String(userId), status: { in: REVIEW_STATUSES } },
        orderBy: { createdAt: 'desc' }, take: 50,
      });
      // A newest empty COLLECTING batch must not hide an older usable result.
      const batch = array(candidates).find(hasDrafts);
      if (!batch) {
        await send('sendMessage', { text: 'Готовых результатов пока нет. Пришлите фотографию — разбор начнётся автоматически.' });
        completed = true; return { handled: true, status: 'not_ready' };
      }

      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', batch.id);
        const latest = await tx.bouquetImportBatch.findUnique({ where: { id: batch.id } });
        if (!latest || !hasDrafts(latest)) return { status: 'not_ready' };
        const state = clone(latest.state); const drafts = array(state.drafts);
        const previous = Number.isInteger(state.reviewCursor) && state.reviewCursor >= 0 ? state.reviewCursor : null;
        const cursor = command === '/next' && previous != null && !state.reviewCompleted ? previous + 1 : (previous ?? 0);
        if (cursor >= drafts.length) {
          const alreadyCompleted = command === '/next' && state.reviewCompleted === true;
          return { status: 'complete', notify: !alreadyCompleted,
            persist: command === '/next' && !alreadyCompleted, draftCount: drafts.length };
        }

        const draft = drafts[cursor] && typeof drafts[cursor] === 'object' ? drafts[cursor] : {};
        const photoIds = new Set(array(draft.photoIds).map(String));
        const relatedFiles = array(state.files).filter((item) => item && photoIds.has(String(item.id)));
        const file = relatedFiles.find((item) => item.status === 'STORED' && typeof item.fileId === 'string' && item.fileId.trim());
        const mediaGroups = new Set(relatedFiles.map((item) => item.mediaGroupId).filter(Boolean).map(String));
        const notes = array(state.notes).filter((note) => note && (photoIds.has(String(note.targetId))
          || [...mediaGroups].some((groupId) => note.targetId === `media-group:${groupId}`)))
          .map((note) => String(note.text || '').trim()).filter(Boolean);
        const title = String(draft.draft_name || 'Букет без названия').trim().slice(0, 240);
        const flowers = array(draft.likely_flowers).map((item) => String(item).trim()).filter(Boolean);
        const description = [`${cursor + 1}/${drafts.length}. ${title}`,
          flowers.length ? `Предположительно: ${flowers.join(', ')}.` : 'Предполагаемый состав ещё не указан.', ...notes].join('\n');
        const recipeId = typeof draft.recipeId === 'string' ? draft.recipeId.trim() : '';
        return { status: 'shown', cursor, recipeId: recipeId || null, fileId: file?.fileId || null, description };
      });

      if (plan.status === 'not_ready') {
        await send('sendMessage', { text: 'Готовых результатов пока нет. Пришлите фотографию — разбор начнётся автоматически.' });
      } else if (plan.status === 'complete') {
        if (plan.notify) await send('sendMessage', { text: 'Все готовые фотографии просмотрены. Новые результаты появятся здесь автоматически.' });
      } else {
        if (plan.fileId) await send('sendPhoto', { photo: plan.fileId, caption: plan.description.slice(0, 1000) });
        else await send('sendMessage', { text: plan.description.slice(0, 3500) });
        if (plan.recipeId) await send('sendMessage', { text: ['Запишите состав сообщением:', `/recipe ${plan.recipeId}`,
          'Роза Пинк Флойд; 9; шт', 'Эвкалипт; 2; ветка', '', 'Потом подтвердите:',
          `/recipe_confirm ${plan.recipeId}`, '', 'Следующее фото — /next'].join('\n') });
        else await send('sendMessage', { text: 'Для этого черновика рецепт ещё не создан. Перейдите к следующему фото командой /next и сообщите администратору.' });
      }

      if (plan.status === 'shown' || (plan.status === 'complete' && plan.persist)) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', batch.id);
          const latest = await tx.bouquetImportBatch.findUnique({ where: { id: batch.id } });
          if (!latest) return;
          const state = clone(latest.state);
          if (plan.status === 'shown') {
            state.reviewCursor = plan.cursor; state.reviewCompleted = false;
          } else if (array(state.drafts).length === plan.draftCount) {
            state.reviewCursor = plan.draftCount; state.reviewCompleted = true;
          }
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
        });
      }
      completed = true;
      const { fileId, description, notify, persist, draftCount, ...result } = plan;
      return { handled: true, ...result };
    } finally {
      if (!completed) try { await prisma.bouquetImportUpdate.delete({ where: { updateId } }); } catch { /* unavailable */ }
    }
  };
}

module.exports = { WELCOME, createTelegramBouquetReviewHandler, _test: { hasDrafts } };
