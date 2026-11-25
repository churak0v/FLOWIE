const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
process.env.PUBLIC_SITE_URL = 'https://flowie.test';
const { createSeoRouter } = require('../routes/seo');
const productsRouter = require('../routes/products');

const SHELL = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>FLOWIE</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

const maliciousName = 'Розы </script><script>alert("x")</script>';
const activeProduct = {
  id: 7,
  name: maliciousName,
  price: 5000,
  discount: 500,
  image: '/uploads/rose.jpg',
  description: '<b>Свежие</b> розы & подарок',
  isActive: true,
  isUpsell: false,
  updatedAt: new Date('2026-11-17T10:00:00.000Z'),
  images: [{ url: 'https://images.example/rose-2.jpg' }],
  composition: [{ name: 'Роза <аллая>', quantity: '15 шт.' }],
  collectionItems: [],
};

const collection = {
  id: 3,
  slug: 'romantic',
  type: 'thematic',
  title: 'Романтика & любовь',
  description: 'Нежные букеты',
  isActive: true,
  sort: 1,
  updatedAt: new Date('2026-11-16T10:00:00.000Z'),
  items: [{ id: 1, product: activeProduct }],
};

function matchesProduct(where, product) {
  if (where?.id != null && where.id !== product.id) return false;
  if (where?.isActive != null && where.isActive !== product.isActive) return false;
  if (where?.isUpsell != null && where.isUpsell !== product.isUpsell) return false;
  return true;
}

function createPrisma() {
  const inactive = { ...activeProduct, id: 8, name: 'Скрытый товар', isActive: false, updatedAt: new Date('2026-11-15T10:00:00.000Z') };
  const products = [activeProduct, inactive];
  return {
    product: {
      findMany: async ({ where, select } = {}) => products.filter((item) => matchesProduct(where, item)).map((item) => {
        if (!select) return item;
        return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, item[key]]));
      }),
      findFirst: async ({ where } = {}) => products.find((item) => matchesProduct(where, item)) || null,
    },
    collection: {
      findMany: async ({ where, select } = {}) => {
        const rows = where?.isActive === true ? [collection] : [collection];
        return rows.map((item) => {
          if (!select) return item;
          return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, item[key]]));
        });
      },
      findFirst: async ({ where } = {}) => {
        const idMatches = where?.id == null || where.id === collection.id;
        const slugMatches = where?.slug == null || where.slug === collection.slug;
        const typeMatches = where?.type == null || where.type === collection.type;
        return idMatches && slugMatches && typeMatches ? collection : null;
      },
    },
  };
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function seoRouter() {
  return createSeoRouter({ prisma: createPrisma(), loadShell: async () => SHELL });
}

