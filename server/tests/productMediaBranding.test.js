const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FLOWWOW_BRANDED_PATHS,
  PRODUCT_MEDIA_BRANDING_CODE,
  PRODUCT_MEDIA_BRANDING_MESSAGE,
  assertPublishableProductMedia,
  findFlowwowBrandedMedia,
  lockProductMedia,
  normalizeProductMediaPath,
} = require('../services/productMediaBranding');

const BLOCKED = '/uploads/flowwow-owned/02d5fac82fc9f965355509244b9ad171459e1fc2dde0a040fe823b9f2da53cd3.jpg';

test('stoplist contains exactly the seven visually confirmed Flowwow photos', () => {
  assert.equal(FLOWWOW_BRANDED_PATHS.size, 7);
  for (const path of FLOWWOW_BRANDED_PATHS) {
    assert.equal(findFlowwowBrandedMedia({ image: path }), path);
  }
  assert.equal(findFlowwowBrandedMedia({ image: BLOCKED }), BLOCKED);
  assert.equal(findFlowwowBrandedMedia({ images: [{ url: `https://cdn.flowie.art//uploads/flowwow-owned/%30%32d5fac82fc9f965355509244b9ad171459e1fc2dde0a040fe823b9f2da53cd3.jpg?variant=webp#x` }] }), `https://cdn.flowie.art//uploads/flowwow-owned/%30%32d5fac82fc9f965355509244b9ad171459e1fc2dde0a040fe823b9f2da53cd3.jpg?variant=webp#x`);
  assert.equal(normalizeProductMediaPath(`${BLOCKED}?v=2`), BLOCKED);
  assert.equal(normalizeProductMediaPath(`${BLOCKED}@640.avif?v=3`), BLOCKED);
  assert.throws(() => assertPublishableProductMedia({isActive:true,image:`${BLOCKED}@1280.webp`}), /символика Flowwow/);
});

test('product media mutations share one transaction-scoped product lock', async () => {
  const calls = [];
  await lockProductMedia({ $executeRawUnsafe: async (...args) => calls.push(args) }, 127);
  assert.deepEqual(calls, [['SELECT pg_advisory_xact_lock(hashtext($1))', 'product-media:127']]);
  await assert.rejects(() => lockProductMedia({}, 127), /PRODUCT_MEDIA_LOCK_UNAVAILABLE/);
});

test('publishing rejects blocked cover or gallery with the stable 422 contract', () => {
  for (const input of [
    { isActive: true, image: BLOCKED, images: [] },
    { isActive: true, image: '/uploads/clean.jpg', images: [{ url: BLOCKED }] },
  ]) {
    assert.throws(() => assertPublishableProductMedia(input), (error) => {
      assert.equal(error.code, PRODUCT_MEDIA_BRANDING_CODE);
      assert.equal(error.status, 422);
      assert.equal(error.message, PRODUCT_MEDIA_BRANDING_MESSAGE);
      return true;
    });
  }
});

test('deactivation and inactive draft edits remain allowed, without generic brand guessing', () => {
  assert.doesNotThrow(() => assertPublishableProductMedia({ isActive: false, image: BLOCKED, images: [BLOCKED] }));
  for (const allowed of [
    '/uploads/flowwow-owned/95380de4000b3849469365e4c3b4d8b9af3b1f6e31f025390782bddcfd30090d.jpg',
    '/uploads/FreshFlowers.jpg',
    '/uploads/Just-for-you.jpg',
    '/uploads/own-shop-brand.jpg',
  ]) {
    assert.doesNotThrow(() => assertPublishableProductMedia({ isActive: true, image: allowed, images: [] }));
  }
});
