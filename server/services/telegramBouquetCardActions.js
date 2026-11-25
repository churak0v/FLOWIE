'use strict';

const { getTelegramBouquetImportConfig, isAuthorized } = require('./telegramBouquetImport');
const { CARD_ACTIONS, bouquetKeyboard } = require('./telegramBouquetKeyboard');
const { BouquetCardError, parseNaturalComposition } = require('./bouquetCardEconomics');

const STATUSES = ['COLLECTING', 'REVIEW_REQUIRED', 'PARTIAL_REVIEW_REQUIRED'];
const COMMANDS = new Set(Object.values(CARD_ACTIONS));
function array(value) { return Array.isArray(value) ? value : []; }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function commandOf(text) { const first = String(text || '').trim().split(/\s+/, 1)[0].toLowerCase(); return first.startsWith('/') ? first : ''; }
function visibleDrafts(state) { return array(state?.drafts).filter((draft) => draft && !draft.mergedInto); }
function targetId(draft) { return typeof draft?.customId === 'string' && draft.customId.trim() ? draft.customId.trim() : null; }
function sameLines(left, right) {
  const normalize = (lines) => array(lines).map((line) => ({ name: line?.name, quantity: line?.quantity, unit: line?.unit })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
function cleanCardName(value) {
  return String(value || 'Букет без названия').replace(/\s*[—-]\s*(?:предположительно|черновик)\s*$/iu, '')
    .replace(/\s*\((?:предварительный вариант|предположительно|черновик)\)\s*$/iu, '').trim().slice(0, 120);
}

function createTelegramBouquetCardActionsHandler({ prisma, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('BOUQUET_CARD_ACTIONS_CONFIG');
  const config = getTelegramBouquetImportConfig(env);
  const send = async (chatId, text) => {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: bouquetKeyboard('review') }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error('BOUQUET_CARD_ACTION_SEND_FAILED');
  };

  async function handleUpdate(update) {
    const message = update?.message;
    const text = String(message?.text || '').trim();
    const mapped = CARD_ACTIONS[text] || commandOf(text);
    const chatId = message?.chat?.id; const userId = message?.from?.id;
    if (chatId == null || userId == null || !config.token || !isAuthorized(config, chatId, userId)) return { handled: false };
    // Photo/document updates belong to the import handler. In particular, do not
    // claim the update while cardEdit.mode=photo or the original would be lost.
    if (array(message?.photo).length || message?.document) return { handled: false };

    const rows = await prisma.bouquetImportBatch.findMany({
      where: { chatId: String(chatId), userId: String(userId), status: { in: STATUSES } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    const batch = array(rows).find((row) => visibleDrafts(row.state).length > 0);
    if (!batch) return { handled: false };
    const edit = batch.state?.cardEdit;
    const consumesText = Boolean(text) && edit && ['name', 'composition', 'merge'].includes(edit.mode) && !commandOf(text);
    if (!COMMANDS.has(mapped) && !consumesText) return { handled: false };
    if (['/next', '/review'].includes(mapped)) {
      if (edit) await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', batch.id);
        const latest = await tx.bouquetImportBatch.findUnique({ where: { id: batch.id } });
        if (!latest?.state?.cardEdit) return;
        const state = clone(latest.state); delete state.cardEdit;
        await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
      });
      return { handled: false };
    }

    let claimed = false;
    if (Number.isSafeInteger(update?.update_id) && prisma.bouquetImportUpdate) {
      try { await prisma.bouquetImportUpdate.create({ data: { updateId: String(update.update_id) } }); claimed = true; }
      catch (error) { if (error?.code === 'P2002') return { handled: true, status: 'duplicate' }; throw error; }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', batch.id);
        const latest = await tx.bouquetImportBatch.findUnique({ where: { id: batch.id } });
        if (!latest) return { status: 'missing', text: 'Карточка не найдена. Откройте результат ещё раз.' };
        const state = clone(latest.state); const drafts = visibleDrafts(state);
        const cursor = Math.min(Math.max(0, Number.isInteger(state.reviewCursor) ? state.reviewCursor : 0), Math.max(0, drafts.length - 1));
        const current = drafts[cursor]; const currentId = targetId(current);
        if (!current || !currentId) return { status: 'missing', text: 'Карточка ещё готовится. Попробуйте немного позже.' };
        const source = array(state.drafts).find((draft) => targetId(draft) === currentId);

        if (mapped === '/card_cancel') {
          delete state.cardEdit;
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
          return { status: 'cancelled', text: 'Действие отменено.' };
        }
        if (mapped === '/card_edit_name') {
          state.cardEdit = { mode: 'name', targetCustomId: currentId };
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
          return { status: 'awaiting_name', text: 'Напишите новое название букета одним сообщением.' };
        }
        if (mapped === '/card_edit_composition') {
          state.cardEdit = { mode: 'composition', targetCustomId: currentId };
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
          return { status: 'awaiting_composition', text: 'Напишите состав, например: Роза 9 шт, эвкалипт 2 ветки.' };
        }
        if (mapped === '/card_add_photo') {
          state.cardEdit = { mode: 'photo', targetCustomId: currentId };
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
          return { status: 'awaiting_photo', text: 'Пришлите фотографию, которую нужно добавить к этой карточке.' };
        }
        if (mapped === '/card_merge') {
          state.cardEdit = { mode: 'merge', targetCustomId: currentId };
          await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
          const choices = drafts.map((draft, index) => ({ draft, index: index + 1 }))
            .filter(({ draft }) => targetId(draft) !== currentId)
            .map(({ draft, index }) => `${index}. ${cleanCardName(draft.draft_name)}`);
          return { status: 'awaiting_merge', text: ['Напишите номер карточки, которую нужно объединить с текущей:', ...choices].join('\n') };
        }
        if (mapped === '/card_confirm') {
          if (!source.recipeId) return { status: 'composition_missing', text: 'Сначала укажите состав букета.' };
          const recipe = tx.bouquetRecipe?.findUnique
            ? await tx.bouquetRecipe.findUnique({ where: { id: source.recipeId } }) : null;
          if (!array(recipe?.lines).length) return { status: 'composition_missing', text: 'Сначала укажите состав букета.' };
          await tx.bouquetRecipe.update({ where: { id: source.recipeId }, data: { confirmedAt: new Date() } });
          if (source.productId) {
            await tx.product.update({ where: { id: source.productId }, data: { composition: {
              deleteMany: {}, create: recipe.lines.map((line, index) => ({
                name: line.name, quantity: `${line.quantity} ${line.unit}`, sort: index + 1,
              })),
            } } });
          }
          return { status: 'confirmed', text: 'Состав подтверждён.' };
        }

        const pending = state.cardEdit;
        if (!pending || !consumesText) return { status: 'ignored' };
        const edited = array(state.drafts).find((draft) => targetId(draft) === pending.targetCustomId);
        if (!edited || edited.mergedInto) { delete state.cardEdit; return { status: 'missing', text: 'Карточка больше недоступна.' }; }
        if (pending.mode === 'name') {
          if (!text || text.length > 240) return { status: 'invalid_name', text: 'Название должно содержать от 1 до 240 символов.' };
          edited.draft_name = text; delete state.cardEdit;
          if (edited.recipeId) await tx.bouquetRecipe.update({ where: { id: edited.recipeId }, data: { name: text } });
          if (edited.productId) await tx.product.update({ where: { id: edited.productId }, data: { name: text } });
        } else if (pending.mode === 'composition') {
          const lines = parseNaturalComposition(text);
          if (!edited.recipeId) return { status: 'composition_missing', text: 'Состав пока нельзя сохранить. Попробуйте немного позже.' };
          await tx.bouquetRecipe.update({ where: { id: edited.recipeId }, data: { lines, confirmedAt: null, snapshot: null } });
          edited.compositionProposal = lines; delete state.cardEdit;
        } else if (pending.mode === 'merge') {
          const number = Number(text);
          if (!Number.isSafeInteger(number) || number < 1 || number > drafts.length) return { status: 'invalid_merge', text: `Укажите номер карточки от 1 до ${drafts.length}.` };
          const secondary = drafts[number - 1];
          if (!secondary || targetId(secondary) === pending.targetCustomId) return { status: 'invalid_merge', text: 'Выберите другую карточку.' };
          if (secondary.recipeId && tx.bouquetRecipe?.findUnique) {
            const [primaryRecipe, secondaryRecipe] = await Promise.all([
              edited.recipeId ? tx.bouquetRecipe.findUnique({ where: { id: edited.recipeId } }) : null,
              tx.bouquetRecipe.findUnique({ where: { id: secondary.recipeId } }),
            ]);
            if (secondaryRecipe?.confirmedAt && (!primaryRecipe?.confirmedAt || !sameLines(primaryRecipe.lines, secondaryRecipe.lines))) {
              return { status: 'merge_protected', text: 'У выбранной карточки уже подтверждён другой состав. Сначала проверьте карточки отдельно.' };
            }
          }
          edited.photoIds = [...new Set([...array(edited.photoIds), ...array(secondary.photoIds)].map(String))];
          secondary.mergedInto = pending.targetCustomId;
          state.reviewCursor = Math.max(0, visibleDrafts(state).findIndex((draft) => targetId(draft) === pending.targetCustomId));
          delete state.cardEdit;
        } else return { status: 'ignored' };
        await tx.bouquetImportBatch.update({ where: { id: batch.id }, data: { state } });
        const messages = { name: 'Название обновлено.', composition: 'Состав обновлён. Проверьте его и подтвердите.',
          merge: 'Карточки объединены.' };
        return { status: `${pending.mode}_saved`, text: messages[pending.mode] };
      });
      if (result.text) await send(chatId, result.text);
      return { handled: result.status !== 'ignored', status: result.status, importId: batch.id };
    } catch (error) {
      if (error instanceof BouquetCardError) {
        await send(chatId, error.message); return { handled: true, status: 'invalid_composition' };
      }
      if (claimed) await prisma.bouquetImportUpdate.deleteMany({ where: { updateId: String(update.update_id) } }).catch(() => {});
      throw error;
    }
  }
  handleUpdate.handleUpdate = handleUpdate;
  return handleUpdate;
}

module.exports = { createTelegramBouquetCardActionsHandler,
  _test: { cleanCardName, sameLines, targetId, visibleDrafts } };
