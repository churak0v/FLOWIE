const CLIENT_EVENTS = new Set([
  'page_view',
  'home_banner_click',
  'product_view',
  'search',
  'filter_change',
  'favorite_add',
  'favorite_remove',
  'cart_add',
  'cart_remove',
  'checkout_start',
  'checkout_error',
  'payment_start',
  'ref_open',
  'write_access_requested',
  'engagement_milestone',
  'scroll_depth',
  'section_view',
  'element_click',
  'banner_view',
  'banner_click',
  'product_card_view',
  'product_card_click',
]);

const SERVER_EVENTS = new Set(['order_created', 'payment_success']);
const TOP_LEVEL_FIELDS = new Set(['event', 'eventId', 'sessionId', 'pageViewId', 'routeKey', 'productId', 'orderId', 'meta']);
const crypto = require('crypto');
const COMMON_ATTRIBUTION_FIELDS = new Set(['path', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'mt_click_id', 'referrerHost']);
const EVENT_META_FIELDS = {
  page_view: COMMON_ATTRIBUTION_FIELDS,
  home_banner_click: new Set([...COMMON_ATTRIBUTION_FIELDS, 'bannerId']),
  product_view: COMMON_ATTRIBUTION_FIELDS,
  search: new Set([...COMMON_ATTRIBUTION_FIELDS, 'query', 'resultCount']),
  filter_change: new Set([...COMMON_ATTRIBUTION_FIELDS, 'filter', 'value']),
  favorite_add: new Set([...COMMON_ATTRIBUTION_FIELDS]),
  favorite_remove: new Set([...COMMON_ATTRIBUTION_FIELDS]),
  cart_add: new Set([...COMMON_ATTRIBUTION_FIELDS, 'quantity']),
  cart_remove: new Set([...COMMON_ATTRIBUTION_FIELDS, 'quantity']),
  checkout_start: new Set([...COMMON_ATTRIBUTION_FIELDS]),
  checkout_error: new Set([...COMMON_ATTRIBUTION_FIELDS, 'errorCode']),
  payment_start: new Set([...COMMON_ATTRIBUTION_FIELDS]),
  ref_open: new Set([...COMMON_ATTRIBUTION_FIELDS, 'tag', 'source', 'href']),
  write_access_requested: new Set(['tag', 'source', 'status', 'alreadyAllowed']),
  engagement_milestone: new Set([...COMMON_ATTRIBUTION_FIELDS, 'seconds', 'routeKey', 'deviceClass']),
  scroll_depth: new Set([...COMMON_ATTRIBUTION_FIELDS, 'percent', 'routeKey', 'deviceClass']),
  section_view: new Set([...COMMON_ATTRIBUTION_FIELDS, 'sectionKey', 'routeKey', 'deviceClass']),
  element_click: new Set([...COMMON_ATTRIBUTION_FIELDS, 'elementKey', 'placementKey', 'routeKey', 'deviceClass']),
  banner_view: new Set([...COMMON_ATTRIBUTION_FIELDS, 'bannerId', 'placementKey', 'position', 'routeKey', 'deviceClass']),
  banner_click: new Set([...COMMON_ATTRIBUTION_FIELDS, 'bannerId', 'placementKey', 'position', 'routeKey', 'deviceClass']),
  product_card_view: new Set([...COMMON_ATTRIBUTION_FIELDS, 'placementKey', 'position', 'routeKey', 'deviceClass']),
  product_card_click: new Set([...COMMON_ATTRIBUTION_FIELDS, 'placementKey', 'position', 'routeKey', 'deviceClass']),
};

const PRODUCT_EVENTS = new Set(['product_view', 'favorite_add', 'favorite_remove', 'cart_add', 'cart_remove', 'product_card_view', 'product_card_click']);
const SECTION_KEYS = new Set(['hero', 'mothers_day', 'quick_picks', 'active_orders', 'frequently_ordered', 'catalog_results', 'product_details', 'cart_items', 'checkout_form', 'payment_status']);
const ELEMENT_KEYS = new Set(['hero_cta', 'mothers_day_cta', 'quick_pick', 'product_card', 'product_add', 'mini_cart', 'nav_home', 'nav_catalog', 'nav_favorites', 'nav_recipients', 'nav_account', 'cart_checkout', 'checkout_submit', 'payment_retry']);
const PLACEMENT_KEYS = new Set(['home_hero', 'home_mothers_day', 'home_quick_picks', 'home_recommendations', 'catalog_grid', 'catalog_list', 'product_recommendations', 'recipient_recommendations', 'cart', 'checkout', 'payment', 'bottom_nav', 'floating']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,95}$/;
const SAFE_CODE_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

