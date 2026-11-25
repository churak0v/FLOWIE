'use strict';

const path = require('node:path');

const DEFAULT_API_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function parseIdSet(value) {
  return new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^-?\d+$/.test(item)));
}

function getTelegramBouquetImportConfig(env = process.env) {
  return {
    token: String(env.TELEGRAM_ORDER_BOT_TOKEN || '').trim(),
    apiBase: String(env.TELEGRAM_ORDER_API_BASE || DEFAULT_API_BASE).trim().replace(/\/$/, ''),
    chatIds: parseIdSet(env.TELEGRAM_BOUQUET_IMPORT_CHAT_IDS || env.TELEGRAM_ORDER_CHAT_IDS),
    userIds: parseIdSet(env.TELEGRAM_BOUQUET_IMPORT_USER_IDS),
  };
}

function isAuthorized(config, chatId, userId) {
  const chatAllowed = config.chatIds.size > 0 && config.chatIds.has(String(chatId));
  const userAllowed = config.userIds.size === 0 || config.userIds.has(String(userId));
  return chatAllowed && userAllowed;
}

function sanitizeError(error, token) {
  const message = String(error?.message || error || 'unknown error');
  return (token ? message.replaceAll(String(token), '[REDACTED]') : message).slice(0, 1000);
}

function safeSegment(value, fallback) {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function extensionFor(file) {
  const original = path.extname(String(file.originalName || '')).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(original)) return original;
  const byMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  return byMime[file.mimeType] || '.img';
}

function storageKey(importId, file) {
  const importPart = safeSegment(importId, 'import');
  const filePart = safeSegment(file.fileUniqueId || file.fileId, 'image');
  return `flowie-import/${importPart}/${filePart}${extensionFor(file)}`;
}

function extractImage(message) {
  if (Array.isArray(message?.photo) && message.photo.length) {
    const best = [...message.photo].sort((a, b) =>
      (((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))) ||
      ((b.file_size || 0) - (a.file_size || 0)))[0];
    return {
      fileId: best.file_id,
      fileUniqueId: best.file_unique_id,
      size: best.file_size || null,
      mimeType: 'image/jpeg',
      originalName: null,
      kind: 'photo',
    };
  }
  const document = message?.document;
  if (document?.file_id && String(document.mime_type || '').toLowerCase().startsWith('image/')) {
    return {
      fileId: document.file_id,
      fileUniqueId: document.file_unique_id,
      size: document.file_size || null,
      mimeType: document.mime_type,
      originalName: document.file_name || null,
      kind: 'document',
    };
  }
  return null;
}

function commandOf(text) {
  const first = String(text || '').trim().split(/\s+/, 1)[0].toLowerCase();
  return first.startsWith('/') ? first.replace(/@[^@]+$/, '') : '';
}

function finishCallbackData(importId) {
  const value = `bouquet_import:finish:${importId}`;
  if (Buffer.byteLength(value, 'utf8') > 64) throw new Error('IMPORT_CALLBACK_DATA_TOO_LONG');
  return value;
}

function parseFinishCallbackData(value) {
  const match = /^bouquet_import:finish:([a-zA-Z0-9_-]+)$/.exec(String(value || ''));
  return match ? match[1] : null;
}

/**
 * Repository contract (all claim/reserve operations must be atomic):
 * - claimUpdate({ updateId, chatId, userId }): boolean
 * - releaseUpdate(updateId) (allows retry after synchronous handling failure)
 * - findActiveImport({ chatId, userId }): import|null
 * - createImport({ chatId, userId, startedAt }): import
 * - reserveFile({ importId, ...telegram metadata, storageKey }): file|null
 *   Returns null when that Telegram file/message was already captured.
 * - markFileStored({ fileId, storageKey, storedAt })
 * - markFileFailed({ fileId, error, failedAt })
 * - claimFailedFiles(importId): file[] (atomically changes FAILED to PENDING for retry)
 * - findAttachmentTargets({ importId, messageId, mediaGroupId }): target[]
 * - addNote({ importId, text, targetId, sourceMessageId, createdAt })
 * - requestFinalize({ importId, requestedAt })
 * - getFinalizeState(importId): { finalizeRequested, unresolvedFiles }
 *   unresolvedFiles includes both PENDING and FAILED files.
 * - claimAnalysis(importId): boolean (true exactly once, and only when finalized + no unresolved files)
 *
 * storage.put({ key, body, contentType, metadata }) stores the original bytes.
 * analysisQueue.enqueue({ importId }) queues paid/AI work; it is never called before finalize.
 */
