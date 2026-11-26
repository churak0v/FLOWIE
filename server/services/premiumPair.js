'use strict';

const GIFTS = Object.freeze({
  'offer:red-duet': 'отдельный минибукет из 3 красных роз, светлая упаковка и бордовая лента',
  'offer:angel-duet': 'отдельный минибукет из 5 белых диантусов, светлая упаковка и лента в тон',
});

function premiumPairGifts(items) {
  return (items || []).flatMap(item => {
    const tags = String(item.product?.tags || '').split(',').map(tag => tag.trim());
    const tag = tags.find(value => Object.hasOwn(GIFTS, value));
    const quantity = Number(item.quantity);
    return tag && Number.isSafeInteger(quantity) && quantity > 0 ? [{ text: GIFTS[tag], quantity }] : [];
  });
}

function assertStablePremiumPairTags(currentTags, nextTags) {
  if (nextTags === undefined) return;
  const known = tags => String(tags || '').split(',').map(tag => tag.trim()).filter(tag => Object.hasOwn(GIFTS, tag)).sort().join(',');
  if (known(currentTags) !== known(nextTags)) {
    const error = new Error('Состав подарка привязан к комплекту. Создайте новый комплект для другого подарка; существующий можно скрыть.');
    error.code = 'PREMIUM_PAIR_TAG_IMMUTABLE';
    throw error;
  }
}

module.exports = { premiumPairGifts, assertStablePremiumPairTags };
