export const MOTHERS_DAY_CATALOG_HREF = '/catalog?occasion=mothers-day';
export const MOTHERS_DAY_DELIVERY_DATE = '2026-11-29';

export function isMothersDayCampaignActive(now = new Date()) {
  const localDay = (now.getFullYear() * 10_000) + ((now.getMonth() + 1) * 100) + now.getDate();
  return localDay >= 20261125 && localDay <= 20261129;
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