class AnalyticsValidationError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function boundedString(value, max, code, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new AnalyticsValidationError(code);
  const normalized = [...value.trim()].map((character) => {
    const point = character.codePointAt(0);
    return point <= 31 || point === 127 ? ' ' : character;
  }).join('');
  if ((!allowEmpty && !normalized) || normalized.length > max) throw new AnalyticsValidationError(code);
  return normalized;
}

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new AnalyticsValidationError(code);
  return number;
}

function boundedCount(value, code, max = 1_000_000) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new AnalyticsValidationError(code);
  return number;
}

function redactSearchQuery(value) {
  const query = boundedString(value, 200, 'BAD_QUERY', { allowEmpty: true })
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]*){7,}/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim();
  return query.slice(0, 120);
}

function redactDimension(value, max, code) {
  return boundedString(value, Math.max(max, 200), code, { allowEmpty: true })
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]*){7,}/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function redactAttributionDimension(key, value, source) {
  const normalized = boundedString(value, 200, `BAD_${key.toUpperCase()}`, { allowEmpty: true });
  const isVkNumericId = (key === 'utm_campaign' || key === 'utm_content')
    && String(source || '').trim().toLowerCase() === 'vk_ads'
    && /^\d{1,10}$/.test(normalized);
  if (isVkNumericId) return normalized.slice(0, 80);
  return redactDimension(normalized, 80, `BAD_${key.toUpperCase()}`);
}

function normalizePath(value) {
  const raw = boundedString(value, 2048, 'BAD_PATH');
  try {
    const parsed = new URL(raw, 'https://flowie.invalid');
    const path = parsed.pathname.replace(/\/{2,}/g, '/') || '/';
    const exact = new Set([
      '/', '/catalog', '/shop', '/cart', '/checkout', '/favorites', '/recipients', '/account', '/mothers-day',
      '/legal/privacy', '/legal/consent', '/legal/offer', '/success',
    ]);
    if (exact.has(path)) return path;
    if (/^\/product\/\d+$/.test(path)) return '/product/:id';
    if (/^\/recipients\/\d+$/.test(path)) return '/recipients/:id';
    if (/^\/pay\/\d+$/.test(path)) return '/pay/:id';
    return '/other';
  } catch {
    throw new AnalyticsValidationError('BAD_PATH');
  }
}

function normalizeHost(value) {
  const raw = boundedString(value, 255, 'BAD_REFERRER_HOST').toLowerCase();
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.slice(0, 255);
  } catch {
    throw new AnalyticsValidationError('BAD_REFERRER_HOST');
  }
}

function safeToken(value, max, code) {
  const token = boundedString(value, max, code);
  if (!/^[A-Za-z0-9_.:-]+$/.test(token)) throw new AnalyticsValidationError(code);
  return token;
}

function fixedToken(value, allowed, code) {
  const token = safeToken(value, 64, code);
  if (!allowed.has(token)) throw new AnalyticsValidationError(code);
  return token;
}

function referralTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

