export const MOTHERS_DAY_CATALOG_HREF = '/catalog?occasion=mothers-day';
export const MOTHERS_DAY_DELIVERY_DATE = '2026-11-29';
export const MOTHERS_DAY_COLLECTION_SLUG = 'день-матери';
export const MOTHERS_DAY_VALUE_PRODUCT_IDS = [75, 70];
export const MOTHERS_DAY_FALLBACK_PRODUCT_IDS = [55, 3, 2, 20, 35, 34, 33, 36, 32, 37, 57, 54, 41, 29, 7];
export const MOTHERS_DAY_PRODUCT_LIMIT = 10;

function localDayNumber(now) {
  return (now.getFullYear() * 10_000) + ((now.getMonth() + 1) * 100) + now.getDate();
}

export function isMothersDayCampaignActive(now = new Date()) {
  const localDay = localDayNumber(now);
  return localDay >= 20261125 && localDay <= 20261129;
}

export function hasMothersDayCampaignEnded(now = new Date()) {
  return localDayNumber(now) > 20261129;
}

export function getMothersDayDeliveryDateSuggestion(currentDate) {
  return currentDate || MOTHERS_DAY_DELIVERY_DATE;
}

function productUsesImage(product, image) {
  const normalized = String(image || '').trim();
  if (!normalized) return false;
  return [product?.image, ...(Array.isArray(product?.images) ? product.images : [])]
    .some((candidate) => String(candidate || '').trim() === normalized);
}

export function selectMothersDayProducts(products, collections, heroImage = '', limit = MOTHERS_DAY_PRODUCT_LIMIT) {
  const byId = new Map((products || [])
    .filter((product) => product?.isActive !== false && !product?.isUpsell)
    .map((product) => [String(product.id), product]));
  const collection = (collections || []).find((item) => String(item?.slug || '').toLowerCase() === MOTHERS_DAY_COLLECTION_SLUG);
  const configuredIds = [
    ...MOTHERS_DAY_VALUE_PRODUCT_IDS,
    ...(collection?.productIds || []),
    ...MOTHERS_DAY_FALLBACK_PRODUCT_IDS,
  ];
  const selected = [];
  const seen = new Set();

  for (const id of configuredIds) {
    const key = String(id);
    const product = byId.get(key);
    if (!product || seen.has(key) || productUsesImage(product, heroImage)) continue;
    seen.add(key);
    selected.push(product);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function getMothersDayPriceTiers(products) {
  const tiers = [
    { id: 'under-5000', label: 'до 5 000 ₽', min: 0, max: 5_000 },
    { id: '5001-6999', label: '5 001–6 999 ₽', min: 5_001, max: 6_999 },
    { id: 'from-7000', label: 'от 7 000 ₽', min: 7_000, max: Infinity },
  ];

  return tiers.map((tier) => ({
    ...tier,
    count: (products || []).filter((product) => Number(product?.price) >= tier.min && Number(product?.price) <= tier.max).length,
  })).filter((tier) => tier.count > 0);
}

const PROMO_IMAGE_TERMS = [
  ['авторск', 4],
  ['эустом', 4],
  ['роз', 3],
  ['гортенз', 2],
  ['нежн', 2],
  ['букет', 1],
];

export function pickMothersDayPromoProduct(products, excludedImage = '') {
  let best = null;
  let bestScore = -1;

  for (const product of products || []) {
    const image = String(product?.image || '').trim();
    if (!image || image === excludedImage || product?.isActive === false || product?.isUpsell) continue;
    const name = String(product?.name || product?.title || '').toLowerCase();
    const score = PROMO_IMAGE_TERMS.reduce((total, [term, weight]) => total + (name.includes(term) ? weight : 0), 0);
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  return best;
}
