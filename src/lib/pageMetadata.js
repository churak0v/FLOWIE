const DEFAULT_TITLE = 'FLOWIE — доставка цветов в Ижевске';
const DEFAULT_DESCRIPTION = 'Свежие букеты и цветочные композиции FLOWIE с доставкой по Ижевску.';

function productByPath(pathname, products) {
  const match = String(pathname || '').match(/^\/product\/(\d+)$/);
  if (!match) return null;
  return (products || []).find((product) => String(product?.id) === match[1]) || null;
}

export function describePageMetadata({ pathname = '/', search = '', products = [], origin = '' } = {}) {
  const product = productByPath(pathname, products);
  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let canonicalPath = null;
  let robots = 'noindex,nofollow';

  if (pathname === '/') {
    canonicalPath = '/';
    robots = 'index,follow';
  } else if (pathname === '/catalog' || pathname === '/shop') {
    title = 'Каталог цветов с доставкой | FLOWIE';
    description = 'Каталог свежих букетов FLOWIE с доставкой по Ижевску.';
    canonicalPath = '/catalog';
    const params = new URLSearchParams(search);
    for (const key of ['collection', 'scenario']) {
      const value = String(params.get(key) || '').trim();
      if (value) {
        canonicalPath += `?${key}=${encodeURIComponent(value.slice(0, 100))}`;
        break;
      }
    }
    robots = 'index,follow';
  } else if (/^\/product\/\d+$/.test(pathname)) {
    title = product ? `${product.name} — купить с доставкой | FLOWIE` : 'Букет с доставкой | FLOWIE';
    description = product?.description
      ? String(product.description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260)
      : 'Свежий букет FLOWIE с доставкой по Ижевску.';
    canonicalPath = pathname;
    robots = 'index,follow';
  } else if (pathname === '/mothers-day') {
    title = 'День матери — букеты в Ижевске | FLOWIE';
    description = 'Букеты для мамы с доставкой по Ижевску. Выберите букет и оформите заказ в FLOWIE.';
    canonicalPath = '/mothers-day';
    robots = 'index,follow';
  } else if (pathname === '/cart') title = 'Корзина | FLOWIE';
  else if (pathname === '/checkout') title = 'Оформление заказа | FLOWIE';
  else if (pathname === '/favorites') title = 'Избранное | FLOWIE';
  else if (pathname === '/account') title = 'Аккаунт | FLOWIE';
  else if (pathname.startsWith('/legal/')) title = 'Правовая информация | FLOWIE';

  return {
    title,
    description,
    robots,
    canonical: canonicalPath && origin ? new URL(canonicalPath, origin).href : null,
  };
}

function ensureMeta(documentLike, name) {
  let element = documentLike.head.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = documentLike.createElement('meta');
    element.setAttribute('name', name);
    documentLike.head.appendChild(element);
  }
  return element;
}

export function updatePageMetadata(input, documentLike = globalThis.document) {
  if (!documentLike?.head) return null;
  const metadata = describePageMetadata(input);
  documentLike.title = metadata.title;
  ensureMeta(documentLike, 'description').setAttribute('content', metadata.description);
  ensureMeta(documentLike, 'robots').setAttribute('content', metadata.robots);
  const canonicalLinks = [...documentLike.head.querySelectorAll('link[rel="canonical"]')];
  const canonical = canonicalLinks.shift() || (metadata.canonical ? documentLike.createElement('link') : null);
  for (const duplicate of canonicalLinks) duplicate.remove();
  if (metadata.canonical && canonical) {
    canonical.setAttribute('rel', 'canonical');
    canonical.setAttribute('href', metadata.canonical);
    if (!canonical.parentNode) documentLike.head.appendChild(canonical);
  } else canonical?.remove();
  return metadata;
}