function attributionFromHref(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const url = new URL(value);
    const out = { path: normalizePath(url.pathname) };
    const source = url.searchParams.get('utm_source');
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const item = url.searchParams.get(key);
      if (item) out[key] = redactAttributionDimension(key, item, source);
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeMeta(event, input, sessionId) {
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) {
    throw new AnalyticsValidationError('BAD_META');
  }
  const meta = input || {};
  const allowed = EVENT_META_FIELDS[event];
  for (const key of Object.keys(meta)) {
    if (!allowed.has(key)) throw new AnalyticsValidationError('UNKNOWN_META_FIELD');
  }

  const out = { sessionId };
  if (meta.href != null) Object.assign(out, attributionFromHref(meta.href));
  if (meta.path != null) out.path = normalizePath(meta.path);
  if (meta.query != null) out.query = redactSearchQuery(meta.query);
  if (meta.bannerId != null) out.bannerId = safeToken(meta.bannerId, 32, 'BAD_BANNER_ID');
  if (meta.sectionKey != null) out.sectionKey = fixedToken(meta.sectionKey, SECTION_KEYS, 'BAD_SECTION_KEY');
  if (meta.elementKey != null) out.elementKey = fixedToken(meta.elementKey, ELEMENT_KEYS, 'BAD_ELEMENT_KEY');
  if (meta.placementKey != null) out.placementKey = fixedToken(meta.placementKey, PLACEMENT_KEYS, 'BAD_PLACEMENT_KEY');
  if (meta.routeKey != null) out.routeKey = normalizePath(meta.routeKey);
  if (meta.deviceClass != null) out.deviceClass = fixedToken(meta.deviceClass, new Set(['mobile', 'tablet', 'desktop']), 'BAD_DEVICE_CLASS');
  if (meta.seconds != null) {
    const seconds = boundedCount(meta.seconds, 'BAD_ENGAGEMENT_SECONDS', 60);
    if (![5, 15, 30, 60].includes(seconds)) throw new AnalyticsValidationError('BAD_ENGAGEMENT_SECONDS');
    out.seconds = seconds;
  }
  if (meta.percent != null) {
    const percent = boundedCount(meta.percent, 'BAD_SCROLL_DEPTH', 90);
    if (![25, 50, 75, 90].includes(percent)) throw new AnalyticsValidationError('BAD_SCROLL_DEPTH');
    out.percent = percent;
  }
  if (meta.position != null) out.position = boundedCount(meta.position, 'BAD_POSITION', 200);
  if (meta.resultCount != null) out.resultCount = boundedCount(meta.resultCount, 'BAD_RESULT_COUNT');
  if (meta.filter != null) out.filter = safeToken(meta.filter, 60, 'BAD_FILTER');
  if (meta.value != null) out.value = redactDimension(meta.value, 100, 'BAD_FILTER_VALUE');
  if (meta.quantity != null) out.quantity = boundedCount(meta.quantity, 'BAD_QUANTITY', 99);
  if (meta.errorCode != null) {
    const code = boundedString(meta.errorCode, 80, 'BAD_ERROR_CODE');
    if (!SAFE_CODE_RE.test(code)) throw new AnalyticsValidationError('BAD_ERROR_CODE');
    out.errorCode = code;
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (meta[key] != null) out[key] = redactAttributionDimension(key, meta[key], meta.utm_source);
  }
  for (const key of ['yclid', 'mt_click_id']) {
    if (meta[key] == null) continue;
    const clickId = boundedString(meta[key], 256, `BAD_${key.toUpperCase()}`);
    if (!/^[A-Za-z0-9._:-]+$/.test(clickId)) throw new AnalyticsValidationError(`BAD_${key.toUpperCase()}`);
    out[`${key}Hash`] = crypto.createHash('sha256').update(`${key}:${clickId}`).digest('hex');
  }
  if (meta.referrerHost != null) out.referrerHost = normalizeHost(meta.referrerHost);

  if (event === 'ref_open' || event === 'write_access_requested') {
    const tag = referralTag(meta.tag);
    if (tag) out.tag = tag;
    if (meta.source != null) out.referralSource = safeToken(meta.source, 80, 'BAD_REFERRAL_SOURCE');
  }
  if (event === 'write_access_requested') {
    if (meta.status != null) out.status = safeToken(meta.status, 24, 'BAD_STATUS');
    if (meta.alreadyAllowed != null) {
      if (typeof meta.alreadyAllowed !== 'boolean') throw new AnalyticsValidationError('BAD_ALREADY_ALLOWED');
      out.alreadyAllowed = meta.alreadyAllowed;
    }
  }
  return out;
}

function normalizeClientEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AnalyticsValidationError('BAD_EVENT_PAYLOAD');
  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_FIELDS.has(key)) throw new AnalyticsValidationError('UNKNOWN_EVENT_FIELD');
  }

  const event = boundedString(body.event, 40, 'NO_EVENT');
  if (!CLIENT_EVENTS.has(event)) throw new AnalyticsValidationError('EVENT_NOT_ALLOWED');
  const eventId = boundedString(body.eventId, 96, 'BAD_EVENT_ID');
  const sessionId = boundedString(body.sessionId, 96, 'BAD_SESSION_ID');
  const pageViewId = body.pageViewId == null ? null : boundedString(body.pageViewId, 96, 'BAD_PAGE_VIEW_ID');
  if (!ID_RE.test(eventId)) throw new AnalyticsValidationError('BAD_EVENT_ID');
  if (!ID_RE.test(sessionId)) throw new AnalyticsValidationError('BAD_SESSION_ID');
  if (pageViewId != null && !ID_RE.test(pageViewId)) throw new AnalyticsValidationError('BAD_PAGE_VIEW_ID');
  const routeKey = body.routeKey == null ? null : normalizePath(body.routeKey);

  const productId = body.productId == null ? null : positiveInteger(body.productId, 'BAD_PRODUCT_ID');
  const orderId = body.orderId == null ? null : positiveInteger(body.orderId, 'BAD_ORDER_ID');
  if (PRODUCT_EVENTS.has(event) && productId == null) throw new AnalyticsValidationError('PRODUCT_ID_REQUIRED');

  return {
    event,
    eventId,
    sessionId,
    pageViewId,
    routeKey,
    productId,
    orderId,
    meta: normalizeMeta(event, body.meta, sessionId),
  };
}

function createRateLimiter({ max = 120, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    consume(key) {
      const current = now();
      const bucketKey = String(key || 'anonymous').slice(0, 220);
      if (buckets.size >= 10_000 && !buckets.has(bucketKey)) {
        for (const [storedKey, bucket] of buckets) {
          if (current - bucket.startedAt >= windowMs) buckets.delete(storedKey);
        }
        if (buckets.size >= 10_000) buckets.delete(buckets.keys().next().value);
      }
      const existing = buckets.get(bucketKey);
      if (!existing || current - existing.startedAt >= windowMs) {
        buckets.set(bucketKey, { startedAt: current, count: 1 });
        return { allowed: true, retryAfter: 0 };
      }
      existing.count += 1;
      if (existing.count <= max) return { allowed: true, retryAfter: 0 };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowMs - (current - existing.startedAt)) / 1000)) };
    },
    clear() {
      buckets.clear();
    },
  };
}

async function recordServerEventSafe(prisma, { event, userId = null, orderId = null, productId = null, sessionId = null, attribution = null }) {
  if (!SERVER_EVENTS.has(event)) return { recorded: false, error: 'EVENT_NOT_ALLOWED' };
  if (!prisma?.analyticsEvent?.create) return { recorded: false, error: 'ANALYTICS_UNAVAILABLE' };
  const entityId = orderId || productId;
  if (!Number.isSafeInteger(Number(entityId)) || Number(entityId) <= 0) return { recorded: false, error: 'ENTITY_ID_REQUIRED' };
  const eventId = `server:${event}:${Number(entityId)}`;
  try {
    let resolvedSessionId = sessionId;
    let resolvedAttribution = attribution;
    if (orderId && !resolvedSessionId && typeof prisma.order?.findUnique === 'function') {
      const order = await prisma.order.findUnique({
        where: { id: Number(orderId) },
        select: { analyticsSessionId: true, analyticsAttribution: true },
      });
      resolvedSessionId = order?.analyticsSessionId || null;
      resolvedAttribution = order?.analyticsAttribution || null;
    }
    const safeSession = typeof resolvedSessionId === 'string' && ID_RE.test(resolvedSessionId) ? resolvedSessionId : null;
    const safeAttribution = resolvedAttribution && typeof resolvedAttribution === 'object' && !Array.isArray(resolvedAttribution) ? resolvedAttribution : {};
    await prisma.analyticsEvent.create({
      data: {
        userId: Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null,
        event,
        eventId,
        schemaVersion: 2,
        sessionId: safeSession,
        orderId: orderId == null ? null : Number(orderId),
        productId: productId == null ? null : Number(productId),
        meta: { source: 'server', ...(safeSession ? { sessionId: safeSession } : {}), ...safeAttribution },
      },
    });
    return { recorded: true, duplicate: false };
  } catch (error) {
    if (error?.code === 'P2002') return { recorded: true, duplicate: true };
    console.warn('Analytics server event failed:', event);
    return { recorded: false, error: 'ANALYTICS_WRITE_FAILED' };
  }
}

module.exports = {
  AnalyticsValidationError,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  createRateLimiter,
  normalizeClientEvent,
  redactSearchQuery,
  recordServerEventSafe,
};
