'use strict';

const telegramImport = require('./telegramBouquetImport');
const { bouquetKeyboard } = require('./telegramBouquetKeyboard');

const MAX_CANDIDATES = 25;
const DEFAULT_IDLE_MS = 60_000;
const DEFAULT_LEASE_MS = 2 * 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function timestamp(value) { const n = new Date(value || 0).getTime(); return Number.isFinite(n) ? n : 0; }
function revisionOf(state) { return Math.max(0, Number(state?.intakeRevision) || 0); }
function filesOf(state) { return Array.isArray(state?.files) ? state.files : []; }
function lastActivityMs(row) {
  const state = row?.state || {};
  return Math.max(
    timestamp(state.intakeLastActivityAt), timestamp(state.startedAt), timestamp(row?.createdAt),
    ...filesOf(state).flatMap((file) => [timestamp(file.createdAt), timestamp(file.storedAt), timestamp(file.failedAt)]),
  );
}
function intakeReady(row, now, idleMs) {
  if (!row || row.status !== 'COLLECTING' || row.state?.finalizeRequested) return false;
  const files = filesOf(row.state);
  if (!files.length || files.some((file) => file?.status !== 'STORED')) return false;
  if (now.getTime() - lastActivityMs(row) < idleMs) return false;
  return true;
}
function eligible(row, now, idleMs, leaseMs) {
  if (!intakeReady(row, now, idleMs)) return false;
  const prompt = row.state?.confirmationPrompt;
  const revision = revisionOf(row.state);
  if (Number(prompt?.revision) !== revision) return true;
  if (prompt?.status === 'SENT') return false;
  if (prompt?.status === 'SENDING' && timestamp(prompt.leaseAt) > now.getTime() - leaseMs) return false;
  if (prompt?.status === 'RETRY' && timestamp(prompt.nextAttemptAt) > now.getTime()) return false;
  return true;
}
function confirmationKeyboard() {
  return bouquetKeyboard('confirmation');
}

