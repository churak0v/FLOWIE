import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeFeed, filterHomeBudgetProducts } from './homeFeed.js';

function product(id, price, title = `Букет ${id}`, extra = {}) {
  return { id, price, title, image: `/${id}.jpg`, isActive: true, ...extra };
}

test('builds broad non-repeating home rubrics from real active catalog rows', () => {
  const products = [
    ...Array.from({ length: 9 }, (_, index) => product(index + 1, 3500 + (index * 100))),
    ...Array.from({ length: 8 }, (_, index) => product(index + 20, 5600 + (index * 100), `Розы ${index + 1}`)),
    ...Array.from({ length: 9 }, (_, index) => product(index + 40, 7500 + (index * 300))),
    product(99, 4000, 'Открытка', { isUpsell: true }),
    product(100, 4000, 'Неактивный', { isActive: false }),
  ];
  const feed = buildHomeFeed(products);
  const shown = [feed.opening, [feed.photoBanner], feed.budgetPool, [feed.priceBanner], feed.roses, feed.premium, feed.more]
    .flat().filter(Boolean);
  assert.ok(shown.length > 10);
  assert.equal(new Set(shown.map(({ id }) => id)).size, shown.length);
  assert.equal(shown.some(({ id }) => [99, 100].includes(id)), false);
  assert.ok(feed.roses.every((item) => /роз/i.test(item.title)));
  assert.ok(feed.premium.every((item) => item.price >= 7000));
});

test('budget interaction uses inclusive lower bounds without hidden maximums', () => {
  const products = [product(6, 7000), product(1, 2999), product(4, 5000), product(2, 3000), product(5, 6999), product(3, 4999)];
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-3000').map(({ id }) => id), [2, 3, 4, 5, 6]);
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-5000').map(({ id }) => id), [4, 5, 6]);
  assert.deepEqual(filterHomeBudgetProducts(products, 'from-7000').map(({ id }) => id), [6]);
  assert.deepEqual(products.map(({ id }) => id), [6, 1, 4, 2, 5, 3]);
});
