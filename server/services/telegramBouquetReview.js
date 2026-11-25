'use strict';

const { getTelegramBouquetImportConfig, isAuthorized } = require('./telegramBouquetImport');
const { bouquetKeyboard } = require('./telegramBouquetKeyboard');
const { getCardEconomics } = require('./bouquetCardEconomics');

const REVIEW_STATUSES = ['COLLECTING', 'REVIEW_REQUIRED', 'PARTIAL_REVIEW_REQUIRED'];
const WELCOME = [
  'Добро пожаловать в FLOWIE.',
  'Просто присылайте фотографии букетов. Каждая фотография автоматически отправляется на разбор сразу после сохранения.',
  'Готовые результаты можно открыть кнопкой «Посмотреть результат» внизу.',
  'Магазин: https://flowie.art',
  'Панель команды: https://admin.flowie.art',
].join('\n');

function commandOf(text) { return String(text || '').trim().split(/\s+/, 1)[0].toLowerCase().replace(/@[a-zA-Z0-9_]+$/, ''); }
function array(value) { return Array.isArray(value) ? value : []; }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function visibleDrafts(state) { return array(state?.drafts).filter((draft) => draft && !draft.mergedInto); }
function hasDrafts(row) { return visibleDrafts(row?.state).length > 0; }

function compositionLines(value) {
  const source = Array.isArray(value) ? value : array(value?.lines);
  return source.map((line) => {
    if (typeof line === 'string') return line.trim();
    if (!line || typeof line !== 'object') return '';
    const name = String(line.name || line.flower || '').trim();
    return name ? `${name}${line.quantity == null ? '' : ` — ${line.quantity}${line.unit ? ` ${line.unit}` : ''}`}` : '';
  }).filter(Boolean).slice(0, 30);
}

function formatRubles(kopecks) {
  return Number.isSafeInteger(kopecks) && kopecks >= 0
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(kopecks / 100)} ₽` : null;
}
function cleanFlowerName(value) {
  return String(value || '').replace(/\s*[—-]\s*(?:предположительно|черновик)\s*$/iu, '')
    .replace(/\s*\((?:предварительный вариант|предположительно|черновик)\)\s*$/iu, '').trim();
}

function cardCaption({ draft, recipe, economics, photoCount, sellingPriceRubles = draft?.sellingPriceRubles }) {
  const title = cleanFlowerName(draft?.draft_name || 'Букет без названия').slice(0, 240);
  const recipeLines = compositionLines(recipe?.lines);
  const confirmed = recipe?.confirmedAt ? recipeLines : [];
  const proposal = confirmed.length ? [] : (recipeLines.length ? recipeLines
    : compositionLines(draft?.compositionProposal || draft?.composition_proposal));
  const fallback = confirmed.length || proposal.length ? [] : array(draft?.likely_flowers).map(cleanFlowerName).filter(Boolean);
  const lines = confirmed.length ? confirmed : (proposal.length ? proposal : fallback);
  return [`Название: ${title}`, '', `Состав${confirmed.length ? '' : ' — проверьте'}:`,
    ...(lines.length ? lines.map((line) => `• ${line}`) : ['• не указан']),
    ...array(draft?.compositionNotes).map((note) => `• ${note}`), '',
    `Продажная цена: ${Number.isInteger(sellingPriceRubles) && sellingPriceRubles > 0 ? formatRubles(sellingPriceRubles * 100) : 'не указана'}`,
    `Закупка: ${formatRubles(economics?.totalPurchaseKopecks) || 'не рассчитана — уточните состав и закупку'}`,
    `Фото: ${photoCount}`].join('\n').slice(0, 1024);
}

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
          ...(['sendMessage', 'sendPhoto'].includes(method)
            ? { reply_markup: bouquetKeyboard(command === '/start' ? 'collecting' : 'review') } : {}) }),
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
        const state = clone(latest.state); const drafts = visibleDrafts(state);
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
        const fileIds = [...new Set(relatedFiles.filter((item) => item.status === 'STORED')
          .map((item) => String(item.fileId || '').trim()).filter(Boolean))];
        const recipeId = typeof draft.recipeId === 'string' ? draft.recipeId.trim() : '';
        return { status: 'shown', cursor, recipeId: recipeId || null, fileIds, draft };
      });

      if (plan.status === 'not_ready') {
        await send('sendMessage', { text: 'Готовых результатов пока нет. Пришлите фотографию — разбор начнётся автоматически.' });
      } else if (plan.status === 'complete') {
        if (plan.notify) await send('sendMessage', { text: 'Все готовые фотографии просмотрены. Новые результаты появятся здесь автоматически.' });
      } else {
        const recipe = plan.recipeId && prisma.bouquetRecipe?.findUnique
          ? await prisma.bouquetRecipe.findUnique({ where: { id: plan.recipeId } }) : null;
        const economics = recipe ? await getCardEconomics({ prisma, recipe }).catch(() => null) : null;
        const product = plan.draft.productId && prisma.product?.findUnique
          ? await prisma.product.findUnique({ where: { id: plan.draft.productId }, select: { price: true } }) : null;
        const caption = cardCaption({ draft: plan.draft, recipe, economics, photoCount: plan.fileIds.length,
          sellingPriceRubles: product ? product.price : plan.draft.sellingPriceRubles });
        if (plan.fileIds.length === 1) await send('sendPhoto', { photo: plan.fileIds[0], caption });
        else if (plan.fileIds.length > 1) {
          for (let offset = 0; offset < plan.fileIds.length; offset += 10) {
            const ids = plan.fileIds.slice(offset, offset + 10);
            if (ids.length === 1) await send('sendPhoto', { photo: ids[0], ...(offset === 0 ? { caption } : {}) });
            else await send('sendMediaGroup', { media: ids.map((media, index) => ({ type: 'photo', media,
              ...(offset === 0 && index === 0 ? { caption } : {}) })) });
          }
          await send('sendMessage', { text: 'Изменить карточку можно кнопками внизу.' });
        } else await send('sendMessage', { text: caption });
      }

      if (plan.status === 'shown' || (plan.status === 'complete' && plan.persist)) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', batch.id);
          const latest = await tx.bouquetImportBatch.findUnique({ where: { id: batch.id } });
          if (!latest) return;
          const state = clone(latest.state);
          if (plan.status === 'shown') {
            state.reviewCursor = plan.cursor; state.reviewCompleted = false;
          } else if (visibleDrafts(state).length === plan.draftCount) {
            state.reviewCursor = plan.draftCount; state.reviewCompleted = true;
          }
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
        });
      }
      completed = true;
      const { fileIds, draft, notify, persist, draftCount, ...result } = plan;
      return { handled: true, ...result };
    } finally {
      if (!completed) try { await prisma.bouquetImportUpdate.delete({ where: { updateId } }); } catch { /* unavailable */ }
    }
  };
}

module.exports = { WELCOME, cardCaption, compositionLines, createTelegramBouquetReviewHandler,
  _test: { cleanFlowerName, formatRubles, hasDrafts, visibleDrafts } };
