import { getProductFlowers } from './catalogFilters.js';

const NON_COMPOSITION = /упаков|лент|открытк|корзин|ваза|декор|бумаг|пл[её]нк|дополн/;

function productKey(product) {
  return String(product?.id ?? '');
}

function compositionName(entry) {
  const raw = typeof entry === 'object' && entry ? entry.name : entry;
  return String(raw || '')
    .split('·')[0]
    .replace(/\b\d+\s*(?:шт\.?|вет(?:ок|ки)?|стебл(?:ей|я)?)?\b/gi, '')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function compositionKeys(product) {
  const keys = new Set(getProductFlowers(product).map((flower) => `flower:${flower.key}`));
  for (const entry of Array.isArray(product?.composition) ? product.composition : []) {
    const name = compositionName(entry);
    if (name.length >= 2 && name.length <= 64 && !NON_COMPOSITION.test(name)) keys.add(`name:${name}`);
  }
  return keys;
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function usableProduct(product, currentId) {
  return product && product.isActive !== false
    && productKey(product) && productKey(product) !== currentId
    && String(product.image || product.images?.[0] || '').trim();
}

export function selectProductRecommendations({ products, currentProduct, similarLimit = 4, sameFlowersLimit = 6 }) {
  if (!currentProduct || !productKey(currentProduct)) return { similar: [], sameFlowers: [] };
  const currentId = productKey(currentProduct);
  const baseComposition = compositionKeys(currentProduct);
  const baseFlowers = new Set(getProductFlowers(currentProduct).map((flower) => flower.key));
  const basePrice = Number(currentProduct.price);
  const seenCandidates = new Set();
  const candidates = (products || [])
    .map((product, index) => {
      if (!usableProduct(product, currentId)) return null;
      const key = productKey(product);
      if (seenCandidates.has(key)) return null;
      seenCandidates.add(key);
      const flowers = new Set(getProductFlowers(product).map((flower) => flower.key));
      const sharedFlowers = intersectionSize(baseFlowers, flowers);
      const sharedComposition = intersectionSize(baseComposition, compositionKeys(product));
      const price = Number(product.price);
      const priceDistance = Number.isFinite(basePrice) && Number.isFinite(price)
        ? Math.abs(price - basePrice) / Math.max(1, basePrice)
        : Number.POSITIVE_INFINITY;
      return { product, index, sharedFlowers, sharedComposition, priceDistance };
    })
    .filter(Boolean);

  const similar = candidates
    .filter((candidate) => candidate.sharedComposition > 0)
    .sort((left, right) => right.sharedComposition - left.sharedComposition
      || right.sharedFlowers - left.sharedFlowers
      || left.priceDistance - right.priceDistance
      || left.index - right.index)
    .slice(0, Math.max(0, similarLimit))
    .map((candidate) => candidate.product);

  const used = new Set(similar.map(productKey));
  const sameFlowers = candidates
    .filter((candidate) => candidate.sharedFlowers > 0 && !used.has(productKey(candidate.product)))
    .sort((left, right) => right.sharedFlowers - left.sharedFlowers
      || left.priceDistance - right.priceDistance
      || left.index - right.index)
    .slice(0, Math.max(0, sameFlowersLimit))
    .map((candidate) => candidate.product);

  return { similar, sameFlowers };
}

