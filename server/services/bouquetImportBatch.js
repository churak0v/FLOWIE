'use strict';

const crypto = require('node:crypto');
const sharp = require('sharp');

const DEFAULT_MODEL = 'gpt-6-luna';
const MAX_BATCH_REQUESTS = 50_000;
const MAX_BATCH_FILE_BYTES = 200 * 1024 * 1024;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireFinalized(state) {
  if (state !== 'FINALIZED') {
    throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_NOT_FINALIZED'), { code: 'BOUQUET_IMPORT_BATCH_NOT_FINALIZED' });
  }
}

async function normalizedVisionImage(buffer) {
  return sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' })
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 72, progressive: true })
    .toBuffer();
}

function responseSchema() {
  return {
    type: 'json_schema',
    name: 'bouquet_photo_draft',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['draft_name', 'palette', 'likely_flowers', 'notes'],
      properties: {
        draft_name: { type: 'string' },
        palette: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        likely_flowers: { type: 'array', items: { type: 'string' }, maxItems: 16 },
        notes: { type: 'string' },
      },
    },
  };
}

async function prepareBouquetImportBatch({ importId, state, photos, storage, model = DEFAULT_MODEL }) {
  requireFinalized(state);
  if (!Array.isArray(photos) || photos.length === 0 || !storage || typeof storage.get !== 'function') {
    throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_INVALID_INPUT'), { code: 'BOUQUET_IMPORT_BATCH_INVALID_INPUT' });
  }

  const byHash = new Map();
  for (const photo of photos) {
    const stored = await storage.get(photo.storageKey);
    const originalHash = sha256(stored.buffer);
    const existing = byHash.get(originalHash);
    if (existing) {
      existing.photoIds.push(String(photo.id));
      continue;
    }
    byHash.set(originalHash, {
      originalSha256: originalHash,
      photoIds: [String(photo.id)],
      normalized: await normalizedVisionImage(stored.buffer),
    });
  }
  if (byHash.size > MAX_BATCH_REQUESTS) {
    throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_TOO_MANY_REQUESTS'), { code: 'BOUQUET_IMPORT_BATCH_TOO_MANY_REQUESTS' });
  }

  const entries = [];
  let index = 0;
  for (const item of byHash.values()) {
    index += 1;
    const request = {
      custom_id: `bouquet-${String(importId).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48)}-${index}`,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model,
        reasoning: { effort: 'none' },
        max_output_tokens: 500,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                photo_ids: item.photoIds,
                task: 'Respond in Russian. Create a cautious catalog draft from the photo. Name likely flowers but do not assert exact quantities. Treat every identification as unconfirmed.',
              }),
            },
            { type: 'input_image', detail: 'low', image_url: `data:image/jpeg;base64,${item.normalized.toString('base64')}` },
          ],
        }],
        text: { format: responseSchema() },
      },
    };
    entries.push({ ...item, request });
  }

  const jsonl = Buffer.from(entries.map(({ request }) => JSON.stringify(request)).join('\n') + '\n');
  if (jsonl.length > MAX_BATCH_FILE_BYTES) {
    throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_FILE_TOO_LARGE'), { code: 'BOUQUET_IMPORT_BATCH_FILE_TOO_LARGE' });
  }
  return Object.freeze({ model, jsonl, sha256: sha256(jsonl), requestCount: entries.length, entries });
}

function composeImportNotes(confirmedComposition, draft) {
  const confirmed = String(confirmedComposition || '');
  const ai = draft && typeof draft === 'object'
    ? `AI draft (unconfirmed): ${JSON.stringify(draft)}`
    : 'AI draft (unconfirmed): unavailable';
  return confirmed ? `${confirmed}\n\n${ai}` : ai;
}

function createOpenAIBatchProvider({ apiKey, fetchImpl = globalThis.fetch, baseUrl = 'https://api.openai.com', timeoutMs = 30_000 }) {
  if (!apiKey || typeof fetchImpl !== 'function') throw new TypeError('BOUQUET_IMPORT_BATCH_PROVIDER_CONFIG');
  async function request(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  async function json(response, operation) {
    if (!response.ok) throw Object.assign(new Error(`BOUQUET_IMPORT_BATCH_${operation}_FAILED`), { code: `BOUQUET_IMPORT_BATCH_${operation}_FAILED`, status: response.status });
    return response.json();
  }
  return {
    async submit({ jsonl, idempotencyKey, importId }) {
      const form = new FormData();
      form.set('purpose', 'batch');
      form.set('file', new Blob([jsonl], { type: 'application/jsonl' }), `bouquet-${importId}.jsonl`);
      const file = await json(await request(`${baseUrl}/v1/files`, {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'idempotency-key': `${idempotencyKey}-file` }, body: form,
      }), 'FILE_UPLOAD');
      if (!file.id) throw new Error('BOUQUET_IMPORT_BATCH_FILE_ID_MISSING');
      const batch = await json(await request(`${baseUrl}/v1/batches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `${idempotencyKey}-batch` },
        body: JSON.stringify({ input_file_id: file.id, endpoint: '/v1/responses', completion_window: '24h', metadata: { import_id: String(importId) } }),
      }), 'SUBMIT');
      if (!batch.id) throw new Error('BOUQUET_IMPORT_BATCH_ID_MISSING');
      return { providerFileId: file.id, providerBatchId: batch.id };
    },
    async retrieve(providerBatchId) {
      return json(await request(`${baseUrl}/v1/batches/${encodeURIComponent(providerBatchId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      }), 'RETRIEVE');
    },
    async downloadOutput(fileId) {
      const response = await request(`${baseUrl}/v1/files/${encodeURIComponent(fileId)}/content`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_OUTPUT_FAILED'), { code: 'BOUQUET_IMPORT_BATCH_OUTPUT_FAILED', status: response.status });
      return response.text();
    },
  };
}

function createBouquetBatchSubmitter({ env = process.env, provider, persist }) {
  if (!provider || typeof provider.submit !== 'function' || typeof persist !== 'function') throw new TypeError('BOUQUET_IMPORT_BATCH_SUBMITTER_CONFIG');
  return {
    async submit(record) {
      if (env.BOUQUET_IMPORT_AI_BATCH_ENABLED !== 'true') {
        throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_DISABLED'), { code: 'BOUQUET_IMPORT_BATCH_DISABLED' });
      }
      requireFinalized(record.state);
      if (record.providerBatchId) return { providerBatchId: record.providerBatchId, existing: true };
      if (record.submissionState === 'SUBMITTING' || record.submissionState === 'UNCERTAIN') {
        throw Object.assign(new Error('BOUQUET_IMPORT_BATCH_RECONCILIATION_REQUIRED'), { code: 'BOUQUET_IMPORT_BATCH_RECONCILIATION_REQUIRED' });
      }
      const jsonl = Buffer.isBuffer(record.jsonl) ? record.jsonl : Buffer.from(record.jsonl || '');
      const digest = sha256(jsonl);
      await persist(record.id, { submissionState: 'SUBMITTING', submissionDigest: digest });
      try {
        const submitted = await provider.submit({ jsonl, idempotencyKey: digest, importId: record.id });
        await persist(record.id, { submissionState: 'SUBMITTED', ...submitted });
        return submitted;
      } catch (error) {
        await persist(record.id, { submissionState: 'UNCERTAIN', submissionDigest: digest });
        throw error;
      }
    },
  };
}

module.exports = {
  DEFAULT_MODEL,
  composeImportNotes,
  createBouquetBatchSubmitter,
  createOpenAIBatchProvider,
  prepareBouquetImportBatch,
};
