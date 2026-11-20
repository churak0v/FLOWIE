const CLIENT_EVENTS = new Set([
  'page_view',
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
]);

const SERVER_EVENTS = new Set(['order_created', 'payment_success']);
const TOP_LEVEL_FIELDS = new Set(['event', 'eventId', 'sessionId', 'productId', 'orderId', 'meta']);
const COMMON_ATTRIBUTION_FIELDS = new Set(['path', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'referrerHost']);
const EVENT_META_FIELDS = {
  page_view: COMMON_ATTRIBUTION_FIELDS,
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
};

const PRODUCT_EVENTS = new Set(['product_view', 'favorite_add', 'favorite_remove', 'cart_add', 'cart_remove']);
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

function normalizePath(value) {
  const raw = boundedString(value, 2048, 'BAD_PATH');
  try {
    const parsed = new URL(raw, 'https://flowie.invalid');
    const path = parsed.pathname.replace(/\/{2,}/g, '/') || '/';
    const exact = new Set([
      '/', '/catalog', '/shop', '/cart', '/checkout', '/favorites', '/recipients', '/account',
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
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const item = url.searchParams.get(key);
      if (item) out[key] = redactDimension(item, 80, `BAD_${key.toUpperCase()}`);
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
  if (meta.resultCount != null) out.resultCount = boundedCount(meta.resultCount, 'BAD_RESULT_COUNT');
  if (meta.filter != null) out.filter = safeToken(meta.filter, 60, 'BAD_FILTER');
  if (meta.value != null) out.value = redactDimension(meta.value, 100, 'BAD_FILTER_VALUE');
  if (meta.quantity != null) out.quantity = boundedCount(meta.quantity, 'BAD_QUANTITY', 99);
  if (meta.errorCode != null) {
    const code = boundedString(meta.errorCode, 80, 'BAD_ERROR_CODE');
    if (!SAFE_CODE_RE.test(code)) throw new AnalyticsValidationError('BAD_ERROR_CODE');
    out.errorCode = code;
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    if (meta[key] != null) out[key] = redactDimension(meta[key], 80, `BAD_${key.toUpperCase()}`);
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
  if (!ID_RE.test(eventId)) throw new AnalyticsValidationError('BAD_EVENT_ID');
  if (!ID_RE.test(sessionId)) throw new AnalyticsValidationError('BAD_SESSION_ID');

  const productId = body.productId == null ? null : positiveInteger(body.productId, 'BAD_PRODUCT_ID');
  const orderId = body.orderId == null ? null : positiveInteger(body.orderId, 'BAD_ORDER_ID');
  if (PRODUCT_EVENTS.has(event) && productId == null) throw new AnalyticsValidationError('PRODUCT_ID_REQUIRED');

  return {
    event,
    eventId,
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

async function recordServerEventSafe(prisma, { event, userId = null, orderId = null, productId = null }) {
  if (!SERVER_EVENTS.has(event)) return { recorded: false, error: 'EVENT_NOT_ALLOWED' };
  if (!prisma?.analyticsEvent?.create) return { recorded: false, error: 'ANALYTICS_UNAVAILABLE' };
  const entityId = orderId || productId;
  if (!Number.isSafeInteger(Number(entityId)) || Number(entityId) <= 0) return { recorded: false, error: 'ENTITY_ID_REQUIRED' };
  const eventId = `server:${event}:${Number(entityId)}`;
  try {
    await prisma.analyticsEvent.create({
      data: {
        userId: Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null,
        event,
        eventId,
        orderId: orderId == null ? null : Number(orderId),
        productId: productId == null ? null : Number(productId),
        meta: { source: 'server' },
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
