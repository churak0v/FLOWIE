const PRODUCT_MEDIA_BRANDING_CODE = 'PRODUCT_MEDIA_BRANDING';
const PRODUCT_MEDIA_BRANDING_MESSAGE = 'На фото есть символика Flowwow. Замените фотографии перед публикацией.';

// Confirmed by the 2026-11-26 visual audit. This is an exact stoplist, not a
// detector for new Flowwow marks or other third-party branding.
const FLOWWOW_BRANDED_PATHS = new Set([
  '/uploads/flowwow-owned/02d5fac82fc9f965355509244b9ad171459e1fc2dde0a040fe823b9f2da53cd3.jpg',
  '/uploads/flowwow-owned/9f12c05cbffbbb9fde0ccec3f93d6bab441f16759d9ba5eacc505a0947892a31.jpg',
  '/uploads/flowwow-owned/1b43bba51abffa230509026e8b24b9c6b4c7a1828dac75d64b2d6edafc2343d4.jpg',
  '/uploads/flowwow-owned/6e819c8b4954bb7da4a1a412d1e44c628bf4b3ab9ef05748c4edbb789705d6a1.jpg',
  '/uploads/flowwow-owned/21c578094639563d30c066c6338707cdad55e84d0ea3c1bd3843b18e63cf3b86.jpg',
  '/uploads/flowwow-owned/d1852fd41b23a793764a10735f6d3d8940b8876cbd575b2b976c6cfdef9f99e6.jpg',
  '/uploads/flowwow-owned/865914a6daaf83781731caa2a63f5dc8a8c8984b018ac7550ad1d025fb888bde.jpg',
]);

class ProductMediaBrandingError extends Error {
  constructor() {
    super(PRODUCT_MEDIA_BRANDING_MESSAGE);
    this.code = PRODUCT_MEDIA_BRANDING_CODE;
    this.status = 422;
  }
}

function normalizeProductMediaPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const pathname = new URL(raw.replace(/\\/g, '/'), 'https://flowie.invalid').pathname;
    let decoded = pathname;
    try { decoded = decodeURIComponent(pathname); } catch { /* Keep a malformed path unmatched. */ }
    return `/${decoded}`.replace(/\/{2,}/g, '/').replace(/\/$/, '').replace(/@\d+\.(?:avif|webp)$/i, '').toLowerCase();
  } catch {
    return '';
  }
}

function findFlowwowBrandedMedia({ image, images } = {}) {
  const candidates = [image, ...(Array.isArray(images) ? images.map((item) => item?.url ?? item) : [])];
  return candidates.find((value) => FLOWWOW_BRANDED_PATHS.has(normalizeProductMediaPath(value))) || null;
}

function assertPublishableProductMedia({ isActive, image, images } = {}) {
  if (!isActive) return;
  if (findFlowwowBrandedMedia({ image, images })) throw new ProductMediaBrandingError();
}

async function lockProductMedia(tx, productId) {
  if (!tx?.$executeRawUnsafe || !Number.isSafeInteger(Number(productId)) || Number(productId) <= 0) {
    throw new Error('PRODUCT_MEDIA_LOCK_UNAVAILABLE');
  }
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `product-media:${Number(productId)}`);
}

module.exports = {
  FLOWWOW_BRANDED_PATHS,
  PRODUCT_MEDIA_BRANDING_CODE,
  PRODUCT_MEDIA_BRANDING_MESSAGE,
  ProductMediaBrandingError,
  assertPublishableProductMedia,
  findFlowwowBrandedMedia,
  lockProductMedia,
  normalizeProductMediaPath,
};
