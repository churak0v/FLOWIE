import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeFeed, filterHomeBudgetProducts, splitHomeSectionProducts } from './homeFeed.js';

function product(id, price, title = `Букет ${id}`, extra = {}) {
  return { id, price, title, image: `/${id}.jpg`, isActive: true, ...extra };
}

test('builds broad non-repeating home rubrics from real active catalog rows', () => {
  const products = [
    ...Array.from({ length: 15 }, (_, index) => product(index + 1, 3500 + (index * 100))),
    ...Array.from({ length: 12 }, (_, index) => product(index + 30, 5600 + (index * 100), `Розы ${index + 1}`)),
    ...Array.from({ length: 30 }, (_, index) => product(index + 60, 7500 + (index * 300))),
    ...Array.from({ length: 15 }, (_, index) => product(index + 110, 4800 + (index * 80))),
    product(99, 4000, 'Открытка', { isUpsell: true }),
    product(100, 4000, 'Неактивный', { isActive: false }),
  ];
  const feed = buildHomeFeed(products);
  const shown = [feed.opening, [feed.photoBanner], feed.budgetPool, [feed.priceBanner], feed.roses, feed.premium, feed.more]
    .flat().filter(Boolean);
  assert.ok(shown.length > 10);
  assert.equal(new Set(shown.map(({ id }) => id)).size, shown.length);
  assert.equal(shown.some(({ id }) => [99, 100].includes(id)), false);
  assert.equal(feed.opening.length, 9);
  assert.equal(feed.roses.length, 9);
  assert.equal(feed.premium.length, 9);
  assert.equal(feed.more.length, 9);
  assert.ok(filterHomeBudgetProducts(feed.budgetPool, 'from-7000').length >= 9);
  assert.ok(feed.roses.every((item) => /роз/i.test(item.title)));
  assert.ok(feed.premium.every((item) => item.price >= 7000));
});

test('reserves unseen real products for the sixth collage card', () => {
  const products = Array.from({ length: 9 }, (_, index) => product(index + 1, 4000 + index));
  const section = splitHomeSectionProducts(products);
  assert.deepEqual(section.visibleProducts.map(({ id }) => id), [1, 2, 3, 4, 5]);
  assert.deepEqual(section.collageProducts.map(({ id }) => id), [6, 7, 8, 9]);
});

test('budget interaction uses inclusive lower bounds without hidden maximums', () => {
  const products = [product(6, 7000), product(1, 2999), product(4, 5000), product(2, 3000), product(5, 6999), product(3, 4999)];
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-3000').map(({ id }) => id), [2, 3, 4, 5, 6]);
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-5000').map(({ id }) => id), [4, 5, 6]);
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-7000').map(({ id }) => id), [6]);
  assert.deepEqual(products.map(({ id }) => id), [6, 1, 4, 2, 5, 3]);
});
