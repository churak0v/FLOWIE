const fs = require('fs/promises');
const path = require('path');

const DEFAULT_TITLE = 'FLOWIE — доставка цветов в Ижевске';
const DEFAULT_DESCRIPTION = 'Свежие букеты FLOWIE с доставкой по Ижевску. Выберите цветы, укажите адрес и следите за заказом в приложении.';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function plainText(value, max = 240) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function absoluteHttpUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || ''), `${baseUrl}/`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function money(value) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function productPrice(product) {
  return Math.max(0, Number(product?.price || 0) - Number(product?.discount || 0));
}

function productImages(product, baseUrl) {
  const values = [product?.image, ...(Array.isArray(product?.images) ? product.images.map((item) => item?.url) : [])];
  return [...new Set(values.map((value) => absoluteHttpUrl(value, baseUrl)).filter(Boolean))];
}

function canonicalCollectionUrl(baseUrl, collection) {
  const key = collection?.type === 'scenario' ? 'scenario' : 'collection';
  return `${baseUrl}/catalog?${key}=${encodeURIComponent(String(collection?.slug || collection?.id || ''))}`;
}

function productCard(product, baseUrl) {
  const image = productImages(product, baseUrl)[0];
  const description = plainText(product?.description, 150);
  return `<article class="seo-card">
    <a href="/product/${encodeURIComponent(String(product.id))}">
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" width="640" height="640">` : ''}
      <h2>${escapeHtml(product.name)}</h2>
    </a>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <p class="seo-price">${escapeHtml(money(productPrice(product)))}</p>
  </article>`;
}

function breadcrumbs(items) {
  return `<nav aria-label="Хлебные крошки"><ol class="seo-breadcrumbs">${items.map((item, index) => (
    `<li>${item.href && index < items.length - 1 ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>` : escapeHtml(item.name)}</li>`
  )).join('')}</ol></nav>`;
}

function breadcrumbJsonLd(baseUrl, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.href ? { item: absoluteHttpUrl(item.href, baseUrl) } : {}),
    })),
  };
}

function buildHead({ title, description, canonical, image, type = 'website', robots = 'index,follow', structuredData = [] }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${escapeHtml(robots)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:type" content="${escapeHtml(type)}">`,
    `<meta property="og:site_name" content="FLOWIE">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    ...structuredData.map((entry) => `<script type="application/ld+json">${jsonLd(entry)}</script>`),
    `<style id="flowie-seo-style">
      #seo-content{max-width:980px;margin:0 auto;padding:24px 18px 120px;font-family:Inter,system-ui,sans-serif;color:#171417;background:#fff}
      #seo-content a{color:inherit}.seo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}.seo-card{border:1px solid #eadfe3;border-radius:18px;padding:14px}.seo-card img,.seo-product-image{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:14px}.seo-card h2{font-size:18px}.seo-price{font-size:18px;font-weight:800}.seo-breadcrumbs{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;color:#725c65}.seo-breadcrumbs li+li:before{content:'›';margin-right:8px}.seo-collections{display:flex;flex-wrap:wrap;gap:10px;padding:0;list-style:none}.seo-collections a{display:block;border:1px solid #eadfe3;border-radius:999px;padding:9px 14px}.seo-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);gap:28px}@media(max-width:700px){.seo-product{grid-template-columns:1fr}}
    </style>`,
  ];
  return tags.filter(Boolean).join('\n');
}

function renderDocument(shell, page) {
  let html = String(shell || '');
  if (!/<div\s+id=["']root["'][^>]*>/i.test(html) || !/<\/head>/i.test(html)) {
    throw new Error('SEO_APP_SHELL_INVALID');
  }
  html = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+(?:name=["'](?:description|robots|twitter:card)["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<style\s+id=["']flowie-seo-style["'][\s\S]*?<\/style>/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<\/head>/i, `${buildHead(page)}\n</head>`);
  html = html.replace(/<div\s+id=["']root["'][^>]*>[\s\S]*?<\/div>/i, `<div id="root"><main id="seo-content">${page.content}</main></div>`);
  return html;
}

function createShellLoader() {
  let cached = null;
  let expiresAt = 0;
  return async function loadShell() {
    if (cached && Date.now() < expiresAt) return cached;
    const shellUrl = String(process.env.SEO_APP_SHELL_URL || '').trim();
    if (shellUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(shellUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`SEO_APP_SHELL_HTTP_${response.status}`);
        cached = await response.text();
      } finally {
        clearTimeout(timer);
      }
    } else {
      const shellPath = process.env.SEO_APP_SHELL_PATH || path.join(__dirname, '..', '..', 'index.html');
      cached = await fs.readFile(shellPath, 'utf8');
    }
    expiresAt = Date.now() + 5 * 60_000;
    return cached;
  };
}

function homePage({ products, collections, baseUrl }) {
  const canonical = `${baseUrl}/`;
  const collectionLinks = collections.map((collection) => (
    `<li><a href="${escapeHtml(canonicalCollectionUrl(baseUrl, collection).replace(baseUrl, ''))}">${escapeHtml(collection.title)}</a></li>`
  )).join('');
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical,
    image: productImages(products[0], baseUrl)[0],
    structuredData: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'FLOWIE', url: canonical }],
    content: `<h1>Доставка свежих цветов FLOWIE</h1><p>${escapeHtml(DEFAULT_DESCRIPTION)}</p>
      ${collectionLinks ? `<h2>Подборки цветов</h2><ul class="seo-collections">${collectionLinks}</ul>` : ''}
      <h2>Популярные букеты</h2><div class="seo-grid">${products.map((product) => productCard(product, baseUrl)).join('')}</div>`,
  };
}

function catalogPage({ products, collection, collections, baseUrl }) {
  const canonical = collection ? canonicalCollectionUrl(baseUrl, collection) : `${baseUrl}/catalog`;
  const title = collection ? `${collection.title} — цветы с доставкой | FLOWIE` : 'Каталог цветов с доставкой | FLOWIE';
  const description = plainText(collection?.description, 220) || (collection ? `Букеты из подборки «${collection.title}» с доставкой по Ижевску.` : 'Каталог свежих букетов FLOWIE с доставкой по Ижевску.');
  const crumbs = [{ name: 'Главная', href: '/' }, { name: 'Каталог', href: '/catalog' }, ...(collection ? [{ name: collection.title }] : [])];
  const collectionLinks = collections.map((item) => `<li><a href="${escapeHtml(canonicalCollectionUrl(baseUrl, item).replace(baseUrl, ''))}">${escapeHtml(item.title)}</a></li>`).join('');
  return {
    title,
    description,
    canonical,
    image: productImages(products[0], baseUrl)[0],
    structuredData: [breadcrumbJsonLd(baseUrl, crumbs), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: collection?.title || 'Каталог FLOWIE',
      itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${baseUrl}/product/${product.id}` })),
    }],
    content: `${breadcrumbs(crumbs)}<h1>${escapeHtml(collection?.title || 'Каталог цветов')}</h1><p>${escapeHtml(description)}</p>
      ${collectionLinks ? `<ul class="seo-collections">${collectionLinks}</ul>` : ''}
      <div class="seo-grid">${products.map((product) => productCard(product, baseUrl)).join('')}</div>`,
  };
}

