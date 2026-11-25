'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { composeImportNotes, createBouquetBatchSubmitter, prepareBouquetImportBatch } = require('../services/bouquetImportBatch');

test('prepares one low-detail request per unique original only after finalization', async () => {
  const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ee7799' } }).png().toBuffer();
  const storage = { get: async () => ({ buffer: original }) };
  await assert.rejects(() => prepareBouquetImportBatch({ importId: 'i1', state: 'DRAFT', photos: [{ id: 1, storageKey: 'a' }], storage }), /NOT_FINALIZED/);
  const prepared = await prepareBouquetImportBatch({
    importId: 'i1', state: 'FINALIZED', storage,
    photos: [{ id: 'p1', storageKey: 'a' }, { id: 'p2', storageKey: 'b' }],
  });
  assert.equal(prepared.model, 'gpt-6-luna');
  assert.equal(prepared.requestCount, 1);
  assert.deepEqual(prepared.entries[0].photoIds, ['p1', 'p2']);
  const request = JSON.parse(prepared.jsonl.toString().trim());
  assert.equal(request.body.input[0].content[1].detail, 'low');
  assert.deepEqual(JSON.parse(request.body.input[0].content[0].text).photo_ids, ['p1', 'p2']);
  assert.match(request.body.input[0].content[0].text, /do not assert exact quantities/);
});

test('composition notes preserve confirmed text byte-for-byte', () => {
  const confirmed = 'Confirmed: roses — 7\nKeep this line.';
  const notes = composeImportNotes(confirmed, { draft_name: 'Pink draft' });
  assert.equal(notes.slice(0, confirmed.length), confirmed);
  assert.match(notes, /AI draft \(unconfirmed\)/);
});

test('submission is opt-in, finalized, persisted before provider call, and uncertain submissions do not retry', async () => {
  const events = [];
  const provider = { submit: async () => { events.push('provider'); return { providerFileId: 'file-1', providerBatchId: 'batch-1' }; } };
  const persist = async (_id, patch) => events.push(patch.submissionState);
  const disabled = createBouquetBatchSubmitter({ env: {}, provider, persist });
  await assert.rejects(() => disabled.submit({ id: 'i1', state: 'FINALIZED', jsonl: '{}' }), /DISABLED/);
  const enabled = createBouquetBatchSubmitter({ env: { BOUQUET_IMPORT_AI_BATCH_ENABLED: 'true' }, provider, persist });
  const result = await enabled.submit({ id: 'i1', state: 'FINALIZED', jsonl: '{}\n' });
  assert.equal(result.providerBatchId, 'batch-1');
  assert.deepEqual(events, ['SUBMITTING', 'provider', 'SUBMITTED']);
  await assert.rejects(() => enabled.submit({ id: 'i1', state: 'FINALIZED', jsonl: '{}\n', submissionState: 'UNCERTAIN' }), /RECONCILIATION_REQUIRED/);
});
