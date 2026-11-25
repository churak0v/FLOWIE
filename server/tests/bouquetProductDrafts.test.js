'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { materializeBouquetProductDrafts } = require('../services/bouquetProductDrafts');
const { variantPath } = require('../services/imageVariants');

function prismaDouble(state, recipes) {
  const products = [];
  const batch = { id: 'import-1', state };
  const prisma = {
    bouquetImportBatch: {
      async findUnique() { return batch; },
      async update({ data }) { batch.state = data.state; return batch; },
    },
    bouquetRecipe: {
      async findUnique({ where }) { return recipes.find((item) => item.id === where.id) || null; },
      async update({ where, data }) { const item = recipes.find((row) => row.id === where.id); Object.assign(item, data); return item; },
    },
    product: {
      async create({ data }) { const value = { id: products.length + 101, ...data }; products.push(value); return value; },
      async findUnique({ where }) {
        const item = products.find((product) => product.id === where.id);
        return item ? { ...item, images: item.images.create } : null;
      },
      async update({ where, data }) {
        const item = products.find((product) => product.id === where.id);
        item.images.create.push(...data.images.create);
        return item;
      },
    },
    async $executeRawUnsafe() { return 1; },
    async $transaction(callback) { return callback(prisma); },
    batch,
    products,
  };
  return prisma;
}

async function photo(color) {
  return sharp({ create: { width: 16, height: 12, channels: 3, background: color } }).png().toBuffer();
}

test('materializes one inactive zero-price product with all grouped angle derivatives and is idempotent', async (t) => {
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-products-'));
  t.after(() => fs.rm(uploadsDir, { recursive: true, force: true }));
  const state = {
    files: [
      { id: 'p1', status: 'STORED', storageKey: 'private/one' },
      { id: 'p2', status: 'STORED', storageKey: 'private/two' },
    ],
    drafts: [
      { customId: 'primary', draft_name: 'Розовый сад — черновик (предварительный вариант)', photoIds: ['p1', 'p2'], likely_flowers: ['Роза', 'Эустома'], recipeId: 'r1' },
      { customId: 'secondary', draft_name: 'Angle', photoIds: ['p2'], mergedInto: 'primary', recipeId: 'r2' },
    ],
  };
  const recipes = [{ id: 'r1', confirmedAt: null, productId: null, lines: [{ name: 'Роза', quantity: 99, unit: 'stem' }] }];
  const prisma = prismaDouble(state, recipes);
  const images = { 'private/one': await photo('#ff5577'), 'private/two': await photo('#ffeeee') };
  const reads = new Map();
  const storage = { get: async (key) => { reads.set(key, (reads.get(key) || 0) + 1); return { buffer: images[key] }; } };
  const first = await materializeBouquetProductDrafts({ prisma, storage, importId: 'import-1', uploadsDir });
  assert.equal(first.createdCount, 1);
  const product = prisma.products[0];
  assert.equal(product.isActive, false);
  assert.equal(product.price, 0);
  assert.equal(product.discount, 0);
  assert.equal(product.name, 'Розовый сад');
  assert.equal(product.tags, '');
  assert.match(product.image, /^\/uploads\/import-products\/import-1\/[a-f0-9]{64}\.webp$/);
  const firstOriginal = path.join(uploadsDir, product.image.replace('/uploads/', ''));
  for (const width of [320, 640, 1280]) {
    for (const extension of ['avif', 'webp']) await fs.access(variantPath(firstOriginal, width, extension));
  }
  assert.equal(product.images.create.length, 2);
  assert.equal(new Set(product.images.create.map((item) => item.url)).size, 2);
  assert.deepEqual(product.composition.create, []); // AI quantities never become confirmed composition.
  assert.equal(prisma.batch.state.drafts[0].productId, product.id);
  assert.equal(recipes[0].productId, product.id);
  assert.equal((await materializeBouquetProductDrafts({ prisma, storage, importId: 'import-1', uploadsDir })).createdCount, 0);
  assert.equal(prisma.products.length, 1);
  prisma.batch.state.files.push({ id: 'p3', status: 'STORED', storageKey: 'private/three' });
  prisma.batch.state.drafts[0].photoIds.push('p3');
  prisma.batch.state.drafts[0].draft_name = 'Do not overwrite admin name';
  images['private/three'] = await photo('#aa3355');
  const appended = await materializeBouquetProductDrafts({ prisma, storage, importId: 'import-1', uploadsDir });
  assert.equal(appended.createdCount, 0);
  assert.equal(appended.appendedImages, 1);
  assert.equal(prisma.products[0].name, 'Розовый сад');
  assert.equal(prisma.products[0].images.create.length, 3);
  assert.deepEqual([...reads.values()], [1, 1, 1]);
  assert.equal(Object.keys(prisma.batch.state.productImageUrls).length, 3);

  await fs.unlink(variantPath(firstOriginal, 640, 'avif'));
  await materializeBouquetProductDrafts({ prisma, storage, importId: 'import-1', uploadsDir });
  await fs.access(variantPath(firstOriginal, 640, 'avif'));
  assert.deepEqual([...reads.values()], [1, 1, 1]); // Cached originals are repaired without private-storage reads.
});

test('creates composition items only from a human-confirmed recipe', async (t) => {
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-products-'));
  t.after(() => fs.rm(uploadsDir, { recursive: true, force: true }));
  const state = {
    files: [{ id: 'p1', status: 'STORED', storageKey: 'private/one' }],
    drafts: [{ customId: 'one', draft_name: 'Белые хризантемы', sellingPriceRubles: 6500, photoIds: ['p1'], compositionProposal: [{ name: 'Лилия', quantity: 20, unit: 'шт.' }], recipeId: 'r1' }],
  };
  const recipes = [{ id: 'r1', confirmedAt: new Date(), productId: null, lines: [{ name: 'Хризантема', quantity: 5, unit: 'шт.' }] }];
  const prisma = prismaDouble(state, recipes);
  await materializeBouquetProductDrafts({ prisma, storage: { get: async () => ({ buffer: await photo('#ffffff') }) }, importId: 'import-1', uploadsDir });
  assert.deepEqual(prisma.products[0].composition.create, [{ name: 'Хризантема', quantity: '5 шт.', sort: 1 }]);
  assert.equal(prisma.products[0].price, 6500);
  assert.equal(prisma.products[0].isActive, false);
  assert.doesNotMatch(JSON.stringify(prisma.products[0]), /20/);
});

