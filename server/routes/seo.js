const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  catalogPage,
  carePage,
  createShellLoader,
  escapeXml,
  homePage,
  mothersDayPage,
  notFoundPage,
  plainText,
  productPage,
  renderDocument,
} = require('../services/seo');

function requestBaseUrl(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch {
      // Production preflight validates this value; continue with the request origin in development.
    }
  }
  return `${req.protocol}://${req.get('host')}`;
}

function activeProductWhere() {
  return { isActive: true, isUpsell: false };
}

function productInclude() {
  return {
    images: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
    composition: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
    collectionItems: {
      where: { collection: { isActive: true } },
      include: { collection: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    },
  };
}

function collectionInclude() {
  return {
    items: {
      where: { product: activeProductWhere() },
      include: { product: { include: productInclude() } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    },
  };
}

function createSeoRouter({ prisma = new PrismaClient(), loadShell = createShellLoader() } = {}) {
  const router = express.Router();

  async function sendPage(req, res, status, page) {
    const shell = await loadShell();
    res.status(status);
    res.type('html');
    // The document contains the current hashed app entrypoint. Never let Safari or an
    // intermediary reuse an older shell after a deploy; immutable assets remain cached.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    if (page.robots?.includes('noindex')) res.set('X-Robots-Tag', page.robots);
    return res.send(renderDocument(shell, page));
  }

  async function sendNotFound(req, res) {
    return sendPage(req, res, 404, notFoundPage(requestBaseUrl(req)));
  }

  router.get('/robots.txt', (req, res) => {
    const baseUrl = requestBaseUrl(req);
    res.type('text/plain');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  // A concise discovery guide, generated from the same public records as the catalog.
  // Prices remain on canonical product pages, avoiding a second stale price list.
  router.get('/llms.txt', async (req, res, next) => {
    try {
      const baseUrl = requestBaseUrl(req);
      const products = await prisma.product.findMany({
        where: activeProductWhere(),
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
      const label = (value) => plainText(value, 180).replace(/[\\\[\]<>]/g, '');
      const lines = [
        '# FLOWIE',
        '',
        '> FLOWIE — интернет-магазин букетов и цветочных композиций с доставкой по Ижевску, Россия.',
        '',
        'Каталог и карточки товаров доступны без регистрации. Актуальные цены в рублях, состав и доступность указаны на странице каждого товара. Стоимость доставки зависит от адреса и не включена в цену букета, если на странице не указано иное.',
        'Список ниже включает только опубликованные основные товары. Наличие и цены могут изменяться: перед рекомендацией или заказом проверьте карточку. Неопубликованные размеры, отзывы и гарантии не следует выводить из фотографий.',
        '',
        '## Каталог',
        `- [Главная](${baseUrl}/): подборки букетов и предложения магазина.`,
        `- [Каталог цветов](${baseUrl}/catalog): доступные букеты и композиции.`,
        `- [Карта сайта](${baseUrl}/sitemap.xml): канонические страницы товаров и подборок.`,
        '',
        '## Товары',
        ...products.map((product) => `- [${label(product.name)}](${baseUrl}/product/${product.id})`),
        '',
      ];
      res.type('text/plain');
      res.set('Cache-Control', 'public, max-age=300');
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(lines.join('\n'));
    } catch (error) {
      next(error);
    }
  });

  router.get('/sitemap.xml', async (req, res, next) => {
    try {
      const baseUrl = requestBaseUrl(req);
      const [products, collections] = await Promise.all([
        prisma.product.findMany({ where: activeProductWhere(), select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }),
        prisma.collection.findMany({
          where: { isActive: true },
          select: {
            slug: true,
            type: true,
            updatedAt: true,
            items: { where: { product: activeProductWhere() }, select: { productId: true }, take: 1 },
          },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const entries = [
        { loc: `${baseUrl}/` },
        { loc: `${baseUrl}/catalog` },
        { loc: `${baseUrl}/care` },
        ...collections.filter((item) => item.slug && item.items?.length).map((item) => ({
          loc: `${baseUrl}/catalog?${item.type === 'scenario' ? 'scenario' : 'collection'}=${encodeURIComponent(item.slug)}`,
          lastmod: item.updatedAt,
        })),
        ...products.map((item) => ({ loc: `${baseUrl}/product/${item.id}`, lastmod: item.updatedAt })),
      ];
      const body = entries.map((entry) => `<url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(new Date(entry.lastmod).toISOString())}</lastmod>` : ''}</url>`).join('');
      res.type('application/xml');
      res.set('Cache-Control', 'public, max-age=300');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const baseUrl = requestBaseUrl(req);
      const [products, collections] = await Promise.all([
        prisma.product.findMany({ where: activeProductWhere(), include: productInclude(), orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 24 }),
        prisma.collection.findMany({ where: { isActive: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
      ]);
      return sendPage(req, res, 200, homePage({ products, collections, baseUrl }));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/mothers-day', async (req, res, next) => {
    try {
      return await sendPage(req, res, 200, mothersDayPage({ baseUrl: requestBaseUrl(req) }));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/care', async (req, res, next) => {
    try {
      const products = await prisma.product.findMany({ where: activeProductWhere(), include: productInclude(), orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 8 });
      return await sendPage(req, res, 200, carePage({ products, baseUrl: requestBaseUrl(req) }));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/shop', (req, res) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, `/catalog${query}`);
  });

  router.get('/catalog', async (req, res, next) => {
    try {
      const baseUrl = requestBaseUrl(req);
      const collectionKey = req.query.collection != null ? 'collection' : req.query.scenario != null ? 'scenario' : null;
      const raw = collectionKey ? String(req.query[collectionKey] || '').trim() : '';
      let collection = null;
      let products;
      if (collectionKey) {
        const numericId = /^\d+$/.test(raw) ? Number(raw) : null;
        collection = await prisma.collection.findFirst({
          where: {
            isActive: true,
            type: collectionKey === 'scenario' ? 'scenario' : 'thematic',
            ...(numericId ? { id: numericId } : { slug: raw }),
          },
          include: collectionInclude(),
        });
        if (!collection) return sendNotFound(req, res);
        products = collection.items.map((item) => item.product);
      } else {
        products = await prisma.product.findMany({ where: activeProductWhere(), include: productInclude(), orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }] });
      }
      const collections = await prisma.collection.findMany({ where: { isActive: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
      return sendPage(req, res, 200, catalogPage({ products, collection, collections, baseUrl }));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/product/:id', async (req, res, next) => {
    try {
      if (!/^\d+$/.test(String(req.params.id || ''))) return sendNotFound(req, res);
      const product = await prisma.product.findFirst({ where: { id: Number(req.params.id), ...activeProductWhere() }, include: productInclude() });
      if (!product) return sendNotFound(req, res);
      const collection = product.collectionItems.map((item) => item.collection).find((item) => item?.isActive) || null;
      return sendPage(req, res, 200, productPage({ product, collection, baseUrl: requestBaseUrl(req) }));
    } catch (error) {
      return next(error);
    }
  });

  router.use((error, req, res, _next) => {
    console.error('SEO route failed:', error?.message || error);
    if (res.headersSent) return;
    const page = notFoundPage(requestBaseUrl(req));
    page.title = 'Временно недоступно | FLOWIE';
    page.description = 'Каталог FLOWIE временно недоступен.';
    page.content = '<h1>Каталог временно недоступен</h1><p>Пожалуйста, попробуйте ещё раз позднее.</p>';
    sendPage(req, res, 503, page).catch(() => res.status(503).type('text').send('Service unavailable'));
  });

  return router;
}

module.exports = createSeoRouter();
module.exports.createSeoRouter = createSeoRouter;
module.exports.requestBaseUrl = requestBaseUrl;