function productPage({ product, collection, baseUrl }) {
  const canonical = `${baseUrl}/product/${product.id}`;
  const price = productPrice(product);
  const images = productImages(product, baseUrl);
  const description = plainText(product.description, 260) || `${product.name} — свежий букет FLOWIE с доставкой по Ижевску.`;
  const collectionPath = collection ? canonicalCollectionUrl(baseUrl, collection).replace(baseUrl, '') : '';
  const crumbs = [{ name: 'Главная', href: '/' }, { name: 'Каталог', href: '/catalog' }, ...(collection ? [{ name: collection.title, href: collectionPath }] : []), { name: product.name }];
  const productData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    sku: String(product.id),
    url: canonical,
    ...(images.length ? { image: images } : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      price,
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  const composition = Array.isArray(product.composition) && product.composition.length
    ? `<h2>Состав</h2><ul>${product.composition.map((item) => `<li>${escapeHtml(item.name)} — ${escapeHtml(item.quantity)}</li>`).join('')}</ul>`
    : '';
  return {
    title: `${product.name} — купить с доставкой | FLOWIE`,
    description,
    canonical,
    image: images[0],
    type: 'product',
    structuredData: [productData, breadcrumbJsonLd(baseUrl, crumbs)],
    content: `${breadcrumbs(crumbs)}<article class="seo-product">
      <div>${images[0] ? `<img class="seo-product-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" width="800" height="800">` : ''}</div>
      <div><h1>${escapeHtml(product.name)}</h1><p class="seo-price">${escapeHtml(money(price))}</p><p>${escapeHtml(description)}</p>${composition}</div>
    </article>`,
  };
}

function notFoundPage(baseUrl) {
  return {
    title: 'Страница не найдена | FLOWIE',
    description: 'Запрошенная страница FLOWIE не найдена.',
    canonical: `${baseUrl}/404`,
    robots: 'noindex,nofollow',
    content: '<h1>Страница не найдена</h1><p>Вернитесь в <a href="/catalog">каталог цветов</a>.</p>',
  };
}

module.exports = {
  DEFAULT_DESCRIPTION,
  absoluteHttpUrl,
  breadcrumbJsonLd,
  canonicalCollectionUrl,
  catalogPage,
  createShellLoader,
  escapeHtml,
  escapeXml,
  homePage,
  jsonLd,
  notFoundPage,
  plainText,
  productPage,
  renderDocument,
};
