'use strict';

const crypto = require('node:crypto');
const { DEFAULT_MODEL, prepareBouquetImportBatch } = require('./bouquetImportBatch');
const { isImportSettled } = require('./bouquetImportRepository');
const { getTelegramBouquetImportConfig } = require('./telegramBouquetImport');
const { applyVisualGroups, buildGroupingBody, groupingDigest, parseGroupingResponse } = require('./bouquetVisualGrouping');

const ACTIVE_STATUSES = ['PREPARING', 'SUBMITTING', 'POLLING', 'PROCESSING_SYNC'];
const PROVIDER_PENDING = new Set(['validating', 'in_progress', 'finalizing', 'cancelling']);
const PROVIDER_TERMINAL_FAILURE = new Set(['failed', 'expired', 'cancelled']);
// Normalizing a finalized import can legitimately take several minutes for a large
// set. Keep the crash lease comfortably above provider and image-operation bounds.
const DEFAULT_STALE_PHASE_MS = 30 * 60_000;
const SYNC_STALE_PHASE_MS = 2 * 60_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function safeError(error) {
  return String(error?.code || error?.message || error || 'unknown').slice(0, 300);
}

function aiMode(env) {
  return String(env.FLOWIE_IMPORT_AI_MODE || 'sync').trim().toLowerCase() === 'batch' ? 'batch' : 'sync';
}

function syncConcurrency(env) {
  const parsed = Number(env.FLOWIE_IMPORT_AI_CONCURRENCY || 2);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, 3) : 2;
}

function manifestOf(prepared) {
  return prepared.entries.map((entry) => ({
    originalSha256: entry.originalSha256,
    photoIds: [...entry.photoIds],
    customId: entry.request.custom_id,
  }));
}

function stableSyncCustomId(importId, originalSha256) {
  const safeImport = String(importId).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
  return `bouquet-${safeImport}-sha-${String(originalSha256).slice(0, 24)}`;
}

function photosFrom(row, { requireFinalized = true } = {}) {
  const files = Array.isArray(row.state?.files) ? row.state.files : [];
  const stored = files.filter((file) => file.status === 'STORED' && file.storageKey);
  if ((requireFinalized && (!row.state?.finalizeRequested || stored.length !== files.length)) || stored.length === 0) {
    throw Object.assign(new Error('BOUQUET_IMPORT_WORKER_NOT_FINALIZED'), { code: 'BOUQUET_IMPORT_WORKER_NOT_FINALIZED' });
  }
  return stored.map((file) => ({ id: file.id, storageKey: file.storageKey }));
}

function extractOutputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  for (const output of body?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string' && (!content.type || content.type === 'output_text')) return content.text;
    }
  }
  return null;
}

function validateDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.draft_name !== 'string' || typeof value.notes !== 'string') return null;
  if (!Array.isArray(value.palette) || !value.palette.every((item) => typeof item === 'string')) return null;
  if (!Array.isArray(value.likely_flowers) || !value.likely_flowers.every((item) => typeof item === 'string')) return null;
  return {
    draft_name: value.draft_name.replace(/\b(черновик|предположительно)\b/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, 240) || 'Букет',
    palette: value.palette.slice(0, 8).map((item) => item.slice(0, 80)),
    likely_flowers: value.likely_flowers.slice(0, 16).map((item) => item.slice(0, 120)),
    compositionProposal: Array.isArray(value.compositionProposal) ? value.compositionProposal.slice(0, 30)
      .filter((item) => item && typeof item.name === 'string' && (item.quantity == null || (typeof item.quantity === 'number' && item.quantity > 0)) && typeof item.unit === 'string')
      .map((item) => ({ name: item.name.slice(0, 120), quantity: item.quantity ?? null, unit: item.unit.slice(0, 40) })) : [],
    notes: value.notes.slice(0, 2000),
  };
}

