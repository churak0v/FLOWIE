export const PREMIUM_PAIRS = Object.freeze([
  { code: 'red-duet', tag: 'offer:red-duet', title: 'Красный дуэт', image: '/banners/premium-pair-red-v1.png', gift: 'Минибукет из 3 красных роз', detail: 'Красные розы, светлая упаковка и бордовая лента — маленький подарок в палитре большой корзины.' },
  { code: 'angel-duet', tag: 'offer:angel-duet', title: 'Angel — большой и маленький', image: '/banners/premium-pair-angel-v1.png', gift: 'Минибукет из 5 белых диантусов', detail: 'Белые цветы, светлая упаковка и лента в тон — нежный маленький подарок к композиции Angel.' },
]);

export function premiumPairForProduct(product) {
  const tags = String(product?.tags || '').split(',').map(tag => tag.trim());
  return PREMIUM_PAIRS.find(offer => tags.includes(offer.tag)) || null;
}

export function premiumPairProducts(products = []) {
  return PREMIUM_PAIRS.flatMap(offer => {
    const product = products.find(item => item?.isActive !== false && !item?.isUpsell && Number(item?.price) > 0 && premiumPairForProduct(item)?.code === offer.code);
    return product ? [{ ...offer, product }] : [];
  });
}

export function requestedPremiumPair(search = '') {
  const code = new URLSearchParams(search).get('offer');
  return code === 'premium-pair' || PREMIUM_PAIRS.some(offer => offer.code === code) ? code : null;
}

export function orderPremiumPairs(pairs, requested) {
  return [...pairs].sort((left, right) => Number(right.code === requested) - Number(left.code === requested));
}
