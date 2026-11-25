export const ENGAGEMENT_SECONDS = new Set([5, 15, 30, 60]);
export const SCROLL_DEPTHS = new Set([25, 50, 75, 90]);

export const SECTION_KEYS = new Set([
  'hero', 'mothers_day', 'quick_picks', 'active_orders', 'frequently_ordered',
  'catalog_results', 'product_details', 'cart_items', 'checkout_form', 'payment_status',
  'gallery', 'summary', 'composition', 'dimensions', 'care', 'promotion',
  'motivation', 'similar', 'same_flowers', 'upsells',
]);

export const ENGAGEMENT_REASONS = new Set([
  'heartbeat', 'route_leave', 'pagehide', 'blur', 'hidden', 'unload',
]);

export const ELEMENT_KEYS = new Set([
  'hero_cta', 'mothers_day_cta', 'quick_pick', 'product_card', 'product_add',
  'mini_cart', 'nav_home', 'nav_catalog', 'nav_favorites', 'nav_recipients',
  'nav_account', 'cart_checkout', 'checkout_submit', 'payment_retry',
]);

export const PLACEMENT_KEYS = new Set([
  'home_hero', 'home_mothers_day', 'home_quick_picks', 'home_recommendations',
  'catalog_grid', 'catalog_list', 'product_recommendations', 'recipient_recommendations',
  'cart', 'checkout', 'payment', 'bottom_nav', 'floating',
]);

export function normalizeRouteKey(pathname = '/') {
  const path = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (/^\/product\/\d+\/?$/.test(path)) return '/product/:id';
  if (/^\/pay\/\d+\/?$/.test(path)) return '/pay/:id';
  if (/^\/recipients\/\d+\/?$/.test(path)) return '/recipients/:id';
  return (`/${path.replace(/^\/+|\/+$/g, '')}`).slice(0, 64) || '/';
}

export function allowedTaxonomyValue(set, value) {
  const normalized = String(value || '').trim();
  return set.has(normalized) ? normalized : '';
}
