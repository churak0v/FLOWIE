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

function ownedUploadVariantPlan(value, baseUrl) {
  const original = absoluteHttpUrl(value, baseUrl);
  if (!original) return null;
  let imageUrl;
  let siteUrl;
  try {
    imageUrl = new URL(original);
    siteUrl = new URL(baseUrl);
  } catch {
    return null;
  }
  if (imageUrl.origin !== siteUrl.origin) return null;
  const pathname = imageUrl.pathname;
  const uuidUpload = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i.test(pathname);
  const ownedImport = /^\/uploads\/flowwow-owned\/[a-f0-9]{64}\.(?:jpe?g|png|webp)$/i.test(pathname)
    || /^\/uploads\/import-products\/(?:[a-z0-9_-]+\/)+[a-f0-9]{64}\.(?:jpe?g|png|webp)$/i.test(pathname);
  if (!uuidUpload && !ownedImport) return null;
  const base = `${imageUrl.origin}${pathname}`;
  const query = imageUrl.search;
  const variant = (width, format) => `${base}@${width}.${format}${query}`;
  const widths = [320, 640, 1280];
  return {
    original,
    avif: widths.map(width => `${variant(width, 'avif')} ${width}w`).join(', '),
    webp: widths.map(width => `${variant(width, 'webp')} ${width}w`).join(', '),
    fallback: variant(640, 'webp'),
  };
}

function responsiveImageMarkup(image, alt, baseUrl, { className = '', loading = 'lazy', width = 640, height = 640, sizes = '(max-width: 430px) calc((100vw - 50px) / 2), 190px' } = {}) {
  const original = absoluteHttpUrl(image, baseUrl);
  if (!original) return '';
  const classAttribute = className ? ` class="${escapeHtml(className)}"` : '';
  const plan = ownedUploadVariantPlan(original, baseUrl);
  if (!plan) return `<img${classAttribute} src="${escapeHtml(original)}" alt="${escapeHtml(alt)}" loading="${escapeHtml(loading)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}">`;
  return `<picture>
        <source type="image/avif" srcset="${escapeHtml(plan.avif)}" sizes="${escapeHtml(sizes)}">
        <source type="image/webp" srcset="${escapeHtml(plan.webp)}" sizes="${escapeHtml(sizes)}">
        <img${classAttribute} src="${escapeHtml(plan.fallback)}" srcset="${escapeHtml(plan.webp)}" sizes="${escapeHtml(sizes)}" alt="${escapeHtml(alt)}" loading="${escapeHtml(loading)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}">
      </picture>`;
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
      ${image ? responsiveImageMarkup(image, product.name, baseUrl) : ''}
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
    '<link rel="describedby" type="text/plain" href="/llms.txt">',
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
  return async function loadShell() {
    const shellUrl = String(process.env.SEO_APP_SHELL_URL || '').trim();
    let shell;
    if (shellUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(shellUrl, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`SEO_APP_SHELL_HTTP_${response.status}`);
        shell = await response.text();
      } finally {
        clearTimeout(timer);
      }
    } else {
      const shellPath = process.env.SEO_APP_SHELL_PATH || path.join(__dirname, '..', '..', 'index.html');
      shell = await fs.readFile(shellPath, 'utf8');
    }
    return shell;
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

// A lightweight campaign document: do not delay the first HTML on catalog/DB reads.
// React replaces this content inside #root when the normal storefront mounts.
function mothersDayPage({ baseUrl }) {
  return {
    title: 'День матери — 29 ноября: букеты в Ижевске | FLOWIE',
    description: 'Букеты для мамы с доставкой по Ижевску 29 ноября. Выберите букет и оформите предзаказ в FLOWIE.',
    canonical: `${baseUrl}/mothers-day`,
    content: `<h1>День матери — 29 ноября</h1>
      <p>Букеты для мамы с доставкой по Ижевску 29 ноября.</p>
      <p>Выберите букет и оформите предзаказ в FLOWIE. Актуальные цены доступны в каталоге.</p>
      <p><a href="/catalog?occasion=mothers-day">Выбрать букет для мамы</a></p>`,
  };
}

function carePage({ products, baseUrl }) {
  const canonical = `${baseUrl}/care`;
  const description = 'Как ухаживать за розами, гортензиями, тюльпанами и другими цветами: сколько воды налить, когда обновить срез и как сохранить красоту букета.';
  const crumbs = [{ name: 'Главная', href: '/' }, { name: 'Уход за цветами' }];
  return {
    title: 'Как ухаживать за букетом и цветами | FLOWIE',
    description,
    canonical,
    image: productImages(products[0], baseUrl)[0],
    structuredData: [breadcrumbJsonLd(baseUrl, crumbs), {
      '@context': 'https://schema.org', '@type': 'Article', headline: 'Как ухаживать за букетом и цветами',
      description, mainEntityOfPage: canonical, author: { '@type': 'Organization', name: 'FLOWIE' },
    }],
    content: `${breadcrumbs(crumbs)}<article><h1>Как ухаживать за букетом и цветами</h1>
      <p>${escapeHtml(description)}</p>
      <h2>Базовый уход за срезанными цветами</h2>
      <ol><li>Вымойте вазу и удалите листья ниже линии воды.</li><li>Обновите срез чистым острым ножом или секатором.</li><li>Средство для цветов дозируйте только по инструкции на упаковке.</li><li>Держите букет вдали от батареи, прямого солнца, сквозняка и созревающих фруктов.</li></ol>
      <h2>Уход зависит от состава</h2><p>Гортензии и эустома требуют частого контроля уровня воды. Для роз обновляют 2–5 см стебля, для тюльпанов, гербер и хризантем — 2–3 см. Указание около 0,5 л относится к отдельному букету гербер, а не к смешанной композиции.</p>
      <p>Интерактивный гид позволяет выбрать цветок и рассчитать геометрический объём воды в цилиндрической вазе. Расчёт не является рекомендацией уровня.</p>
      <h2>Цветы из актуального каталога</h2><div class="seo-grid">${products.map((product) => productCard(product, baseUrl)).join('')}</div>
</article>`,
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
      <div>${images[0] ? responsiveImageMarkup(images[0], product.name, baseUrl, { className: 'seo-product-image', loading: 'eager', width: 800, height: 800, sizes: '(max-width: 430px) 100vw, 430px' }) : ''}</div>
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
  carePage,
  createShellLoader,
  escapeHtml,
  escapeXml,
  homePage,
  mothersDayPage,
  jsonLd,
  notFoundPage,
  plainText,
  productPage,
  responsiveImageMarkup,
  renderDocument,
};
