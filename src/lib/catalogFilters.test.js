import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowerOptions, filterCatalogProducts, isPreservedComposition, normalizeFlowerName, selectCatalogScopeProducts } from './catalogFilters.js';

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

test('keeps actual catalog botanicals and rejects packaging, care and delivery rows', () => {
  const botanicals = ['Лагурус', 'Гипсофила', 'Озотамнус', 'Танацетум', 'Хлопок натуральный', 'Амарант стабилизированный', 'Кермек', 'Лимониум'];
  assert.deepEqual(botanicals.map(value => normalizeFlowerName(value)?.key), [
    'lagurus', 'gypsophila', 'ozothamnus', 'tanacetum', 'cotton', 'amaranth', 'statice', 'limonium',
  ]);
  for (const value of ['Бумага тишью', 'Фоамиран', 'Коробка шляпная', 'Аквабокс с водой', 'Кризал', 'Chrysal', 'Биофлор', 'Губка флористическая', 'Доставка бизнес-класса', 'Ваза стеклянная', 'Плёнка', 'Пакет', 'Transport', 'Perfume', 'Инструкция', 'Рекомендация по уходу', 'Сумочка', 'Сумочка картонная', 'Сумочка-переноска', 'Нобилис', 'Писташ', 'Фисташка']) {
    assert.equal(normalizeFlowerName(value), null, value);
  }
  const options = buildFlowerOptions([{ composition: [...botanicals, 'Упаковка дизайнерская', 'Открытка с пожеланиями', 'Кризал'] }]);
  assert.equal(options.length, botanicals.length);
});

test('classifies only genuinely dry or stabilized compositions', () => {
  assert.equal(isPreservedComposition({ title: 'Композиция из сухоцветов', composition: [] }), true);
  assert.equal(isPreservedComposition({ title: 'Композиция из стабилизированных цветов', composition: [] }), true);
  assert.equal(isPreservedComposition({ title: 'Стабилизированная роза в колбе', composition: [{ name: 'Роза' }] }), true);
  assert.equal(isPreservedComposition({ title: 'Натуральная композиция', composition: ['Лагурус', 'Хлопок', 'Коробка шляпная'] }), true);
  assert.equal(isPreservedComposition({ title: 'Натуральная композиция', composition: ['Кермек', 'Коробка шляпная'] }), false);
  assert.equal(isPreservedComposition({ title: 'Букет из роз и эвкалипта', composition: ['Роза Эквадор', 'Эвкалипт стабилизированный', 'Упаковка'] }), false);
  assert.equal(isPreservedComposition({ title: 'Розы с сухоцветами', composition: ['Роза Эквадор', 'Лаванда (сухоцвет)'] }), false);
  assert.equal(isPreservedComposition({ title: 'Композиция', composition: ['Лимониум', 'Озотамнус', 'Упаковка'] }), false);
  assert.equal(isPreservedComposition({ title: 'Композиция', composition: ['Упаковка', 'Кризал'] }), false);
});

test('maps the confirmed Marvel Bubbles rose variety but not greenery', () => {
  assert.deepEqual(normalizeFlowerName('Марвел баблз'), { key: 'spray-roses', label: 'Кустовые розы' });
  assert.equal(normalizeFlowerName('Нобилис'), null);
  assert.equal(normalizeFlowerName('Писташ'), null);
  assert.equal(normalizeFlowerName('Фисташка'), null);
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