function parseBatchOutput(text, manifest) {
  const expected = new Map(manifest.map((item) => [item.customId, item]));
  const drafts = [];
  const errors = [];
  const seen = new Set();
  for (const rawLine of String(text || '').split('\n')) {
    if (!rawLine.trim()) continue;
    let line;
    try { line = JSON.parse(rawLine); } catch { errors.push({ code: 'INVALID_JSONL_LINE' }); continue; }
    const item = expected.get(line.custom_id);
    if (!item || seen.has(line.custom_id)) { errors.push({ code: 'UNKNOWN_OR_DUPLICATE_CUSTOM_ID', customId: line.custom_id || null }); continue; }
    seen.add(line.custom_id);
    if (line.error || Number(line.response?.status_code || 0) >= 400) {
      errors.push({ code: 'PROVIDER_REQUEST_FAILED', customId: line.custom_id });
      continue;
    }
    const rawDraft = extractOutputText(line.response?.body);
    let parsed;
    try { parsed = validateDraft(JSON.parse(rawDraft)); } catch { parsed = null; }
    if (!parsed) { errors.push({ code: 'INVALID_DRAFT', customId: line.custom_id }); continue; }
    drafts.push({ customId: line.custom_id, photoIds: [...item.photoIds], ...parsed, needsComposition: true });
  }
  for (const item of manifest) if (!seen.has(item.customId)) errors.push({ code: 'MISSING_RESULT', customId: item.customId });
  return { drafts, errors, complete: errors.length === 0 && drafts.length === manifest.length };
}

function confirmedLinesFor(state, photoIds) {
  const sets = Array.isArray(state.confirmedCompositions) ? state.confirmedCompositions : [];
  const match = sets.find((entry) => entry?.source === 'HUMAN' && entry?.status === 'CONFIRMED'
    && Array.isArray(entry.photoIds) && entry.photoIds.some((id) => photoIds.includes(String(id))));
  if (!match || !Array.isArray(match.lines)) return [];
  const valid = match.lines.every((line) => line && typeof line.ingredientId === 'string' && typeof line.name === 'string'
    && typeof line.unit === 'string' && Number.isFinite(line.quantity) && line.quantity > 0);
  return valid ? clone(match.lines) : [];
}

