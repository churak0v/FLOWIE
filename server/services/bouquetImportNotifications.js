'use strict';

const { getTelegramBouquetImportConfig } = require('./telegramBouquetImport');
const { bouquetKeyboard } = require('./telegramBouquetKeyboard');

const TERMINAL_STATUSES = [
  'REVIEW_REQUIRED',
  'PARTIAL_REVIEW_REQUIRED',
  'PREPARE_FAILED',
  'PROVIDER_FAILED',
  'PROVIDER_EXPIRED',
  'PROVIDER_CANCELLED',
  'UNCERTAIN',
];
const READY_STATUSES = new Set(['REVIEW_REQUIRED', 'PARTIAL_REVIEW_REQUIRED']);
const DEFAULT_LEASE_MS = 2 * 60_000;
const MAX_CANDIDATES = 25;
const MAX_BACKOFF_MS = 15 * 60_000;
const CANDIDATE_STATUSES = ['COLLECTING', ...TERMINAL_STATUSES];

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function dateMs(value) { const n = new Date(value || 0).getTime(); return Number.isFinite(n) ? n : 0; }
function safeError(error, token) {
  const raw = String(error?.message || error || 'notification failed');
  return (token ? raw.replaceAll(token, '[REDACTED]') : raw).slice(0, 300);
}
function draftCount(row) { return Array.isArray(row?.state?.drafts) ? row.state.drafts.length : 0; }
function completedAt(row) { return row?.state?.syncCompletedAt || row?.state?.aiBatch?.completedAt || null; }
function eligible(row, now, leaseMs) {
  if (!row || !CANDIDATE_STATUSES.includes(row.status)) return false;
  if (Object.values(row.state?.groupingAttempts || {}).some((attempt) => attempt?.status === 'RUNNING'
    && dateMs(attempt.startedAt) > now.getTime() - leaseMs)) return false;
  const note = row.state?.reviewNotification;
  if (note?.status === 'SENDING' && dateMs(note.leaseAt) > now.getTime() - leaseMs) return false;
  if (note?.status === 'RETRY' && dateMs(note.nextAttemptAt) > now.getTime()) return false;
  const count = draftCount(row);
  const sentCount = Math.max(0, Number(row.state?.sentDraftCount ?? note?.sentDraftCount) || 0);
  if (row.status === 'COLLECTING') return count > sentCount;
  if (note?.status !== 'SENT') return true;
  if (note.notifiedStatus && note.notifiedStatus !== row.status) return true;
  if (note?.notifiedStatus && count > sentCount && READY_STATUSES.has(row.status)) return true;
  const completion = completedAt(row);
  // Legacy SENT records did not identify the phase. A later successful completion
  // must be announced even if an earlier failure notification was already sent.
  if (completion && dateMs(completion) > dateMs(note.notifiedCompletedAt || note.sentAt)) return true;
  return false;
}
function notificationText(row) {
  const cards = (row.state?.drafts || []).filter((draft) => !draft.mergedInto).length;
  if (row.status === 'COLLECTING') {
    return `Готово карточек: ${cards}. Нажмите «Посмотреть результат» внизу, чтобы проверить фотографии и составы.`;
  }
  if (READY_STATUSES.has(row.status)) {
    const count = cards;
    const lead = row.status === 'PARTIAL_REVIEW_REQUIRED' ? 'Разбор загрузки завершён частично.' : 'Разбор загрузки завершён.';
    return `${lead} Готово черновиков: ${count}. Нажмите «Посмотреть результат» внизу, чтобы проверить фотографии и составы.`;
  }
  return 'Не удалось завершить разбор загрузки. Фотографии сохранены. Попробуйте повторить позже или обратитесь к администратору FLOWIE.';
}

