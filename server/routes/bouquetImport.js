const express = require('express');
const crypto = require('crypto');
const { createTelegramBouquetImportService } = require('../services/telegramBouquetImport');
const { bouquetKeyboard, normalizeBouquetUpdate } = require('../services/telegramBouquetKeyboard');
const { createBouquetImportRepository } = require('../services/bouquetImportRepository');
const { createTelegramBouquetRecipeHandler } = require('../services/telegramBouquetRecipe');
const { createTelegramBouquetReviewHandler } = require('../services/telegramBouquetReview');
const { createTelegramBouquetCardActionsHandler } = require('../services/telegramBouquetCardActions');

function createBouquetImportRouter({
  prisma, storage, env = process.env, fetchImpl = fetch,
  repository: injectedRepository, service: injectedService,
}) {
  const router = express.Router();
  const recipeHandler = prisma ? createTelegramBouquetRecipeHandler({ prisma, env, fetchImpl }) : async () => ({ handled: false });
  const reviewHandler = prisma ? createTelegramBouquetReviewHandler({ prisma, env, fetchImpl }) : async () => ({ handled: false });
  const cardActionsHandler = prisma ? createTelegramBouquetCardActionsHandler({ prisma, env, fetchImpl }) : async () => ({ handled: false });
  const repository = injectedRepository || createBouquetImportRepository(prisma);
  const service = injectedService || createTelegramBouquetImportService({ repository, storage, env, fetchImpl,
    // A separate worker consumes stored photos; legacy Batch mode uses QUEUED.
    analysisQueue: { enqueue: async () => {} },
  });
  const secret = String(env.TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET || '');
  router.post('/webhook', async (req, res) => {
    const actual = String(req.get('x-telegram-bot-api-secret-token') || '');
    const digest = (value) => crypto.createHash('sha256').update(value).digest();
    if (!secret || !crypto.timingSafeEqual(digest(actual), digest(secret))) return res.sendStatus(403);
    try {
      req.body = normalizeBouquetUpdate(req.body);
      const cardAction = await cardActionsHandler(req.body);
      if (cardAction.handled) {
        if (cardAction.status === 'merge_saved' && env.FLOWIE_IMPORT_MATERIALIZE_PRODUCTS === 'true') {
          await require('../services/bouquetProductDrafts').materializeBouquetProductDrafts({ prisma, storage, importId: cardAction.importId });
        }
        return res.json({ ok: true });
      }
      if ((await recipeHandler(req.body)).handled) return res.json({ ok: true });
      if ((await reviewHandler(req.body)).handled) return res.json({ ok: true });
      const result = await service.handleUpdate(req.body);
      const chatId = req.body.message?.chat?.id || req.body.callback_query?.message?.chat?.id;
      const callbackId = req.body.callback_query?.id;
      const token = env.TELEGRAM_ORDER_BOT_TOKEN;
      const base = String(env.TELEGRAM_ORDER_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
      const telegramRequest = async (method, payload) => {
        const response = await fetchImpl(`${base}/bot${token}/${method}`, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED`);
      };
      const texts = {
        started: 'Присылайте фотографии букетов несколькими пачками. Через минуту после последней фотографии спрошу, всё ли загружено. Состав можно указать в подписи или ответом на фото. Разбор начнётся только после подтверждения.',
        already_active: 'Загрузка уже открыта. Продолжайте отправлять фотографии и составы.',
        continue_upload: 'Хорошо, присылайте ещё. После паузы снова спрошу, всё ли загружено.',
        confirmation_stale: 'Пришли новые фотографии. Дождусь окончания загрузки и снова предложу подтвердить весь пакет.',
        waiting_for_files: 'Подтверждение получено. Завершаем приём и сохранение файлов, затем запускаем разбор. Если были ошибки, отправьте /import_retry.',
        closed_import: 'Эта загрузка уже подтверждена. Новые фотографии отправляйте в следующую загрузку через /import после начала обработки текущей.',
        queued: 'Все фотографии сохранены. Пакет поставлен в очередь разбора.',
        retrying_files: 'Повторяем загрузку файлов с ошибками.',
        nothing_to_retry: 'Файлов для повторной загрузки нет.',
      };
      if (String(env.FLOWIE_IMPORT_AI_MODE || 'sync').toLowerCase() !== 'batch') {
        Object.assign(texts, {
          started: 'Присылайте фотографии букетов. Каждый снимок разбирается автоматически после сохранения, подтверждать окончание загрузки не нужно. Состав можно указать в подписи или ответом на фото.',
          already_active: 'Присылайте ещё фотографии и составы. Каждый новый снимок разбирается автоматически.',
          continue_upload: 'Присылайте ещё. Разбор новых фотографий начнётся автоматически.',
          confirmation_stale: 'Подтверждать загрузку не нужно. Новые фотографии разбираются автоматически.',
          waiting_for_files: 'Фотографии сохраняются и разбираются автоматически. Результат появится внизу по кнопке «Посмотреть результат».',
          queued: 'Фотографии разбираются. Результат появится внизу по кнопке «Посмотреть результат».',
          automatic_processing: 'Подтверждать загрузку не нужно. Каждый снимок разбирается автоматически после сохранения; можно присылать ещё.',
        });
      }
      const telegramAllowed = !['unauthorized', 'disabled', 'unsupported'].includes(result.ignored);
      if (callbackId && telegramAllowed) {
        await telegramRequest('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: result.status === 'stale_callback'
            ? 'Эта кнопка относится к уже завершённой загрузке.'
            : 'Принято',
        });
      }
      if (texts[result.status] && chatId) {
        const payload = { chat_id: chatId, text: texts[result.status] };
        payload.reply_markup = bouquetKeyboard(['queued', 'waiting_for_files'].includes(result.status) ? 'processing' : 'collecting');
        await telegramRequest('sendMessage', payload);
      }
      return res.json({ ok: true });
    } catch {
      return res.status(503).json({ ok: false, error: 'IMPORT_RETRY_REQUIRED' });
    }
  });
  return router;
}

module.exports = { createBouquetImportRouter };
