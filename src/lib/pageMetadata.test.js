import test from 'node:test';
import assert from 'node:assert/strict';
import { describePageMetadata, updatePageMetadata } from './pageMetadata.js';

function fakeDocument(initial = []) {
  const children = [];
  const matches = (element, selector) => {
    if (selector === 'link[rel="canonical"]') return element.tagName === 'link' && element.getAttribute('rel') === 'canonical';
    if (selector === 'script[type="application/ld+json"]') return element.tagName === 'script' && element.getAttribute('type') === 'application/ld+json';
    if (selector === 'meta[property^="og:"]') return element.tagName === 'meta' && String(element.getAttribute('property') || '').startsWith('og:');
    const metaName = selector.match(/^meta\[name="([^"]+)"\]$/)?.[1];
    return Boolean(metaName && element.tagName === 'meta' && element.getAttribute('name') === metaName);
  };
  const head = {
    children,
    appendChild(element) { element.parentNode = head; children.push(element); return element; },
    querySelector(selector) { return head.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const selectors = selector.split(',').map(value => value.trim());
      return children.filter(element => selectors.some(value => matches(element, value)));
    },
  };
  const documentLike = {
    title: '',
    head,
    createElement(tagName) {
      const attributes = new Map();
      return {
        tagName,
        parentNode: null,
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        remove() {
          const index = children.indexOf(this);
          if (index >= 0) children.splice(index, 1);
          this.parentNode = null;
        },
      };
    },
  };
  for (const [tagName, attributes] of initial) {
    const element = documentLike.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    head.appendChild(element);
  }
  return documentLike;
}

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


test('uses actual UI product title after client navigation', () => {
  const page = describePageMetadata({pathname:'/product/55', products:[{id:55,title:'Букет 35 роз'}], origin:'https://flowie.art'});
  assert.equal(page.title, 'Букет 35 роз — купить с доставкой | FLOWIE');
});

test('describes the public care guide with its own canonical metadata', () => {
  const page = describePageMetadata({ pathname: '/care', origin: 'https://flowie.art' });
  assert.equal(page.title, 'Уход за цветами — советы флориста | FLOWIE');
  assert.equal(page.robots, 'index,follow');
  assert.equal(page.canonical, 'https://flowie.art/care');
});

test('keeps matching initial SSR data but removes stale OG and JSON-LD after SPA navigation', () => {
  const documentLike = fakeDocument([
    ['link', { rel: 'canonical', href: 'https://flowie.art/product/1' }],
    ['script', { type: 'application/ld+json' }],
    ['meta', { property: 'og:title', content: 'Старый букет' }],
  ]);

  updatePageMetadata({ pathname: '/product/1', products: [{ id: 1, title: 'Первый букет' }], origin: 'https://flowie.art' }, documentLike);
  assert.equal(documentLike.head.querySelectorAll('script[type="application/ld+json"]').length, 1);
  assert.equal(documentLike.head.querySelectorAll('meta[property^="og:"]').length, 1);

  updatePageMetadata({ pathname: '/product/2', products: [{ id: 2, title: 'Второй букет' }], origin: 'https://flowie.art' }, documentLike);
  assert.equal(documentLike.head.querySelectorAll('script[type="application/ld+json"]').length, 0);
  assert.equal(documentLike.head.querySelectorAll('meta[property^="og:"]').length, 0);
  assert.equal(documentLike.head.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://flowie.art/product/2');
});

test('confirmed unavailable products remain noindex on SPA navigation', () => {
  const page = describePageMetadata({pathname:'/product/55', products:[], unavailableIds:[55], origin:'https://flowie.art'});
  assert.equal(page.robots, 'noindex,nofollow');
});
