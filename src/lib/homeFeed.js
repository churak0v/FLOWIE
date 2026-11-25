function activeCatalogProducts(products) {
  return (products || []).filter((product) => product && product.isActive !== false && !product.isUpsell
    && String(product.image || product.images?.[0] || '').trim());
}

function searchableText(product) {
  return [product?.title, product?.name, product?.subtitle, product?.description,
    ...(Array.isArray(product?.composition) ? product.composition.map((item) => typeof item === 'object' ? item?.name : item) : [])]
    .map((value) => String(value || '').toLocaleLowerCase('ru-RU')).join(' ');
}

const HOME_PRICE_FLOORS = {
  'from-3000': 3_000,
  'from-5000': 5_000,
  'from-7000': 7_000,
};

export function meetsHomePriceFloor(product, filterId) {
  const price = Number(product?.price);
  const minimum = HOME_PRICE_FLOORS[filterId];
  return Number.isFinite(price) && Number.isFinite(minimum) && price >= minimum;
}

export function buildHomeFeed(products) {
  const source = activeCatalogProducts(products);
  const used = new Set();
  const take = (predicate, limit, candidates = source) => {
    const selected = [];
    for (const product of candidates) {
      const key = String(product.id);
      if (used.has(key) || !predicate(product)) continue;
      used.add(key); selected.push(product);
      if (selected.length === limit) break;
    }
    return selected;
  };
  const any = () => true;
  const opening = take(any, 9);
  const photoBanner = take(any, 1)[0] || null;
  const roses = take((product) => /(^|[^а-яё])роз[а-яё]*/iu.test(searchableText(product)), 9);
  const premium = take((product) => Number(product.price) >= 7_000, 9);
  const byPrice = [...source].sort((left, right) => Number(left.price) - Number(right.price));
  const budgetPool = [
    ...take((product) => meetsHomePriceFloor(product, 'from-7000'), 9, byPrice),
    ...take((product) => meetsHomePriceFloor(product, 'from-5000'), 5, byPrice),
    ...take((product) => meetsHomePriceFloor(product, 'from-3000'), 6, byPrice),
  ];
  const priceBanner = take(any, 1)[0] || null;
  const more = take(any, 9);
  return { opening, photoBanner, budgetPool, priceBanner, roses, premium, more };
}

export function filterHomeBudgetProducts(products, filterId) {
  return (products || [])
    .filter((product) => meetsHomePriceFloor(product, filterId))
    .sort((left, right) => Number(left.price) - Number(right.price));
}

export function splitHomeSectionProducts(products) {
  const source = Array.isArray(products) ? products : [];
  const visibleProducts = source.slice(0, 5);
  const reservedProducts = source.slice(5, 9);
  return {
    visibleProducts,
    collageProducts: reservedProducts.length ? reservedProducts : visibleProducts.slice(0, 4),
  };
}
