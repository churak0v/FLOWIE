import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendMothersDayProducts } from './mothersDayRecommendations.js';

const products = [
  { id: 75, title: 'Белые розы', price: 4500, color: 'белый', sort: 2 },
  { id: 70, title: 'Пудровый букет', price: 4900, color: 'розовый', tags: 'нежный,пудровый', sort: 1 },
  { id: 55, title: 'Розовый авторский', price: 5900, color: 'розовый', sort: 1 },
  { id: 3, title: 'Сиреневый сад', price: 6500, color: 'сиреневый', sort: 2 },
  { id: 2, title: 'Большой ягодный', price: 7500, color: 'бордовый', sort: 1 },
  { id: 20, title: 'Белый премиум', price: 8200, color: 'белый', sort: 2 },
];

test('returns no more than two products in each of three price tiers', () => {
  const result = recommendMothersDayProducts({
    products,
    collections: [],
    profile: { palette: ['pink', 'white'], tone: 'soft', lightness: 'light' },
    styleCode: 'soft',
  });
  assert.equal(result.groups.length, 3);
  assert.equal(result.resultCount, 6);
  assert.equal(result.tierCoverage, 3);
  assert.ok(result.groups.every((group) => group.items.length <= 2));
  assert.equal(result.groups[0].items[0].product.id, 70);
});

test('manual fallback remains deterministic when catalog metadata is sparse', () => {
  const first = recommendMothersDayProducts({ products, collections: [], profile: null, styleCode: 'light' });
  const second = recommendMothersDayProducts({ products, collections: [], profile: null, styleCode: 'light' });
  assert.deepEqual(first.groups.map((group) => group.items.map((item) => item.product.id)), second.groups.map((group) => group.items.map((item) => item.product.id)));
});

test('allowlisted campaign segment changes ordering but never removes price tiers', () => {
  const value = recommendMothersDayProducts({ products, collections: [], styleCode: 'soft', campaignSegment: 'value' });
  const premium = recommendMothersDayProducts({ products, collections: [], styleCode: 'soft', campaignSegment: 'premium' });
  assert.equal(value.groups.length, 3);
  assert.equal(premium.groups.length, 3);
  assert.deepEqual(value.groups.map((group) => [group.min, group.max]), premium.groups.map((group) => [group.min, group.max]));
  assert.equal(recommendMothersDayProducts({ products, campaignSegment: 'private-value' }).campaignSegment, 'balanced');
});
