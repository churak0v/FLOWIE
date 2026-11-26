import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCylindricalWaterMl, getFlowerCare, getProductFlowerCare, matchesCareProfile, careSelectionTitle } from './flowerCare.js';

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

test('bouquet refill cue is concrete without pretending to be an initial fill amount', () => {
  assert.match(getFlowerCare('bouquet').water, /опустилась примерно до трети высоты вазы/);
  assert.match(getFlowerCare('bouquet').water, /долейте свежую воду/);
});

test('mixed supported flowers return their profiles but use conservative bouquet guidance', () => {
  const result = getProductFlowerCare({ composition: [{ name: 'Роза', quantity: 5 }, { name: 'Гортензия', quantity: 2 }] });
  assert.deepEqual(result.flowerKeys, ['roses', 'hydrangeas']);
  assert.deepEqual(result.profiles.map((profile) => profile.key), ['roses', 'hydrangeas']);
  assert.equal(result.primary.key, 'bouquet');
  assert.match(getFlowerCare('gerberas').water, /0,5 л/);
});

test('unknown second flower prevents false mono profile', () => {
  const result = getProductFlowerCare({ composition: [{ name: 'Роза', quantity: 5 }, { name: 'Диантус', quantity: 3 }] });
  assert.deepEqual(result.flowerKeys, ['roses', 'dianthus']);
  assert.deepEqual(result.profiles.map((profile) => profile.key), ['roses']);
  assert.equal(result.primary.key, 'bouquet');
});

test('Russian box and basket names select the composition care profile', () => {
  for (const product of [
    { title: 'Хризантема Ньютон и диантус в коробке', composition: [{ name: 'Хризантема' }, { name: 'Диантус' }] },
    { title: 'Композиция в плетёной корзине', composition: [{ name: 'Роза' }] },
    { title: 'Цветы во флористической губке', composition: [{ name: 'Эустома' }] },
  ]) {
    const result = getProductFlowerCare(product);
    assert.equal(result.arrangementKey, 'composition', product.title);
    assert.equal(result.primary.key, 'composition', product.title);
  }
  assert.equal(getFlowerCare('composition').key, 'composition');
});

test('dry bouquet gets preserved care with no watering', () => {
  const result = getProductFlowerCare({ title: 'Букет из сухоцветов', composition: [{ name: 'Лагурус', quantity: 7 }, { name: 'Хлопок', quantity: 3 }] });
  assert.equal(result.arrangementKey, 'preserved');
  assert.equal(result.primary.key, 'preserved');
  assert.match(result.primary.water, /Вода не нужна/);
  assert.match(result.primary.steps.flat().join(' '), /Не поливайте/);
});

test('preserved rose is not treated as a fresh mono rose', () => {
  const result = getProductFlowerCare({ title: 'Стабилизированная роза в колбе', composition: [{ name: 'Роза', quantity: 1 }] });
  assert.deepEqual(result.flowerKeys, ['roses']);
  assert.equal(result.primary.key, 'preserved');
});

test('fresh roses with stabilized eucalyptus remain a fresh bouquet', () => {
  const result = getProductFlowerCare({ title: 'Букет с розами', composition: [{ name: 'Роза', quantity: 9 }, { name: 'Стабилизированный эвкалипт', quantity: 2 }] });
  assert.equal(result.arrangementKey, 'bouquet');
  assert.equal(result.primary.key, 'roses');
});

test('care selections separate bouquets, fresh arrangements and preserved flowers', () => {
  const bouquet = { title: 'Букет роз', composition: ['Роза · 9', 'Лента'] };
  const arrangement = { title: 'Розы в коробке', composition: ['Роза · 9', 'Оазис'] };
  const preserved = { title: 'Стабилизированная роза в колбе', composition: ['Роза'] };
  assert.equal(matchesCareProfile(bouquet, 'roses'), true);
  assert.equal(matchesCareProfile(arrangement, 'roses'), false);
  assert.equal(matchesCareProfile({ title: 'Розы в сумочке', composition: ['Роза'] }, 'roses'), false);
  assert.equal(matchesCareProfile(arrangement, 'bouquet'), false);
  assert.equal(matchesCareProfile(arrangement, 'composition'), true);
  assert.equal(matchesCareProfile(preserved, 'roses'), false);
  assert.equal(matchesCareProfile(preserved, 'preserved'), true);
  assert.equal(careSelectionTitle('roses'), 'Букеты с розами');
});
