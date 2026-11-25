'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { backfillImages, collectOriginalImages } = require('../scripts/backfillImageVariants');

async function touch(filename) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, 'image');
}

test('recursively selects only owned originals and never follows symlinks', async (t) => {
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-backfill-'));
  t.after(() => fs.rm(uploadsDir, { recursive: true, force: true }));
  const rootOriginal = path.join(uploadsDir, '123e4567-e89b-12d3-a456-426614174000.jpg');
  const flowwowOriginal = path.join(uploadsDir, 'flowwow-owned', 'shop', 'bouquet.png');
  const telegramOriginal = path.join(uploadsDir, 'import-products', 'batch', 'nested', 'hash.webp');
  await Promise.all([
    touch(rootOriginal),
    touch(flowwowOriginal),
    touch(telegramOriginal),
    touch(path.join(uploadsDir, 'not-an-upload.jpg')),
    touch(path.join(uploadsDir, 'private', 'secret.jpg')),
    touch(path.join(uploadsDir, 'import-products', 'batch', 'hash.webp@640.webp')),
    touch(path.join(uploadsDir, 'flowwow-owned', 'shop', 'cover.jpg.tmp-worker')),
    touch(path.join(uploadsDir, 'flowwow-owned', 'shop', 'variant@320.avif')),
  ]);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-private-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await touch(path.join(outside, 'outside.jpg'));
  await fs.symlink(outside, path.join(uploadsDir, 'import-products', 'linked-private'));

  assert.deepEqual(await collectOriginalImages(uploadsDir), [flowwowOriginal, telegramOriginal, rootOriginal].sort());
});

test('backfill caps concurrency at two and reports failures without widening scope', async (t) => {
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-backfill-'));
  t.after(() => fs.rm(uploadsDir, { recursive: true, force: true }));
  for (let index = 0; index < 4; index += 1) {
    await touch(path.join(uploadsDir, 'import-products', 'batch', `photo-${index}.webp`));
  }
  let active = 0;
  let peak = 0;
  const summary = await backfillImages({
    uploadsDir,
    concurrency: 99,
    async generate(filename) {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (filename.endsWith('photo-2.webp')) throw new Error('broken');
      return { created: 6 };
    },
  });
  assert.equal(peak, 2);
  assert.deepEqual({ originals: summary.originals, complete: summary.complete, failed: summary.failed, variants: summary.variants }, {
    originals: 4,
    complete: 3,
    failed: 1,
    variants: 18,
  });
});