function createBouquetImportIdlePrompt({ prisma, env = process.env, fetchImpl = globalThis.fetch,
  now = () => new Date(), idleMs = DEFAULT_IDLE_MS, leaseMs = DEFAULT_LEASE_MS } = {}) {
  if (!prisma || typeof fetchImpl !== 'function') throw new TypeError('BOUQUET_IMPORT_IDLE_PROMPT_CONFIG');
  const config = telegramImport.getTelegramBouquetImportConfig(env);

  async function candidates() {
    const seconds = Math.max(1, Math.ceil(idleMs / 1000));
    const rows = await prisma.$queryRawUnsafe(`
      SELECT b."id" FROM "BouquetImportBatch" b
      CROSS JOIN LATERAL (
        SELECT max(NULLIF(file->>'storedAt', '')::timestamptz) AS "lastStoredAt"
        FROM jsonb_array_elements(COALESCE(b."state"->'files', '[]'::jsonb)) file
      ) activity
      WHERE b."status" = 'COLLECTING'
        AND COALESCE((b."state"->>'finalizeRequested')::boolean, false) = false
        AND jsonb_array_length(COALESCE(b."state"->'files', '[]'::jsonb)) > 0
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b."state"->'files') file WHERE file->>'status' <> 'STORED')
        AND GREATEST(
          COALESCE(NULLIF(b."state"->>'intakeLastActivityAt', '')::timestamptz, to_timestamp(0)),
          COALESCE(activity."lastStoredAt", to_timestamp(0)), b."createdAt"
        ) <= now() - make_interval(secs => ${seconds})
        AND (
          COALESCE((b."state" #>> '{confirmationPrompt,revision}')::integer, -1)
            <> COALESCE((b."state"->>'intakeRevision')::integer, 0)
          OR (
            COALESCE(b."state" #>> '{confirmationPrompt,status}', '') <> 'SENT'
            AND (COALESCE(b."state" #>> '{confirmationPrompt,status}', '') <> 'SENDING'
              OR COALESCE(NULLIF(b."state" #>> '{confirmationPrompt,leaseAt}', '')::timestamptz, to_timestamp(0))
                <= now() - interval '2 minutes')
            AND (COALESCE(b."state" #>> '{confirmationPrompt,status}', '') <> 'RETRY'
              OR COALESCE(NULLIF(b."state" #>> '{confirmationPrompt,nextAttemptAt}', '')::timestamptz, to_timestamp(0)) <= now())
          )
        )
      ORDER BY b."createdAt" ASC LIMIT ${MAX_CANDIDATES}
    `);
    return Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];
  }

  async function claim(id) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', String(id));
      const row = await tx.bouquetImportBatch.findUnique({ where: { id } });
      const claimedAt = now();
      if (!eligible(row, claimedAt, idleMs, leaseMs)) return null;
      const state = clone(row.state);
      const revision = revisionOf(state);
      const old = Number(state.confirmationPrompt?.revision) === revision ? state.confirmationPrompt : {};
      state.confirmationPrompt = { status: 'SENDING', revision, count: filesOf(state).length,
        attempts: Math.max(0, Number(old.attempts) || 0) + 1, leaseAt: claimedAt.toISOString() };
      await tx.bouquetImportBatch.update({ where: { id }, data: { state } });
      return { ...row, state, revision, count: filesOf(state).length };
    });
  }

  async function mergePrompt(id, revision, build) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', String(id));
      const latest = await tx.bouquetImportBatch.findUnique({ where: { id } });
      if (!latest || revisionOf(latest.state) !== revision) return null;
      const state = clone(latest.state);
      state.confirmationPrompt = build(state.confirmationPrompt || {});
      return tx.bouquetImportBatch.update({ where: { id }, data: { state } });
    });
  }

  async function telegram(method, payload) {
    const response = await fetchImpl(`${config.apiBase}/bot${config.token}/${method}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw Object.assign(new Error('TELEGRAM_IDLE_PROMPT_FAILED'), { code: 'TELEGRAM_IDLE_PROMPT_FAILED' });
    return body.result || {};
  }

  async function runOnce() {
    if (!config.token) return { status: 'DISABLED' };
    for (const id of await candidates()) {
      const row = await claim(id);
      if (!row) continue;
      try {
        const webhook = await telegram('getWebhookInfo', {});
        if (Number(webhook.pending_update_count) !== 0) {
          const retryAt = new Date(now().getTime() + 15_000);
          await mergePrompt(id, row.revision, (latest) => ({ status: 'RETRY', revision: row.revision,
            count: row.count, attempts: Math.max(row.state.confirmationPrompt.attempts, Number(latest.attempts) || 0),
            nextAttemptAt: retryAt.toISOString(), reason: 'WEBHOOK_BACKLOG' }));
          return { status: 'BACKLOG', id };
        }
        const latest = await prisma.bouquetImportBatch.findUnique({ where: { id } });
        if (!intakeReady(latest, now(), idleMs) || revisionOf(latest.state) !== row.revision) {
          return { status: 'STALE', id };
        }
        await telegram('sendMessage', { chat_id: row.chatId,
          text: `Получено фотографий: ${row.count}. Все фото загружены?`, reply_markup: confirmationKeyboard() });
        const sentAt = now().toISOString();
        await mergePrompt(id, row.revision, (latestPrompt) => ({ status: 'SENT', revision: row.revision,
          count: row.count, attempts: Math.max(row.state.confirmationPrompt.attempts, Number(latestPrompt.attempts) || 0), sentAt }));
        return { status: 'SENT', id };
      } catch (error) {
        const failedAt = now(); const attempts = row.state.confirmationPrompt.attempts;
        const backoffMs = Math.min(MAX_BACKOFF_MS, 15_000 * (2 ** Math.min(attempts - 1, 8)));
        await mergePrompt(id, row.revision, (latest) => ({ status: 'RETRY', revision: row.revision,
          count: row.count, attempts: Math.max(attempts, Number(latest.attempts) || 0), failedAt: failedAt.toISOString(),
          nextAttemptAt: new Date(failedAt.getTime() + backoffMs).toISOString(), error: String(error?.code || 'SEND_FAILED').slice(0, 80) }));
        return { status: 'RETRY', id, backoffMs };
      }
    }
    return { status: 'IDLE' };
  }
  return { runOnce };
}

function startBouquetImportIdlePrompt(options = {}) {
  const intervalMs = options.intervalMs ?? 15_000;
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new TypeError('BOUQUET_IMPORT_IDLE_PROMPT_INTERVAL');
  const service = createBouquetImportIdlePrompt(options); const logger = options.logger || console;
  let stopped = false; let running = false;
  const tick = async () => { if (stopped || running) return; running = true;
    try { await service.runOnce(); } catch (error) { logger.error?.('[bouquet-import-idle-prompt] tick failed',
      { name: String(error?.name || 'Error').slice(0, 80), code: String(error?.code || 'UNKNOWN').slice(0, 80) }); }
    finally { running = false; } };
  const timer = setInterval(tick, intervalMs); timer.unref?.(); void tick();
  return { runOnce: service.runOnce, stop() { stopped = true; clearInterval(timer); } };
}

module.exports = { createBouquetImportIdlePrompt, startBouquetImportIdlePrompt,
  _test: { eligible, intakeReady, lastActivityMs, confirmationKeyboard } };
