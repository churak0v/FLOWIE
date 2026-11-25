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
  const takeSection = (predicate, candidates = source) => {
    const visible = take(predicate, 5, candidates);
    const visibleIds = new Set(visible.map((product) => String(product.id)));
    const preview = [];
    const previewIds = new Set();
    const appendPreview = (allowPreviouslyUsed) => {
      for (const product of candidates) {
        const key = String(product.id);
        if (visibleIds.has(key) || previewIds.has(key) || !predicate(product)) continue;
        if (!allowPreviouslyUsed && used.has(key)) continue;
        preview.push(product); previewIds.add(key);
        if (preview.length === 4) break;
      }
    };
    appendPreview(false);
    if (preview.length < 4) appendPreview(true);
    return [...visible, ...preview];
  };
  const any = () => true;
  const opening = takeSection(any);
  const photoBanner = take(any, 1)[0] || null;
  const roses = takeSection((product) => /(^|[^а-яё])роз[а-яё]*/iu.test(searchableText(product)));
  const premium = takeSection((product) => Number(product.price) >= 7_000);
  const byPrice = [...source].sort((left, right) => Number(left.price) - Number(right.price));
  const budgetPool = [
    ...takeSection((product) => meetsHomePriceFloor(product, 'from-7000'), byPrice),
    ...takeSection((product) => meetsHomePriceFloor(product, 'from-5000'), byPrice),
    ...takeSection((product) => meetsHomePriceFloor(product, 'from-3000'), byPrice),
  ];
  const priceBanner = take(any, 1)[0] || null;
  const more = takeSection(any);
  return { opening, photoBanner, budgetPool, priceBanner, roses, premium, more };
}

export function filterHomeBudgetProducts(products, filterId) {
  const seen = new Set();
  return (products || [])
    .filter((product) => meetsHomePriceFloor(product, filterId))
    .filter((product) => {
      const key = String(product.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
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