test('product page returns crawlable escaped HTML and Product/Offer/Breadcrumb JSON-LD', async () => {
  await withServer(seoRouter(), async (base) => {
    const response = await fetch(`${base}/product/7`, { headers: { host: 'flowie.test' } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /<link rel="canonical" href="https:\/\/flowie\.test\/product\/7">/);
    assert.match(html, /<meta property="og:type" content="product">/);
    assert.match(html, /"@type":"Product"/);
    assert.match(html, /"@type":"Offer"/);
    assert.match(html, /"price":4500/);
    assert.match(html, /"priceCurrency":"RUB"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /Розы &lt;\/script&gt;&lt;script&gt;alert/);
    assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
    assert.match(html, /\\u003c\/script\\u003e/);
    assert.match(html, /src="\/assets\/app\.js"/);
  });
});

test('browser and crawler receive the same server-rendered content', async () => {
  await withServer(seoRouter(), async (base) => {
    const browser = await fetch(`${base}/catalog`, { headers: { 'user-agent': 'Mozilla/5.0', host: 'flowie.test' } }).then((r) => r.text());
    const crawler = await fetch(`${base}/catalog`, { headers: { 'user-agent': 'Googlebot', host: 'flowie.test' } }).then((r) => r.text());
    assert.equal(crawler, browser);
    assert.match(browser, /Каталог цветов/);
    assert.match(browser, /\/product\/7/);
  });
});

test('campaign landing exposes the offer without JavaScript or a catalog database query', async () => {
  const unavailableCatalog = {
    product: { findMany: async () => { throw new Error('CATALOG_UNAVAILABLE'); } },
    collection: { findMany: async () => { throw new Error('CATALOG_UNAVAILABLE'); } },
  };
  const router = createSeoRouter({ prisma: unavailableCatalog, loadShell: async () => SHELL });
  await withServer(router, async (base) => {
    let browserHtml;
    for (const userAgent of ['Mozilla/5.0', 'VK URL Autotest']) {
      const response = await fetch(`${base}/mothers-day?utm_source=vk&utm_campaign=mom`, { headers: { 'user-agent': userAgent } });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(html, /<title>День матери — 29 ноября: букеты в Ижевске \| FLOWIE<\/title>/);
      assert.match(html, /<meta name="description" content="Букеты для мамы с доставкой по Ижевску 29 ноября/);
      assert.match(html, /<meta name="robots" content="index,follow">/);
      assert.doesNotMatch(html, /noindex|utm_source|utm_campaign/);
      assert.match(html, /<link rel="canonical" href="https:\/\/flowie\.test\/mothers-day">/);
      assert.match(html, /<div id="root"><main id="seo-content"><h1>День матери — 29 ноября<\/h1>/);
      assert.match(html, /href="\/catalog\?occasion=mothers-day"/);
      assert.match(html, /src="\/assets\/app\.js"/);
      assert.equal((html.match(/id="root"/g) || []).length, 1);
      if (browserHtml) assert.equal(html, browserHtml);
      browserHtml = html;
    }
  });
});

test('campaign landing is routed to the SEO renderer by both storefront ingress configurations', () => {
  const root = path.join(__dirname, '..', '..');
  for (const filename of ['default.conf', 'production-edge.conf.template']) {
    const config = fs.readFileSync(path.join(root, 'nginx', filename), 'utf8');
    const block = config.match(/location = \/mothers-day \{([^}]+)\}/)?.[1];
    assert.ok(block, filename);
    assert.match(block, /proxy_pass http:\/\/(?:api:3001|\$api_host);/);
    assert.doesNotMatch(block, /noindex/);
  }
});

test('collection pages use real collection products and canonical slug', async () => {
  await withServer(seoRouter(), async (base) => {
    const response = await fetch(`${base}/catalog?collection=romantic`, { headers: { host: 'flowie.test' } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Романтика &amp; любовь/);
    assert.match(html, /canonical" href="https:\/\/flowie\.test\/catalog\?collection=romantic/);
    assert.match(html, /"@type":"ItemList"/);
  });
});

test('unknown and inactive products return a real noindex 404', async () => {
  await withServer(seoRouter(), async (base) => {
    for (const pathname of ['/product/8', '/product/not-a-number', '/catalog?collection=missing']) {
      const response = await fetch(`${base}${pathname}`, { headers: { host: 'flowie.test' } });
      const html = await response.text();
      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex,nofollow');
      assert.match(html, /Страница не найдена/);
    }
  });
});

test('sitemap contains only active canonical products and collections', async () => {
  await withServer(seoRouter(), async (base) => {
    const response = await fetch(`${base}/sitemap.xml`, { headers: { host: 'flowie.test' } });
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(xml, /<loc>https:\/\/flowie\.test\/product\/7<\/loc>/);
    assert.doesNotMatch(xml, /product\/8/);
    assert.match(xml, /catalog\?collection=romantic/);
    assert.match(xml, /<lastmod>2026-11-17T10:00:00\.000Z<\/lastmod>/);
  });
});

test('robots advertises the absolute sitemap without blocking noindex routes', async () => {
  await withServer(seoRouter(), async (base) => {
    const text = await fetch(`${base}/robots.txt`, { headers: { host: 'flowie.test' } }).then((r) => r.text());
    assert.equal(text, 'User-agent: *\nAllow: /\nSitemap: https://flowie.test/sitemap.xml\n');
    assert.doesNotMatch(text, /Disallow/);
  });
});

test('legacy unauthenticated product creation is closed', async () => {
  await withServer(express.Router().use('/api/products', productsRouter), async (base) => {
    const response = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Injected', price: 1, image: '/x.jpg' }),
    });
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { error: 'METHOD_NOT_ALLOWED' });
  });
});

test('static and private SPA fallbacks are marked noindex', () => {
  const root = path.join(__dirname, '..', '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const nginx = fs.readFileSync(path.join(root, 'nginx', 'production-app.conf'), 'utf8');
  assert.match(index, /<meta name="robots" content="noindex,nofollow"/);
  assert.match(nginx, /X-Robots-Tag "noindex, nofollow"/);
});

test('llms guide exposes canonical active products as text without unpublished products or stale prices', async () => {
  await withServer(seoRouter(), async (base) => {
    const response = await fetch(`${base}/llms.txt`, { headers: { host: 'flowie.test' } });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain; charset=utf-8/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(text, /^# FLOWIE\n/);
    assert.match(text, /https:\/\/flowie\.test\/product\/7/);
    assert.doesNotMatch(text, /product\/8|Скрытый товар|<script>|5000|4500/);
    assert.doesNotMatch(text, /<html|id="root"/);
    const html = await fetch(`${base}/product/7`).then((r) => r.text());
    assert.match(html, /rel="describedby" type="text\/plain" href="\/llms\.txt"/);
  });
  for (const file of ['default.conf', 'production-edge.conf.template']) {
    const config = fs.readFileSync(path.join(__dirname, '../../nginx', file), 'utf8');
    assert.match(config, /location = \/llms\.txt \{\s*proxy_pass http:/);
  }
});
