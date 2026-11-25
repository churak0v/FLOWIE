const express = require('express');
const crypto = require('crypto');
const { createTelegramBouquetImportService } = require('../services/telegramBouquetImport');
const { bouquetKeyboard, normalizeBouquetUpdate } = require('../services/telegramBouquetKeyboard');
const { createBouquetImportRepository } = require('../services/bouquetImportRepository');
const { createTelegramBouquetRecipeHandler } = require('../services/telegramBouquetRecipe');
const { createTelegramBouquetReviewHandler } = require('../services/telegramBouquetReview');

function createBouquetImportRouter({
  prisma, storage, env = process.env, fetchImpl = fetch,
  repository: injectedRepository, service: injectedService,
}) {
  const router = express.Router();
  const recipeHandler = prisma ? createTelegramBouquetRecipeHandler({ prisma, env, fetchImpl }) : async () => ({ handled: false });
  const reviewHandler = prisma ? createTelegramBouquetReviewHandler({ prisma, env, fetchImpl }) : async () => ({ handled: false });
  const repository = injectedRepository || createBouquetImportRepository(prisma);
  const service = injectedService || createTelegramBouquetImportService({ repository, storage, env, fetchImpl,
    // QUEUED is the durable outbox. A separate worker consumes it after finalization.
    analysisQueue: { enqueue: async () => {} },
  });
  const secret = String(env.TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET || '');
  router.post('/webhook', async (req, res) => {
    const actual = String(req.get('x-telegram-bot-api-secret-token') || '');
    const digest = (value) => crypto.createHash('sha256').update(value).digest();
    if (!secret || !crypto.timingSafeEqual(digest(actual), digest(secret))) return res.sendStatus(403);
    try {
      req.body = normalizeBouquetUpdate(req.body);
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