function createTelegramBouquetImportService(options) {
  const {
    repository,
    storage,
    analysisQueue,
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    downloadTimeoutMs = DEFAULT_TIMEOUT_MS,
    maxFileBytes = DEFAULT_MAX_BYTES,
  } = options || {};
  if (!repository || !storage || !analysisQueue || typeof fetchImpl !== 'function') {
    throw new TypeError('repository, storage, analysisQueue and fetchImpl are required');
  }
  const config = getTelegramBouquetImportConfig(env);
  const downloads = new Set();

  async function maybeQueue(importId) {
    const state = await repository.getFinalizeState(importId);
    if (!state?.finalizeRequested || state.schedulerRequired || state.settled === false || Number(state.unresolvedFiles) !== 0) return false;
    if (!await repository.claimAnalysis(importId)) return false;
    await analysisQueue.enqueue({ importId });
    return true;
  }

  async function telegramJson(method, body, signal) {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(`Telegram ${method} failed: ${payload.description || response.status}`);
    return payload.result;
  }

  async function downloadAndStore(importRecord, reserved, file) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), downloadTimeoutMs);
    timer.unref?.();
    try {
      const remote = await telegramJson('getFile', { file_id: file.fileId }, controller.signal);
      const response = await fetchImpl(`${config.apiBase}/file/bot${config.token}/${remote.file_path}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
      const advertised = Number(response.headers?.get?.('content-length') || file.size || 0);
      if (advertised > maxFileBytes) throw new Error('Telegram file exceeds size limit');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxFileBytes) throw new Error('Telegram file exceeds size limit');
      await storage.put({
        key: reserved.storageKey,
        body: bytes,
        contentType: file.mimeType,
        metadata: { telegramFileUniqueId: file.fileUniqueId, importId: String(importRecord.id) },
      });
      await repository.markFileStored({ fileId: reserved.id, storageKey: reserved.storageKey, storedAt: now() });
    } catch (error) {
      await repository.markFileFailed({
        fileId: reserved.id,
        error: sanitizeError(error, config.token),
        failedAt: now(),
      });
    } finally {
      clearTimeout(timer);
      await maybeQueue(importRecord.id);
    }
  }

  function trackDownload(promise) {
    downloads.add(promise);
    promise.then(
      () => downloads.delete(promise),
      () => downloads.delete(promise),
    );
  }

  async function saveText(importRecord, message, text) {
    let targets = [];
    const reply = message.reply_to_message;
    if (reply) {
      targets = await repository.findAttachmentTargets({
        importId: importRecord.id,
        messageId: reply.message_id,
        mediaGroupId: reply.media_group_id || null,
      });
    } else if (message.media_group_id || extractImage(message)) {
      targets = await repository.findAttachmentTargets({
        importId: importRecord.id,
        messageId: message.message_id,
        mediaGroupId: message.media_group_id || null,
      });
    }
    await repository.addNote({
      importId: importRecord.id,
      text: String(text).trim(),
      targetId: targets.length === 1 ? targets[0].id : null,
      sourceMessageId: message.message_id,
      createdAt: now(),
    });
  }

  async function handleUpdate(update) {
    const message = update?.message || update?.channel_post;
    const callback = update?.callback_query;
    const source = message || callback?.message;
    const chatId = source?.chat?.id;
    const userId = (message?.from || callback?.from)?.id;
    if (!Number.isSafeInteger(update?.update_id) || chatId == null || userId == null) return { ignored: 'unsupported' };
    if (!isAuthorized(config, chatId, userId)) return { ignored: 'unauthorized' };
    if (!config.token) return { ignored: 'disabled' };
    if (!await repository.claimUpdate({ updateId: update.update_id, chatId, userId })) return { ignored: 'duplicate' };

    try {

    const incomingImage = extractImage(message);
    if (message && (commandOf(message.text) === '/import' || incomingImage)) {
      const active = await repository.findActiveImport({ chatId, userId });
      if (commandOf(message.text) === '/import') {
        if (active) return { importId: active.id, status: 'already_active' };
        const created = await repository.createImport({ chatId, userId, startedAt: now() });
        return { importId: created.id, status: 'started' };
      }
      if (!active) await repository.createImport({ chatId, userId, startedAt: now() });
    }

    const active = await repository.findActiveImport({ chatId, userId });
    if (!active) return { ignored: 'no_active_import' };

    if (message && commandOf(message.text) === '/import_more') {
      await repository.deferConfirmation(active.id);
      return { importId: active.id, status: 'continue_upload' };
    }
    if (message && commandOf(message.text) === '/import_done') {
      await repository.requestFinalize({ importId: active.id, requestedAt: now(), requirePrompt: true });
      await maybeQueue(active.id);
      return { importId: active.id, status: 'waiting_for_files' };
    }

    if (message && ['/import_retry', '/retry'].includes(commandOf(message.text))) {
      const failed = await repository.claimFailedFiles(active.id);
      for (const file of failed) trackDownload(downloadAndStore(active, file, file));
      return { importId: active.id, status: failed.length ? 'retrying_files' : 'nothing_to_retry' };
    }

    const callbackImportId = callback ? parseFinishCallbackData(callback.data) : null;
    if (callbackImportId) {
      if (String(callbackImportId) !== String(active.id)) {
        return { importId: active.id, status: 'stale_callback' };
      }
      await repository.requestFinalize({ importId: active.id, requestedAt: now() });
      const queued = await maybeQueue(active.id);
      return { importId: active.id, status: queued ? 'queued' : 'waiting_for_files' };
    }

    if (!message) return { ignored: 'unsupported' };
    const image = extractImage(message);
    let reserved = null;
    if (image) {
      const key = storageKey(active.id, image);
      reserved = await repository.reserveFile({
        importId: active.id,
        messageId: message.message_id,
        mediaGroupId: message.media_group_id || null,
        ...image,
        storageKey: key,
        createdAt: now(),
        sentAt: Number.isSafeInteger(message.date) ? new Date(message.date * 1000).toISOString() : null,
      });
      if (reserved) trackDownload(downloadAndStore(active, reserved, image));
    }
    const text = message.caption || (commandOf(message.text) ? '' : message.text);
    if (String(text || '').trim()) await saveText(active, message, text);
    return { importId: active.id, status: reserved ? 'file_pending' : 'captured' };
    } catch (error) {
      if (error.message === 'IMPORT_CONFIRMATION_STALE') return { status: 'confirmation_stale' };
      if (error.message === 'IMPORT_ALREADY_FINALIZED') return { status: 'closed_import' };
      await repository.releaseUpdate(update.update_id);
      throw error;
    }
  }

  async function waitForIdle() {
    while (downloads.size) await Promise.allSettled([...downloads]);
  }

  return { handleUpdate, waitForIdle };
}

module.exports = {
  createTelegramBouquetImportService,
  extractImage,
  finishCallbackData,
  getTelegramBouquetImportConfig,
  isAuthorized,
  parseFinishCallbackData,
  storageKey,
};
