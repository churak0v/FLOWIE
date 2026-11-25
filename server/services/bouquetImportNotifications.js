'use strict';

const { getTelegramBouquetImportConfig } = require('./telegramBouquetImport');

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

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function dateMs(value) { const n = new Date(value || 0).getTime(); return Number.isFinite(n) ? n : 0; }
function safeError(error, token) {
  const raw = String(error?.message || error || 'notification failed');
  return (token ? raw.replaceAll(token, '[REDACTED]') : raw).slice(0, 300);
}
function eligible(row, now, leaseMs) {
  if (!row || !TERMINAL_STATUSES.includes(row.status)) return false;
  const note = row.state?.reviewNotification;
  if (note?.status === 'SENT') return false;
  if (note?.status === 'SENDING' && dateMs(note.leaseAt) > now.getTime() - leaseMs) return false;
  if (note?.status === 'RETRY' && dateMs(note.nextAttemptAt) > now.getTime()) return false;
  return true;
}
function notificationText(row) {
  if (READY_STATUSES.has(row.status)) {
    const count = Array.isArray(row.state?.drafts) ? row.state.drafts.length : 0;
    const lead = row.status === 'PARTIAL_REVIEW_REQUIRED' ? 'Разбор загрузки завершён частично.' : 'Разбор загрузки завершён.';
    return `${lead} Готово черновиков: ${count}. Отправьте /review, чтобы проверить фотографии и составы.`;
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
      WHERE "status" IN ('REVIEW_REQUIRED','PARTIAL_REVIEW_REQUIRED','PREPARE_FAILED','PROVIDER_FAILED','PROVIDER_EXPIRED','PROVIDER_CANCELLED','UNCERTAIN')
        AND COALESCE("state" #>> '{reviewNotification,status}', '') <> 'SENT'
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
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `bouquet-notification:${id}`);
      const row = await tx.bouquetImportBatch.findUnique({ where: { id } });
      const claimedAt = now();
      if (!eligible(row, claimedAt, leaseMs)) return null;
      const state = clone(row.state);
      const previous = state.reviewNotification || {};
      state.reviewNotification = { status: 'SENDING', attempts: Math.max(0, Number(previous.attempts) || 0) + 1,
        leaseAt: claimedAt.toISOString() };
      await tx.bouquetImportBatch.update({ where: { id }, data: { state } });
      return { ...row, state, notificationText: notificationText({ ...row, state }) };
    });
  }

  async function mergeNotification(id, build) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `bouquet-notification:${id}`);
      const latest = await tx.bouquetImportBatch.findUnique({ where: { id } });
      if (!latest) return null;
      const state = clone(latest.state);
      state.reviewNotification = build(state.reviewNotification || {});
      return tx.bouquetImportBatch.update({ where: { id }, data: { state } });
    });
  }

  async function send(row) {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: row.chatId, text: row.notificationText }), signal: AbortSignal.timeout(15000),
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
          attempts: Math.max(row.state.reviewNotification.attempts, Number(latest.attempts) || 0), sentAt }));
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
  _test: { eligible, notificationText, safeError } };
