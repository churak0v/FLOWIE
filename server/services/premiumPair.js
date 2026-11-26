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

module.exports = { premiumPairGifts };
