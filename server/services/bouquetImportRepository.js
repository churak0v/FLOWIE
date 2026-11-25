const crypto = require('crypto');
const DEFAULT_STALE_PENDING_MS = 10 * 60_000;

function iso(value) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function isImportSettled(state, at = Date.now(), settleMs = 15000) {
  if (!state?.finalizeRequested || !state.files?.length || state.files.some((f) => f.status !== 'STORED')) return false;
  const timestamps = [state.finalizeRequestedAt, ...state.files.map((f) => f.storedAt || f.createdAt)]
    .filter(Boolean).map((v) => new Date(v).getTime());
  return timestamps.every(Number.isFinite) && Number(at) - Math.max(0, ...timestamps) >= settleMs;
}

function createBouquetImportRepository(prisma, options = {}) {
  const now = options.now || (() => new Date());
  const stalePendingMs = options.stalePendingMs ?? DEFAULT_STALE_PENDING_MS;
  // Serialize each batch's JSON mutations across all webhook processes.
  const mutate = (id, callback) => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const row = await tx.bouquetImportBatch.findUnique({ where: { id } });
    if (!row) throw new Error('IMPORT_NOT_FOUND');
    const state = row.state;
    const result = await callback(state, row);
    await tx.bouquetImportBatch.update({ where: { id }, data: { state, status: row.status } });
    return result;
  });
  return {
    async claimUpdate({ updateId }) {
      try {
        await prisma.bouquetImportUpdate.create({ data: { updateId: String(updateId) } });
        return true;
      } catch (error) { if (error.code === 'P2002') return false; throw error; }
    },
    async releaseUpdate(updateId) {
      await prisma.bouquetImportUpdate.deleteMany({ where: { updateId: String(updateId) } });
    },
    findActiveImport: ({ chatId, userId }) => prisma.bouquetImportBatch.findFirst({
      where: { chatId: String(chatId), userId: String(userId), status: 'COLLECTING' }, orderBy: { createdAt: 'desc' },
    }),
    createImport: ({ chatId, userId, startedAt = now() }) => prisma.$transaction(async (tx) => {
      const lock = `bouquet-import:${chatId}:${userId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
      const existing = await tx.bouquetImportBatch.findFirst({ where: { chatId: String(chatId), userId: String(userId), status: 'COLLECTING' } });
      return existing || tx.bouquetImportBatch.create({ data: {
        chatId: String(chatId), userId: String(userId),
        state: { files: [], notes: [], finalizeRequested: false, startedAt: iso(startedAt) },
      } });
    }),
    reserveFile: (file) => mutate(file.importId, (state) => {
      if (state.files.some((item) => item.fileUniqueId === file.fileUniqueId
        || String(item.messageId) === String(file.messageId))) return null;
      // Telegram may retry older photos after delivering the finish callback.
      const sentAt = file.sentAt ? new Date(file.sentAt).getTime() : Infinity;
      const finishedAt = state.finalizeRequestedAt ? new Date(state.finalizeRequestedAt).getTime() : -Infinity;
      if (state.finalizeRequested && !(sentAt <= finishedAt)) throw new Error('IMPORT_ALREADY_FINALIZED');
      if (state.files.length >= 2000) throw new Error('IMPORT_FILE_LIMIT');
      const pendingAt = iso(file.createdAt || now());
      const record = { ...file, createdAt: pendingAt, pendingAt, id: crypto.randomUUID(), status: 'PENDING' };
      state.files.push(record);
      state.intakeRevision = (state.intakeRevision || 0) + 1;
      state.intakeLastActivityAt = pendingAt;
      state.confirmationPrompt = null;
      return record;
    }),
    markFileStored: async ({ fileId, storageKey, storedAt }) => {
      const rows = await prisma.bouquetImportBatch.findMany({ where: { status: 'COLLECTING', state: { path: ['files'], array_contains: [{ id: fileId }] } }, select: { id: true } });
      if (rows.length !== 1) throw new Error('IMPORT_FILE_NOT_FOUND');
      return mutate(rows[0].id, (state) => {
        const file = state.files.find((item) => item.id === fileId);
        file.status = 'STORED'; file.storageKey = storageKey; file.storedAt = iso(storedAt);
        delete file.pendingAt;
        delete file.error;
        delete file.failedAt;
      });
    },
    markFileFailed: async ({ fileId, error, failedAt }) => {
      const rows = await prisma.bouquetImportBatch.findMany({ where: { status: 'COLLECTING', state: { path: ['files'], array_contains: [{ id: fileId }] } }, select: { id: true } });
      if (rows.length !== 1) throw new Error('IMPORT_FILE_NOT_FOUND');
      return mutate(rows[0].id, (state) => {
        const file = state.files.find((item) => item.id === fileId);
        file.status = 'FAILED'; file.error = String(error).slice(0, 1000); file.failedAt = iso(failedAt);
        delete file.pendingAt;
      });
    },
    async findAttachmentTargets({ importId, messageId, mediaGroupId }) {
      const row = await prisma.bouquetImportBatch.findUnique({ where: { id: importId } });
      const files = row?.state.files || [];
      if (mediaGroupId != null) {
        return files.some((file) => String(file.mediaGroupId) === String(mediaGroupId))
          ? [{ id: `media-group:${mediaGroupId}` }]
          : [];
      }
      const targets = files.filter((file) => messageId != null && String(file.messageId) === String(messageId));
      return targets.map((file) => ({ id: file.id }));
    },
    addNote: (note) => mutate(note.importId, (state) => {
      if (state.notes.some((item) => item.sourceMessageId === note.sourceMessageId)) return;
      if (state.notes.length >= 2000) throw new Error('IMPORT_NOTE_LIMIT');
      state.notes.push({ ...note, createdAt: iso(note.createdAt) });
    }),
    deferConfirmation: (importId) => mutate(importId, (state) => {
      if (state.finalizeRequested) throw new Error('IMPORT_ALREADY_FINALIZED');
      state.intakeRevision = (state.intakeRevision || 0) + 1;
      state.intakeLastActivityAt = iso(now());
      state.confirmationPrompt = null;
    }),
    requestFinalize: ({ importId, requestedAt = now(), requirePrompt = false }) => mutate(importId, (state) => {
      if (requirePrompt && (!state.files.length || state.confirmationPrompt?.status !== 'SENT'
        || state.confirmationPrompt.revision !== (state.intakeRevision || 0))) throw new Error('IMPORT_CONFIRMATION_STALE');
      state.finalizeRequested = true;
      state.finalizeRequestedAt ||= iso(requestedAt);
    }),
    async getFinalizeState(importId) {
      const row = await prisma.bouquetImportBatch.findUnique({ where: { id: importId } });
      if (!row) throw new Error('IMPORT_NOT_FOUND');
      return { finalizeRequested: row.state.finalizeRequested,
        schedulerRequired: true,
        settled: isImportSettled(row.state, now().getTime()),
        unresolvedFiles: row.state.files.filter((file) => file.status !== 'STORED').length };
    },
    claimAnalysis: (id) => mutate(id, (state, row) => {
      if (row.status !== 'COLLECTING' || !isImportSettled(state, now().getTime())) return false;
      row.status = 'QUEUED';
      return true;
    }),
    claimFailedFiles: (id) => mutate(id, (state) => {
      const staleBefore = now().getTime() - stalePendingMs;
      const files = state.files.filter((file) => file.status === 'FAILED'
        || (file.status === 'PENDING' && new Date(file.pendingAt || file.createdAt || 0).getTime() <= staleBefore));
      const pendingAt = iso(now());
      files.forEach((file) => {
        file.status = 'PENDING'; file.pendingAt = pendingAt;
        delete file.error; delete file.failedAt;
      });
      return files;
    }),
  };
}

module.exports = { createBouquetImportRepository, DEFAULT_STALE_PENDING_MS, isImportSettled };
