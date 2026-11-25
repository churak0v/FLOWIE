import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowerOptions, filterCatalogProducts, normalizeFlowerName, selectCatalogScopeProducts } from './catalogFilters.js';

const products = [
  { id: 1, title: 'Нежный', price: 3000, composition: ['Розы · 15', 'Эвкалипт', 'Лента'] },
  { id: 2, title: 'Садовый', price: 5000, composition: [{ name: 'Кустовые розы', quantity: 7 }, 'Хризантема'] },
  { id: 3, title: 'Летний', price: 7000, composition: ['Пионы', 'Упаковка'] },
];

test('normalizes real flower names and removes service composition', () => {
  assert.deepEqual(normalizeFlowerName('Розы · 15'), { key: 'roses', label: 'Розы' });
  assert.deepEqual(normalizeFlowerName('Пионы'), { key: 'peonies', label: 'Пионы' });
  assert.deepEqual(normalizeFlowerName({ name: 'кустовая роза' }), { key: 'spray-roses', label: 'Кустовые розы' });
  assert.equal(normalizeFlowerName('Мягкая упаковка'), null);
});

test('builds options only from compositions and counts matching products', () => {
  assert.deepEqual(new Map(buildFlowerOptions(products).map(({ key, count }) => [key, count])), new Map([
    ['roses', 1], ['peonies', 1], ['spray-roses', 1], ['chrysanthemums', 1],
  ]));
});

test('combines flower, inclusive price and stable sorting filters', () => {
  assert.deepEqual(filterCatalogProducts(products, { flowers: ['roses', 'spray-roses'], min: 3000, max: 5000, sort: 'price_desc' }).map((product) => product.id), [2, 1]);
  assert.deepEqual(filterCatalogProducts(products, { min: 5000, max: 5000 }).map((product) => product.id), [2]);
  assert.deepEqual(filterCatalogProducts(products, { search: 'пионы' }).map((product) => product.id), [3]);
});

test('keeps an empty input empty', () => {
  assert.deepEqual(filterCatalogProducts([], { search: '' }), []);
  assert.deepEqual(selectCatalogScopeProducts(products, []), []);
  assert.equal(selectCatalogScopeProducts(products, null), products);
});

test('accepts async semantic IDs without bypassing price filters', () => {
  assert.deepEqual(filterCatalogProducts(products, { search: 'нежное настроение', semanticProductIds: [2], max: 5000 }).map((product) => product.id), [2]);
  assert.deepEqual(filterCatalogProducts(products, { search: 'нежное настроение', semanticProductIds: [3], max: 5000 }), []);
});

test('rose color adjectives do not turn pink dianthus or chrysanthemums into roses', () => {
  assert.deepEqual(normalizeFlowerName('Диантус розовый'), {key:'dianthus',label:'Диантус'});
  assert.deepEqual(normalizeFlowerName('Кустовая розовая хризантема'), {key:'chrysanthemums',label:'Хризантемы'});
  assert.deepEqual(normalizeFlowerName('Кустовые розы'), {key:'spray-roses',label:'Кустовые розы'});
});
