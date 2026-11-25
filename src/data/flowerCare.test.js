import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCylindricalWaterMl, getFlowerCare, getProductFlowerCare } from './flowerCare.js';

test('product care uses structured composition and never treats eucalyptus as a live flower profile', () => {
  const roses = getProductFlowerCare({ composition: [{ name: 'Роза Пинк Флойд', quantity: 9 }, { name: 'Стабилизированный эвкалипт', quantity: 2 }] });
  assert.deepEqual(roses.flowerKeys, ['roses']);
  assert.equal(roses.primary.key, 'roses');

  const decorOnly = getProductFlowerCare({ composition: [{ name: 'Стабилизированный эвкалипт', quantity: 4 }, { name: 'Упаковка', quantity: 1 }] });
  assert.deepEqual(decorOnly.flowerKeys, []);
  assert.equal(decorOnly.primary.key, 'bouquet');
});

test('vase volume is a bounded geometry calculation rather than a recommended fill level', () => {
  assert.equal(calculateCylindricalWaterMl(12, 10), 1131);
  assert.equal(calculateCylindricalWaterMl(0, 10), null);
  assert.equal(calculateCylindricalWaterMl(12, 61), null);
});

test('mixed supported flowers return their profiles but use conservative bouquet guidance', () => {
  const result = getProductFlowerCare({ composition: [{ name: 'Роза', quantity: 5 }, { name: 'Гортензия', quantity: 2 }] });
  assert.deepEqual(result.flowerKeys, ['roses', 'hydrangeas']);
  assert.deepEqual(result.profiles.map((profile) => profile.key), ['roses', 'hydrangeas']);
  assert.equal(result.primary.key, 'bouquet');
  assert.match(getFlowerCare('gerberas').water, /0,5 л/);
});