function createBouquetImportWorker({ prisma, storage, provider, env = process.env, now = () => new Date(), stalePhaseMs = DEFAULT_STALE_PHASE_MS, telegramFetchImpl = globalThis.fetch }) {
  if (!prisma || !storage || !provider) throw new TypeError('BOUQUET_IMPORT_WORKER_CONFIG');
  let running = false;

  async function telegramBacklogEmpty() {
    const config = getTelegramBouquetImportConfig(env);
    if (!config.token) return true;
    try {
      const response = await telegramFetchImpl(`${config.apiBase}/bot${config.token}/getWebhookInfo`, { signal: AbortSignal.timeout(5000) });
      const payload = await response.json();
      return response.ok && payload.ok && payload.result?.pending_update_count === 0;
    } catch { return false; }
  }

  async function claim(canPromote) {
    return prisma.$transaction(async (tx) => {
      const locks = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', 'flowie-bouquet-import-worker');
      if (Array.isArray(locks) && locks[0] && locks[0].locked === false) return null;
      const active = await tx.bouquetImportBatch.findFirst({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { updatedAt: 'asc' } });
      if (active) {
        const age = now().getTime() - new Date(active.updatedAt || 0).getTime();
        const leaseMs = active.status === 'PROCESSING_SYNC' ? SYNC_STALE_PHASE_MS
          : active.status === 'PREPARING' ? stalePhaseMs
          : Math.min(stalePhaseMs, active.status === 'POLLING' ? 90000 : 120000);
        if (age < leaseMs) return null;
        const recovery = active.status === 'SUBMITTING' ? 'UNCERTAIN'
          : active.status === 'POLLING' ? 'WAITING_PROVIDER' : 'QUEUED';
        const state = clone(active.state);
        state.workerRecovery = { from: active.status, at: now().toISOString() };
        if (active.status === 'SUBMITTING') {
          state.aiBatch ||= {};
          state.aiBatch.submissionState = 'UNCERTAIN';
        }
        if (active.status === 'PROCESSING_SYNC') {
          state.syncResponses ||= {};
          for (const response of Object.values(state.syncResponses)) {
            if (response?.status === 'RUNNING') {
              response.status = 'UNCERTAIN';
              response.error = 'WORKER_INTERRUPTED';
              response.finishedAt = now().toISOString();
            }
          }
        }
        await tx.bouquetImportBatch.update({ where: { id: active.id }, data: { status: recovery, state } });
        return { recovered: active.id, status: recovery };
      }

      if (aiMode(env) === 'sync') {
        const candidates = await tx.bouquetImportBatch.findMany({
          where: { status: 'COLLECTING' }, orderBy: { updatedAt: 'asc' }, take: 50,
        });
        for (const candidate of candidates) {
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', candidate.id);
          const latest = await tx.bouquetImportBatch.findUnique({ where: { id: candidate.id } });
          if (!latest || latest.status !== 'COLLECTING') continue;
          const state = clone(latest.state);
          const known = new Set((state.syncKnownPhotoIds || []).map(String));
          const storedIds = (state.files || []).filter((file) => file.status === 'STORED' && file.storageKey).map((file) => String(file.id));
          const leaseAt = state.syncLease?.heartbeatAt || state.syncLease?.startedAt;
          const leaseAge = leaseAt ? now().getTime() - new Date(leaseAt).getTime() : Infinity;
          if (state.syncLease && leaseAge < SYNC_STALE_PHASE_MS) return null;
          const interrupted = state.syncLease && leaseAge >= SYNC_STALE_PHASE_MS;
          if (interrupted) {
            state.syncResponses ||= {};
            for (const response of Object.values(state.syncResponses)) {
              if (response?.status === 'RUNNING') {
                response.status = 'UNCERTAIN'; response.error = 'WORKER_INTERRUPTED'; response.finishedAt = now().toISOString();
              }
            }
          }
          const hasNew = storedIds.some((id) => !known.has(id));
          if (interrupted && !hasNew) {
            delete state.syncLease;
            await tx.bouquetImportBatch.update({ where: { id: latest.id }, data: { state } });
            return { recovered: latest.id, status: 'COLLECTING' };
          }
          if (!hasNew) continue;
          state.syncLease = { token: crypto.randomUUID(), startedAt: now().toISOString(), heartbeatAt: now().toISOString() };
          await tx.bouquetImportBatch.update({ where: { id: latest.id }, data: { state } });
          return { ...latest, state, continuous: true, status: 'PROCESSING_SYNC' };
        }
      }

      if (canPromote) {
        const collecting = await tx.bouquetImportBatch.findFirst({ where: {
          status: 'COLLECTING', updatedAt: { lte: new Date(now().getTime() - 15000) },
          state: { path: ['finalizeRequested'], equals: true },
        }, orderBy: { updatedAt: 'asc' } });
        if (collecting && isImportSettled(collecting.state, now().getTime())) {
          await tx.bouquetImportBatch.updateMany({ where: { id: collecting.id, status: 'COLLECTING' }, data: { status: 'QUEUED' } });
        }
      }
      let row = await tx.bouquetImportBatch.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
      let nextStatus = aiMode(env) === 'sync' ? 'PROCESSING_SYNC' : 'PREPARING';
      if (!row && aiMode(env) === 'batch' && env.BOUQUET_IMPORT_AI_BATCH_ENABLED === 'true') {
        row = await tx.bouquetImportBatch.findFirst({ where: { status: 'PREPARED' }, orderBy: { createdAt: 'asc' } });
      }
      if (!row) {
        row = await tx.bouquetImportBatch.findFirst({ where: { status: 'WAITING_PROVIDER' }, orderBy: { updatedAt: 'asc' } });
        nextStatus = 'POLLING';
      }
      if (!row) return null;
      const claimedFrom = row.status;
      const snapshot = { ...row, state: clone(row.state) };
      const updated = await tx.bouquetImportBatch.updateMany({ where: { id: row.id, status: claimedFrom }, data: { status: nextStatus } });
      return updated.count === 1 ? { ...snapshot, claimedFrom, status: nextStatus } : null;
    });
  }

  async function persist(id, status, state) {
    return prisma.bouquetImportBatch.update({ where: { id }, data: { status, state } });
  }

  async function mutateState(id, callback) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', id);
      const latest = await tx.bouquetImportBatch.findUnique({ where: { id } });
      if (!latest) throw new Error('BOUQUET_IMPORT_NOT_FOUND');
      const state = clone(latest.state);
      const result = await callback(state, latest, tx);
      await tx.bouquetImportBatch.update({ where: { id }, data: { state, status: latest.status } });
      return { state, result };
    });
  }

  async function prepare(row, forSubmission) {
    const prepared = await prepareBouquetImportBatch({
      importId: row.id,
      state: 'FINALIZED',
      photos: photosFrom(row),
      storage,
      model: String(env.FLOWIE_IMPORT_BATCH_MODEL || DEFAULT_MODEL).trim(),
    });
    const state = clone(row.state);
    state.aiBatch = {
      ...(state.aiBatch || {}),
      model: prepared.model,
      jsonlSha256: prepared.sha256,
      requestCount: prepared.requestCount,
      manifest: manifestOf(prepared),
      preparedAt: state.aiBatch?.preparedAt || now().toISOString(),
    };
    if (!forSubmission) {
      await persist(row.id, 'PREPARED', state);
      return { status: 'PREPARED', id: row.id };
    }
    if (row.state?.aiBatch?.jsonlSha256 !== prepared.sha256) {
      state.aiBatch.submissionState = 'BLOCKED_DIGEST_MISMATCH';
      await persist(row.id, 'BLOCKED', state);
      return { status: 'BLOCKED', id: row.id };
    }
    state.aiBatch.submissionState = 'SUBMITTING';
    state.aiBatch.submissionStartedAt = now().toISOString();
    await persist(row.id, 'SUBMITTING', state);
    try {
      const result = await provider.submit({ jsonl: prepared.jsonl, idempotencyKey: prepared.sha256, importId: row.id });
      state.aiBatch = { ...state.aiBatch, ...result, submissionState: 'SUBMITTED', submittedAt: now().toISOString() };
      await persist(row.id, 'WAITING_PROVIDER', state);
      return { status: 'WAITING_PROVIDER', id: row.id };
    } catch (error) {
      state.aiBatch.submissionState = 'UNCERTAIN';
      state.aiBatch.submissionError = safeError(error);
      await persist(row.id, 'UNCERTAIN', state);
      return { status: 'UNCERTAIN', id: row.id };
    }
  }

  async function persistParsed(row, parsed, details = {}) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', row.id);
      const latest = await tx.bouquetImportBatch.findUnique({ where: { id: row.id } });
      if (!latest) throw new Error('BOUQUET_IMPORT_NOT_FOUND');
      const state = clone(latest.state);
      state.drafts = Array.isArray(state.drafts) ? state.drafts : [];
      const existing = new Map(state.drafts.map((draft) => [draft.customId, draft]));
      const newDrafts = [];
      for (const draft of parsed.drafts) {
        const attachedFile = (state.files || []).find((file) => draft.photoIds.includes(String(file.id)) && file.attachToCustomId);
        const attachedTarget = attachedFile ? existing.get(attachedFile.attachToCustomId) : null;
        if (attachedTarget) {
          attachedTarget.photoIds = [...new Set([...(attachedTarget.photoIds || []), ...draft.photoIds])];
          attachedTarget.angleSuggestions = [...(attachedTarget.angleSuggestions || []), {
            customId: draft.customId, compositionProposal: draft.compositionProposal || [], notes: draft.notes,
          }];
          draft.mergedInto = attachedTarget.customId;
          state.drafts.push(draft); existing.set(draft.customId, draft);
          continue;
        }
        const prior = existing.get(draft.customId);
        if (prior) {
          prior.photoIds = [...new Set([...(prior.photoIds || []), ...draft.photoIds])];
        } else {
          state.drafts.push(draft); existing.set(draft.customId, draft); newDrafts.push(draft);
        }
      }
      if (details.mode === 'sync') {
        state.syncCompletedAt = now().toISOString();
        state.syncErrors = [...(state.syncErrors || []), ...parsed.errors];
        if (details.continuous) {
          state.syncKnownPhotoIds = [...new Set([
            ...(state.syncKnownPhotoIds || []).map(String),
            ...(details.manifest || []).flatMap((item) => item.photoIds.map(String)),
          ])];
          delete state.syncLease;
        }
      } else {
        state.aiBatch ||= {};
        state.aiBatch.outputFileId = details.outputFileId;
        state.aiBatch.outputErrors = parsed.errors;
        state.aiBatch.completedAt = now().toISOString();
      }
      for (const draft of newDrafts) {
        const lines = confirmedLinesFor(state, draft.photoIds);
        draft.needsComposition = lines.length === 0;
        const recipe = await tx.bouquetRecipe.create({ data: {
          importId: row.id,
          name: draft.draft_name || 'Bouquet draft',
          lines,
          costs: {},
          confirmedAt: null,
        } });
        draft.recipeId = recipe.id;
      }
      const status = details.continuous ? latest.status : (parsed.complete ? 'REVIEW_REQUIRED' : 'PARTIAL_REVIEW_REQUIRED');
      await tx.bouquetImportBatch.update({ where: { id: row.id }, data: { status, state } });
      return { status, id: row.id, drafts: newDrafts.length };
    });
  }

  async function finish(row, providerBatch) {
    const state = clone(row.state);
    state.aiBatch ||= {};
    state.aiBatch.providerStatus = providerBatch.status;
    state.aiBatch.providerRequestCounts = providerBatch.request_counts || null;
    state.aiBatch.lastPolledAt = now().toISOString();
    if (PROVIDER_PENDING.has(providerBatch.status)) {
      await persist(row.id, 'WAITING_PROVIDER', state);
      return { status: 'WAITING_PROVIDER', id: row.id };
    }
    if (PROVIDER_TERMINAL_FAILURE.has(providerBatch.status)) {
      state.aiBatch.terminalReason = providerBatch.status;
      await persist(row.id, `PROVIDER_${providerBatch.status.toUpperCase()}`, state);
      return { status: `PROVIDER_${providerBatch.status.toUpperCase()}`, id: row.id };
    }
    if (providerBatch.status !== 'completed' || !providerBatch.output_file_id) {
      state.aiBatch.terminalReason = 'INVALID_PROVIDER_STATE';
      await persist(row.id, 'PROVIDER_FAILED', state);
      return { status: 'PROVIDER_FAILED', id: row.id };
    }

    const parsed = parseBatchOutput(await provider.downloadOutput(providerBatch.output_file_id), state.aiBatch.manifest || []);
    return persistParsed(row, parsed, { mode: 'batch', outputFileId: providerBatch.output_file_id });
  }

  async function groupImport(importId, preferredCustomIds = [], preparedEntries = []) {
    const row = await prisma.bouquetImportBatch.findUnique({ where: { id: importId } });
    if (!row) throw new Error('BOUQUET_IMPORT_NOT_FOUND');
    const drafts = (row.state?.drafts || []).filter((draft) => !draft.mergedInto && Array.isArray(draft.photoIds) && draft.photoIds.length);
    const preferred = new Set(preferredCustomIds);
    const selected = [...drafts.filter((draft) => preferred.has(draft.customId)), ...drafts.filter((draft) => !preferred.has(draft.customId)).slice(-20)]
      .filter((draft, index, all) => all.findIndex((item) => item.customId === draft.customId) === index).slice(0, 20);
    if (selected.length < 2) return { status: 'SKIPPED', groups: 0 };
    const digest = groupingDigest(selected.flatMap((draft) => draft.photoIds));
    const claimed = await mutateState(importId, (state) => {
      state.groupingAttempts ||= {};
      if (state.groupingAttempts[digest]) return false;
      state.groupingAttempts[digest] = { status: 'RUNNING', customIds: selected.map((draft) => draft.customId), startedAt: now().toISOString() };
      return true;
    });
    if (!claimed.result) return { status: 'SKIPPED', groups: 0 };
    try {
      const normalizedByCustom = new Map(preparedEntries.map((entry) => [entry.request.custom_id, entry.normalized]));
      const candidates = [];
      for (const draft of selected) {
        let normalized = normalizedByCustom.get(draft.customId);
        if (!normalized) {
          const representative = (row.state.files || []).find((file) => draft.photoIds.includes(String(file.id)) && file.storageKey);
          if (!representative) continue;
          const prepared = await prepareBouquetImportBatch({ importId, state: 'FINALIZED', storage,
            photos: [{ id: representative.id, storageKey: representative.storageKey }], model: String(env.FLOWIE_IMPORT_BATCH_MODEL || DEFAULT_MODEL).trim() });
          normalized = prepared.entries[0].normalized;
        }
        candidates.push({ customId: draft.customId, imageDataUrl: `data:image/jpeg;base64,${normalized.toString('base64')}` });
      }
      if (candidates.length < 2) throw Object.assign(new Error('GROUPING_IMAGES_UNAVAILABLE'), { status: 422 });
      const response = await provider.respond({
        body: buildGroupingBody(candidates, String(env.FLOWIE_IMPORT_BATCH_MODEL || DEFAULT_MODEL).trim()),
        idempotencyKey: `bouquet-group:${importId}:${digest}`,
      });
      const groups = parseGroupingResponse(response, candidates.map((item) => item.customId));
      const applied = await mutateState(importId, async (state, _latest, tx) => {
        const recipes = await tx.bouquetRecipe.findMany({ where: { importId } });
        const merged = applyVisualGroups(state, groups, { recipes });
        state.groupingAttempts[digest] = { ...state.groupingAttempts[digest], status: 'DONE', groups, merged, usage: response?.usage || null, finishedAt: now().toISOString() };
        return merged;
      });
      return { status: 'DONE', groups: applied.result.length };
    } catch (error) {
      const explicitHttp = Number.isInteger(error?.status) && error.status >= 400;
      await mutateState(importId, (state) => {
        state.groupingAttempts[digest] = { ...state.groupingAttempts[digest], status: explicitHttp ? 'DONE' : 'UNCERTAIN', groups: [], error: safeError(error), finishedAt: now().toISOString() };
      });
      return { status: explicitHttp ? 'DONE' : 'UNCERTAIN', groups: 0 };
    }
  }

  async function processSync(row) {
    const knownPhotoIds = new Set((row.state?.syncKnownPhotoIds || []).map(String));
    const availablePhotos = photosFrom(row, { requireFinalized: !row.continuous });
    const photos = row.continuous
      ? availablePhotos.filter((photo) => !knownPhotoIds.has(String(photo.id)))
      : availablePhotos;
    if (!photos.length && row.continuous) {
      await mutateState(row.id, (state) => { delete state.syncLease; });
      return { status: 'COLLECTING', id: row.id, drafts: 0 };
    }
    const prepared = await prepareBouquetImportBatch({
      importId: row.id,
      state: 'FINALIZED',
      photos,
      storage,
      model: String(env.FLOWIE_IMPORT_BATCH_MODEL || DEFAULT_MODEL).trim(),
    });
    if (row.continuous) {
      const responseManifest = Object.entries(row.state?.syncResponses || {}).map(([customId, value]) => ({
        customId, originalSha256: value?.originalSha256,
      }));
      const prior = [...(row.state?.syncManifest || []), ...(row.state?.aiBatch?.manifest || []), ...responseManifest];
      const priorByHash = new Map(prior.filter((item) => item?.originalSha256 && item?.customId)
        .map((item) => [item.originalSha256, item.customId]));
      for (const entry of prepared.entries) {
        entry.request.custom_id = priorByHash.get(entry.originalSha256)
          || stableSyncCustomId(row.id, entry.originalSha256);
      }
    }
    const manifest = manifestOf(prepared);
    await mutateState(row.id, (state) => {
      state.syncModel = prepared.model;
      if (row.continuous) {
        const combined = new Map((state.syncManifest || []).map((item) => [item.customId, item]));
        for (const item of manifest) {
          const prior = combined.get(item.customId);
          if (prior) prior.photoIds = [...new Set([...(prior.photoIds || []), ...item.photoIds])];
          else combined.set(item.customId, clone(item));
        }
        state.syncManifest = [...combined.values()];
      } else state.syncManifest = manifest;
      state.syncStartedAt ||= now().toISOString();
      state.syncResponses ||= {};
      if (row.continuous && state.syncLease) state.syncLease.heartbeatAt = now().toISOString();
      for (const response of Object.values(state.syncResponses)) {
        if (response?.status === 'RUNNING') {
          response.status = 'UNCERTAIN';
          response.error = 'WORKER_INTERRUPTED';
          response.finishedAt = now().toISOString();
        }
      }
    });

    let cursor = 0;
    async function consume() {
      while (cursor < prepared.entries.length) {
        const entry = prepared.entries[cursor++];
        const customId = entry.request.custom_id;
        const claimResult = await mutateState(row.id, (state) => {
          state.syncResponses ||= {};
          if (state.syncResponses[customId]) return false;
          state.syncResponses[customId] = {
            status: 'RUNNING',
            photoIds: [...entry.photoIds],
            originalSha256: entry.originalSha256,
            startedAt: now().toISOString(),
          };
          if (row.continuous && state.syncLease) state.syncLease.heartbeatAt = now().toISOString();
          return true;
        });
        if (!claimResult.result) continue;
        try {
          const response = await provider.respond({
            body: entry.request.body,
            idempotencyKey: `${prepared.sha256}:${customId}`,
          });
          await mutateState(row.id, (state) => {
            state.syncResponses[customId] = {
              ...state.syncResponses[customId],
              status: 'DONE',
              response,
              usage: response?.usage || null,
              finishedAt: now().toISOString(),
            };
            if (row.continuous && state.syncLease) state.syncLease.heartbeatAt = now().toISOString();
          });
        } catch (error) {
          const explicitHttp = Number.isInteger(error?.status) && error.status >= 400;
          await mutateState(row.id, (state) => {
            state.syncResponses[customId] = {
              ...state.syncResponses[customId],
              status: explicitHttp ? 'FAILED' : 'UNCERTAIN',
              error: safeError(error),
              ...(explicitHttp ? { httpStatus: error.status } : {}),
              finishedAt: now().toISOString(),
            };
            if (row.continuous && state.syncLease) state.syncLease.heartbeatAt = now().toISOString();
          });
        }
      }
    }
    await Promise.all(Array.from({ length: syncConcurrency(env) }, () => consume()));

    const latest = await prisma.bouquetImportBatch.findUnique({ where: { id: row.id } });
    const responses = latest?.state?.syncResponses || {};
    const lines = [];
    for (const item of manifest) {
      const result = responses[item.customId];
      if (result?.status === 'DONE') {
        lines.push(JSON.stringify({ custom_id: item.customId, response: { status_code: 200, body: result.response } }));
      } else if (result?.status === 'FAILED') {
        lines.push(JSON.stringify({ custom_id: item.customId, error: { code: 'sync_request_failed' } }));
      }
    }
    const saved = await persistParsed(row, parseBatchOutput(lines.join('\n'), manifest), { mode: 'sync', continuous: row.continuous, manifest });
    await groupImport(row.id, manifest.map((item) => item.customId), prepared.entries);
    if (env.FLOWIE_IMPORT_MATERIALIZE_PRODUCTS === 'true') {
      try {
        await require('./bouquetProductDrafts').materializeBouquetProductDrafts({ prisma, storage, importId: row.id });
      } catch (error) {
        await mutateState(row.id, (state) => { state.productDraftError = safeError(error); });
      }
    }
    return saved;
  }

  async function runOnce() {
    if (running) return { status: 'BUSY' };
    running = true;
    try {
      const row = await claim(await telegramBacklogEmpty());
      if (!row) return { status: 'IDLE' };
      if (row.recovered) return { status: row.status, recovered: row.recovered };
      if (row.status === 'POLLING') {
        try { return await finish(row, await provider.retrieve(row.state.aiBatch.providerBatchId)); }
        catch (error) {
          const state = clone(row.state); state.aiBatch ||= {}; state.aiBatch.pollError = safeError(error);
          await persist(row.id, 'WAITING_PROVIDER', state);
          return { status: 'WAITING_PROVIDER', id: row.id };
        }
      }
      if (row.status === 'PROCESSING_SYNC') {
        try {
          return await processSync(row);
        } catch (error) {
          if (row.continuous) {
            await mutateState(row.id, (state) => {
              delete state.syncLease;
              state.syncLastError = safeError(error);
              state.syncLastErrorAt = now().toISOString();
            });
            return { status: 'COLLECTING', id: row.id, error: 'SYNC_PREPARE_FAILED' };
          }
          const latest = await prisma.bouquetImportBatch.findUnique({ where: { id: row.id } });
          const state = clone(latest?.state || row.state);
          state.syncPrepareError = safeError(error);
          state.syncPrepareFailedAt = now().toISOString();
          await persist(row.id, 'PREPARE_FAILED', state);
          return { status: 'PREPARE_FAILED', id: row.id };
        }
      }
      try {
        return await prepare(row, row.claimedFrom === 'PREPARED');
      } catch (error) {
        const state = clone(row.state);
        state.aiBatch ||= {};
        state.aiBatch.prepareError = safeError(error);
        state.aiBatch.prepareFailedAt = now().toISOString();
        await persist(row.id, 'PREPARE_FAILED', state);
        return { status: 'PREPARE_FAILED', id: row.id };
      }
    } finally {
      running = false;
    }
  }

  return { runOnce, groupImport };
}

function startBouquetImportWorker(options = {}) {
  const worker = createBouquetImportWorker(options);
  const intervalMs = Number.isSafeInteger(options.intervalMs) && options.intervalMs >= 1_000
    ? options.intervalMs : 15_000;
  const logger = options.logger || console;
  let stopped = false;
  let ticking = false;
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await worker.runOnce();
    } catch (error) {
      logger.error?.('Bouquet import worker tick failed:', safeError(error));
    } finally {
      ticking = false;
    }
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  if (options.runImmediately !== false) queueMicrotask(tick);
  return {
    runOnce: worker.runOnce,
    stop() { stopped = true; clearInterval(timer); },
  };
}

async function groupBouquetImport(options, importId) {
  return createBouquetImportWorker(options).groupImport(importId);
}

module.exports = {
  createBouquetImportWorker,
  groupBouquetImport,
  startBouquetImportWorker,
  parseBatchOutput,
  confirmedLinesFor,
  DEFAULT_STALE_PHASE_MS,
};
