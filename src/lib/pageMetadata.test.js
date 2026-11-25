import test from 'node:test';
import assert from 'node:assert/strict';
import { describePageMetadata } from './pageMetadata.js';

test('describes indexable SPA routes with clean canonicals', () => {
  assert.deepEqual(describePageMetadata({
    pathname: '/catalog',
    search: '?collection=romantic&utm_source=vk&phone=79990000000',
    origin: 'https://flowie.test',
  }), {
    title: 'Каталог цветов с доставкой | FLOWIE',
    description: 'Каталог свежих букетов FLOWIE с доставкой по Ижевску.',
    robots: 'index,follow',
    canonical: 'https://flowie.test/catalog?collection=romantic',
  });
});

test('uses the current product after SPA navigation instead of a stale general title', () => {
  const metadata = describePageMetadata({
    pathname: '/product/42',
    products: [{ id: 42, name: 'Белые розы', description: '<p>Нежный букет</p>' }],
    origin: 'https://flowie.test',
  });
  assert.equal(metadata.title, 'Белые розы — купить с доставкой | FLOWIE');
  assert.equal(metadata.description, 'Нежный букет');
  assert.equal(metadata.canonical, 'https://flowie.test/product/42');
  assert.equal(metadata.robots, 'index,follow');
});

test('private routes remain noindex and have no canonical', () => {
  const metadata = describePageMetadata({ pathname: '/checkout', search: '?token=secret', origin: 'https://flowie.test' });
  assert.equal(metadata.title, 'Оформление заказа | FLOWIE');
  assert.equal(metadata.robots, 'noindex,nofollow');
  assert.equal(metadata.canonical, null);
  assert.doesNotMatch(JSON.stringify(metadata), /token|secret/);
});