function createBouquetImportNotifications({ prisma, env = process.env, fetchImpl = globalThis.fetch,
  now = () => new Date(), leaseMs = DEFAULT_LEASE_MS } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('BOUQUET_IMPORT_NOTIFICATIONS_CONFIG');
  const config = getTelegramBouquetImportConfig(env);

  async function candidateIds() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT "id" FROM "BouquetImportBatch"
      WHERE "status" IN ('COLLECTING','REVIEW_REQUIRED','PARTIAL_REVIEW_REQUIRED','PREPARE_FAILED','PROVIDER_FAILED','PROVIDER_EXPIRED','PROVIDER_CANCELLED','UNCERTAIN')
        AND ("status" <> 'COLLECTING' OR
          jsonb_array_length(CASE WHEN jsonb_typeof("state"->'drafts') = 'array' THEN "state"->'drafts' ELSE '[]'::jsonb END)
            > CASE WHEN COALESCE("state"->>'sentDraftCount', "state" #>> '{reviewNotification,sentDraftCount}', '') ~ '^[0-9]+$'
              THEN COALESCE("state"->>'sentDraftCount', "state" #>> '{reviewNotification,sentDraftCount}')::int ELSE 0 END)
        AND (COALESCE("state" #>> '{reviewNotification,status}', '') <> 'SENT'
          OR ("status" = 'COLLECTING' AND jsonb_array_length(CASE WHEN jsonb_typeof("state"->'drafts') = 'array' THEN "state"->'drafts' ELSE '[]'::jsonb END)
            > CASE WHEN COALESCE("state"->>'sentDraftCount', "state" #>> '{reviewNotification,sentDraftCount}', '') ~ '^[0-9]+$'
              THEN COALESCE("state"->>'sentDraftCount', "state" #>> '{reviewNotification,sentDraftCount}')::int ELSE 0 END)
          OR COALESCE(NULLIF("state" #>> '{syncCompletedAt}', '')::timestamptz,
            NULLIF("state" #>> '{aiBatch,completedAt}', '')::timestamptz, to_timestamp(0))
            > COALESCE(NULLIF("state" #>> '{reviewNotification,notifiedCompletedAt}', '')::timestamptz,
              NULLIF("state" #>> '{reviewNotification,sentAt}', '')::timestamptz, to_timestamp(0)))
        AND (COALESCE("state" #>> '{reviewNotification,status}', '') <> 'SENDING'
          OR COALESCE(NULLIF("state" #>> '{reviewNotification,leaseAt}', '')::timestamptz, to_timestamp(0)) <= now() - interval '2 minutes')
        AND (COALESCE("state" #>> '{reviewNotification,status}', '') <> 'RETRY'
          OR COALESCE(NULLIF("state" #>> '{reviewNotification,nextAttemptAt}', '')::timestamptz, to_timestamp(0)) <= now())
      ORDER BY "updatedAt" ASC LIMIT ${MAX_CANDIDATES}
    `);
    return Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];
  }

  async function claim(id) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', id);
      const row = await tx.bouquetImportBatch.findUnique({ where: { id } });
      const claimedAt = now();
      if (!eligible(row, claimedAt, leaseMs)) return null;
      const state = clone(row.state);
      const previous = state.reviewNotification || {};
      state.reviewNotification = { status: 'SENDING', attempts: Math.max(0, Number(previous.attempts) || 0) + 1,
        leaseAt: claimedAt.toISOString() };
      await tx.bouquetImportBatch.update({ where: { id }, data: { state } });
      return { ...row, state, notificationDraftCount: draftCount(row),
        notificationCompletedAt: completedAt(row), notificationText: notificationText({ ...row, state }) };
    });
  }

  async function mergeNotification(id, build) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', id);
      const latest = await tx.bouquetImportBatch.findUnique({ where: { id } });
      if (!latest) return null;
      const state = clone(latest.state);
      state.reviewNotification = build(state.reviewNotification || {});
      if (Number.isFinite(state.reviewNotification.sentDraftCount)) {
        state.sentDraftCount = Math.max(Number(state.sentDraftCount) || 0, state.reviewNotification.sentDraftCount);
      }
      return tx.bouquetImportBatch.update({ where: { id }, data: { state } });
    });
  }

  async function send(row) {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: row.chatId, text: row.notificationText,
        reply_markup: bouquetKeyboard(READY_STATUSES.has(row.status) ? 'review' : 'processing'),
      }), signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(`TELEGRAM_SEND_FAILED_${response.status}`);
  }

  async function runOnce() {
    if (!config.token) return { status: 'DISABLED' };
    for (const id of await candidateIds()) {
      const row = await claim(id);
      if (!row) continue;
      try {
        await send(row);
        const sentAt = now().toISOString();
        await mergeNotification(id, (latest) => ({ status: 'SENT',
          attempts: Math.max(row.state.reviewNotification.attempts, Number(latest.attempts) || 0), sentAt,
          notifiedStatus: row.status, notifiedCompletedAt: row.notificationCompletedAt,
          sentDraftCount: Math.max(Number(latest.sentDraftCount) || 0, row.notificationDraftCount) }));
        return { status: 'SENT', id };
      } catch (error) {
        const failedAt = now();
        const attempts = row.state.reviewNotification.attempts;
        const backoffMs = Math.min(MAX_BACKOFF_MS, 15_000 * (2 ** Math.min(attempts - 1, 10)));
        await mergeNotification(id, (latest) => ({ status: 'RETRY',
          attempts: Math.max(attempts, Number(latest.attempts) || 0), failedAt: failedAt.toISOString(),
          nextAttemptAt: new Date(failedAt.getTime() + backoffMs).toISOString(), error: safeError(error, config.token) }));
        return { status: 'RETRY', id, backoffMs };
      }
    }
    return { status: 'IDLE' };
  }
  return { runOnce };
}

function startBouquetImportNotifications(options = {}) {
  const intervalMs = options.intervalMs ?? 15_000;
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new TypeError('BOUQUET_IMPORT_NOTIFICATION_INTERVAL');
  const service = createBouquetImportNotifications(options);
  const logger = options.logger || console;
  let stopped = false; let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await service.runOnce();
    } catch (error) {
      logger.error?.('[bouquet-import-notifications] tick failed', {
        name: String(error?.name || 'Error').slice(0, 80),
        code: String(error?.code || 'UNKNOWN').slice(0, 80),
      });
    } finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs); timer.unref?.(); void tick();
  return { runOnce: service.runOnce, stop() { stopped = true; clearInterval(timer); } };
}

module.exports = { createBouquetImportNotifications, startBouquetImportNotifications,
  _test: { completedAt, draftCount, eligible, notificationText, safeError } };
