import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProductRecommendations } from './productRecommendations.js';

function product(id, price, composition, extra = {}) {
  return { id, title: `Букет ${id}`, price, composition, image: `/${id}.jpg`, isActive: true, ...extra };
}

test('ranks similar composition by overlap then nearby price and excludes the current product', () => {
  const current = product(1, 5000, ['Роза', 'Эустома']);
  const products = [
    current,
    product(2, 5100, ['Роза']),
    product(3, 9000, ['Роза', 'Эустома']),
    product(6, 5200, ['Роза', 'Эустома']),
    product(6, 5200, ['Роза', 'Эустома']),
    product(4, 5300, ['Пион']),
    product(5, 4900, ['Роза'], { isActive: false }),
  ];
  const result = selectProductRecommendations({ products, currentProduct: current });
  assert.deepEqual(result.similar.map(({ id }) => id), [6, 3, 2]);
  assert.equal(result.similar.some(({ id }) => id === current.id), false);
});

test('uses normalized botanical intersections without treating a color adjective as a rose', () => {
  const current = product(1, 5000, ['Роза']);
  const products = [current,
    ...Array.from({ length: 11 }, (_, index) => product(index + 2, 5000 + index, [{ name: 'Розы', quantity: 9 }])),
    product(99, 5000, ['Диантус розовый']),
  ];
  const result = selectProductRecommendations({ products, currentProduct: current });
  assert.equal(result.similar.length, 4);
  assert.equal(result.sameFlowers.length, 6);
  assert.equal(result.sameFlowers.some(({ id }) => id === 99), false);
  assert.equal(new Set([...result.similar, ...result.sameFlowers].map(({ id }) => id)).size, 10);
});

test('hides recommendations when no real matching catalog rows exist', () => {
  const current = product(1, 5000, ['Роза']);
  const result = selectProductRecommendations({
    products: [current, product(2, 5100, ['Пион']), product(3, 5000, ['Роза'], { image: '' })],
    currentProduct: current,
  });
  assert.deepEqual(result, { similar: [], sameFlowers: [] });
});

