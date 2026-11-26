import test from 'node:test';
import assert from 'node:assert/strict';
import { premiumPairProducts, requestedPremiumPair, orderPremiumPairs } from './premiumPairs.js';

const red = { id: 201, tags: 'Комплекты,offer:red-duet', price: 13650, image: '/red.png' };
const angel = { id: 202, tags: 'offer:angel-duet', price: 15000 };
test('only explicit offer codes control the first home block', () => {
  assert.equal(requestedPremiumPair('?utm_content=angel-duet'), null);
  assert.equal(requestedPremiumPair('?offer=https://elsewhere'), null);
  assert.equal(requestedPremiumPair('?offer=angel-duet&utm_source=vk'), 'angel-duet');
});
test('a hidden or ordinary product cannot be advertised as an available set', () => {
  assert.deepEqual(premiumPairProducts([{ ...red, isActive: false }, { ...angel, tags: 'ordinary' }]), []);
  assert.equal(premiumPairProducts([{ ...red, isUpsell: true }]).length, 0);
});
test('ad-matched set comes first without changing the other set', () => {
  const pairs = premiumPairProducts([red, angel]);
  const sorted = orderPremiumPairs(pairs, 'angel-duet');
  assert.deepEqual(sorted.map(pair => pair.product.id), [202, 201]);
  assert.deepEqual(pairs.map(pair => pair.product.id), [201, 202]);
  assert.equal(sorted[0].product.price, 15000);
});
