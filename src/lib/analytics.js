import { sendYandexMetricaEvent } from './yandexMetrica.js';
import { sendVkPixelEvent } from './vkPixel.js';
import { ELEMENT_KEYS, ENGAGEMENT_REASONS, ENGAGEMENT_SECONDS, PLACEMENT_KEYS, SCROLL_DEPTHS, SECTION_KEYS, allowedTaxonomyValue, normalizeRouteKey } from './analyticsTaxonomy.js';

const API_BASE = import.meta.env?.VITE_API_URL || '/api';

export const ANALYTICS_OPT_OUT_KEY = 'flowie_analytics_opt_out';
export const ANALYTICS_SESSION_KEY = 'flowie_analytics_session_id';
export const ANALYTICS_ATTRIBUTION_KEY = 'flowie_analytics_attribution';
export const ANALYTICS_PURCHASE_KEY_PREFIX = 'flowie_analytics_purchase_';

const ALLOWED_EVENTS = new Set([
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
  'engagement_milestone',
  'page_engagement',
  'section_engagement',
  'scroll_depth',
  'section_view',
  'element_click',
  'banner_view',
  'banner_click',
  'product_card_view',
  'product_card_click',
  'gift_picker_view',
  'gift_picker_photo_selected',
  'gift_picker_photo_processed',
  'gift_picker_manual_started',
  'gift_picker_results_view',
  'gift_picker_product_open',
  'gift_picker_cart_add',
  'gift_picker_reset',
  'gift_picker_error',
]);

const META_LIMITS = {
  path: 180,
  query: 120,
  filter: 60,
  value: 100,
  errorCode: 80,
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 80,
  utm_content: 80,
  utm_term: 80,
  yclid: 256,
  mt_click_id: 256,
  referrerHost: 255,
  bannerId: 32,
  sectionKey: 48,
  elementKey: 48,
  placementKey: 48,
  routeKey: 64,
  deviceClass: 12,
  source: 16,
  styleCode: 16,
  tierCoverage: 8,
};

const ATTRIBUTION_KEYS = ['path', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'mt_click_id', 'referrerHost'];
const EVENT_META_KEYS = {
  page_view: new Set(ATTRIBUTION_KEYS),
  home_banner_click: new Set([...ATTRIBUTION_KEYS, 'bannerId']),
  product_view: new Set(ATTRIBUTION_KEYS),
  search: new Set([...ATTRIBUTION_KEYS, 'query', 'resultCount']),
  filter_change: new Set([...ATTRIBUTION_KEYS, 'filter', 'value']),
  favorite_add: new Set(ATTRIBUTION_KEYS),
  favorite_remove: new Set(ATTRIBUTION_KEYS),
  cart_add: new Set([...ATTRIBUTION_KEYS, 'quantity']),
  cart_remove: new Set([...ATTRIBUTION_KEYS, 'quantity']),
  checkout_start: new Set(ATTRIBUTION_KEYS),
  checkout_error: new Set([...ATTRIBUTION_KEYS, 'errorCode']),
  payment_start: new Set(ATTRIBUTION_KEYS),
  engagement_milestone: new Set([...ATTRIBUTION_KEYS, 'seconds', 'routeKey', 'deviceClass']),
  page_engagement: new Set([...ATTRIBUTION_KEYS, 'activeMs', 'reason', 'routeKey', 'deviceClass']),
  section_engagement: new Set([...ATTRIBUTION_KEYS, 'activeMs', 'reason', 'sectionKey', 'routeKey', 'deviceClass']),
  scroll_depth: new Set([...ATTRIBUTION_KEYS, 'percent', 'routeKey', 'deviceClass']),
  section_view: new Set([...ATTRIBUTION_KEYS, 'sectionKey', 'routeKey', 'deviceClass']),
  element_click: new Set([...ATTRIBUTION_KEYS, 'elementKey', 'placementKey', 'routeKey', 'deviceClass']),
  banner_view: new Set([...ATTRIBUTION_KEYS, 'bannerId', 'placementKey', 'position', 'routeKey', 'deviceClass']),
  banner_click: new Set([...ATTRIBUTION_KEYS, 'bannerId', 'placementKey', 'position', 'routeKey', 'deviceClass']),
  product_card_view: new Set([...ATTRIBUTION_KEYS, 'placementKey', 'position', 'routeKey', 'deviceClass']),
  product_card_click: new Set([...ATTRIBUTION_KEYS, 'placementKey', 'position', 'routeKey', 'deviceClass']),
  gift_picker_view: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_photo_selected: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_photo_processed: new Set([...ATTRIBUTION_KEYS, 'source', 'styleCode']),
  gift_picker_manual_started: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_results_view: new Set([...ATTRIBUTION_KEYS, 'source', 'styleCode', 'resultCount', 'tierCoverage']),
  gift_picker_product_open: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_cart_add: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_reset: new Set([...ATTRIBUTION_KEYS, 'source']),
  gift_picker_error: new Set([...ATTRIBUTION_KEYS, 'source', 'errorCode']),
};

const MAX_QUEUE_SIZE = 40;
const MAX_ATTEMPTS = 3;
const VIEW_DEDUPE_MS = 2_000;
const queue = [];
const recentViews = new Map();
let flushTimer = null;
let flushing = false;
let bootstrapReady = false;
let memorySessionId = '';
let currentPageViewId = '';
let currentRouteKey = '/';
const recordedPurchases = new Set();

function safeStorage(storageName) {
  try {
    return globalThis[storageName] || null;
  } catch {
    return null;
  }
}

function boundedString(value, limit) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, limit);
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(99_999, Math.round(number)));
}

function entityId(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return undefined;
  return number;
}

function privacySafeQuery(value) {
  return boundedString(value, META_LIMITS.query)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]*){7,}/g, '[phone] ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createAnalyticsUuid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAnalyticsSessionId() {
  if (memorySessionId) return memorySessionId;
  const storage = safeStorage('sessionStorage');
  try {
    const existing = storage?.getItem(ANALYTICS_SESSION_KEY);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing || '')) {
      memorySessionId = existing;
      return memorySessionId;
    }
    const sessionId = createAnalyticsUuid();
    storage?.setItem(ANALYTICS_SESSION_KEY, sessionId);
    memorySessionId = sessionId;
    return memorySessionId;
  } catch {
    memorySessionId = createAnalyticsUuid();
    return memorySessionId;
  }
}

export function beginAnalyticsPageView(pathname = globalThis.location?.pathname || '/') {
  currentPageViewId = createAnalyticsUuid();
  currentRouteKey = normalizeRouteKey(pathname);
  return { pageViewId: currentPageViewId, routeKey: currentRouteKey };
}

export function getAnalyticsContext() {
  if (!currentPageViewId) beginAnalyticsPageView();
  return { sessionId: getAnalyticsSessionId(), pageViewId: currentPageViewId, routeKey: currentRouteKey };
}

export function getAnalyticsOrderContext() {
  const context = getAnalyticsContext();
  return { sessionId: context.sessionId, attribution: extractAnalyticsAttribution() };
}

export function isDoNotTrackEnabled() {
  try {
    return globalThis.navigator?.doNotTrack === '1'
      || globalThis.navigator?.globalPrivacyControl === true
      || globalThis.doNotTrack === '1';
  } catch {
    return false;
  }
}

export function isAnalyticsOptedOut() {
  try {
    return /^(1|true|yes)$/i.test(safeStorage('localStorage')?.getItem(ANALYTICS_OPT_OUT_KEY) || '');
  } catch {
    return false;
  }
}

export function isAnalyticsEnabled() {
  return !isAnalyticsOptedOut() && !isDoNotTrackEnabled();
}

export function setAnalyticsOptOut(optedOut) {
  try {
    const storage = safeStorage('localStorage');
    if (optedOut) storage?.setItem(ANALYTICS_OPT_OUT_KEY, '1');
    else storage?.removeItem(ANALYTICS_OPT_OUT_KEY);
  } catch {
    // Storage can be unavailable in restricted webviews.
  }
  if (optedOut || isDoNotTrackEnabled()) clearAnalyticsQueue();
}

export function sanitizeAnalyticsPayload(event, input = {}) {
  if (!ALLOWED_EVENTS.has(event)) return null;
  const payload = {
    event,
    eventId: createAnalyticsUuid(),
    sessionId: getAnalyticsSessionId(),
    pageViewId: boundedString(input.pageViewId || currentPageViewId, 96) || undefined,
    routeKey: normalizeRouteKey(input.routeKey || currentRouteKey),
  };

  const productId = entityId(input.productId);
  const orderId = entityId(input.orderId);
  if (productId !== undefined) payload.productId = productId;
  if (orderId !== undefined) payload.orderId = orderId;

  const rawMeta = input.meta && typeof input.meta === 'object' ? input.meta : {};
  const meta = {};
  const allowedMeta = EVENT_META_KEYS[event];
  for (const [key, limit] of Object.entries(META_LIMITS)) {
    if (!allowedMeta.has(key)) continue;
    let value = key === 'query' ? privacySafeQuery(rawMeta[key]) : boundedString(rawMeta[key], limit);
    if (!value) continue;
    if (key === 'path') {
      value = value.split(/[?#]/, 1)[0] || '/';
      meta[key] = value.startsWith('/') ? value : `/${value}`;
    } else if (key === 'sectionKey') {
      value = allowedTaxonomyValue(SECTION_KEYS, value);
      if (value) meta[key] = value;
    } else if (key === 'elementKey') {
      value = allowedTaxonomyValue(ELEMENT_KEYS, value);
      if (value) meta[key] = value;
    } else if (key === 'placementKey') {
      value = allowedTaxonomyValue(PLACEMENT_KEYS, value);
      if (value) meta[key] = value;
    } else if (key === 'routeKey') {
      meta[key] = normalizeRouteKey(value);
    } else if (key === 'deviceClass') {
      if (['mobile', 'tablet', 'desktop'].includes(value)) meta[key] = value;
    } else if (key === 'filter' || key === 'errorCode') {
      const token = value.replace(/[^A-Za-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
      if (token) meta[key] = token;
    } else meta[key] = value;
  }
  for (const key of ['resultCount', 'quantity']) {
    if (!allowedMeta.has(key)) continue;
    let value = positiveInteger(rawMeta[key]);
    if (key === 'quantity' && value !== undefined) value = Math.min(99, value);
    if (value !== undefined) meta[key] = value;
  }
  if (['page_engagement', 'section_engagement'].includes(event)) {
    const activeMs = Number(rawMeta.activeMs);
    if (Number.isSafeInteger(activeMs) && activeMs >= 0 && activeMs <= 604_800_000) meta.activeMs = activeMs;
    const reason = allowedTaxonomyValue(ENGAGEMENT_REASONS, rawMeta.reason);
    if (reason) meta.reason = reason;
    if (meta.activeMs === undefined || !meta.reason) return null;
    if (event === 'section_engagement' && !meta.sectionKey) return null;
  }
  if (event === 'engagement_milestone' && ENGAGEMENT_SECONDS.has(Number(rawMeta.seconds))) meta.seconds = Number(rawMeta.seconds);
  if (event === 'scroll_depth' && SCROLL_DEPTHS.has(Number(rawMeta.percent))) meta.percent = Number(rawMeta.percent);
  if (['banner_view', 'banner_click', 'product_card_view', 'product_card_click'].includes(event)) {
    const position = positiveInteger(rawMeta.position);
    if (position !== undefined && position <= 200) meta.position = position;
  }
  if (Object.keys(meta).length) payload.meta = meta;
  return payload;
}

export function extractAnalyticsAttribution(locationLike = globalThis.location, referrer = globalThis.document?.referrer) {
  const storage = safeStorage('sessionStorage');
  let stored = {};
  try {
    stored = JSON.parse(storage?.getItem(ANALYTICS_ATTRIBUTION_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  } catch {
    stored = {};
  }
  const meta = { ...stored };
  const campaign = {};
  try {
    const params = new URLSearchParams(locationLike?.search || '');
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'mt_click_id']) {
      const value = boundedString(params.get(key) || '', META_LIMITS[key]);
      if (value) campaign[key] = value;
    }
    if (!campaign.mt_click_id) {
      const legacyVkClick = boundedString(params.get('vk_click_id') || '', META_LIMITS.mt_click_id);
      if (legacyVkClick) campaign.mt_click_id = legacyVkClick;
    }
    if (Object.keys(campaign).length) {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'mt_click_id']) delete meta[key];
      Object.assign(meta, campaign);
    }
  } catch {
    // Ignore malformed URLs.
  }
  try {
    const host = boundedString(new URL(referrer).hostname, META_LIMITS.referrerHost);
    const currentHost = boundedString(locationLike?.hostname || '', META_LIMITS.referrerHost);
    if (host && host !== currentHost) meta.referrerHost = host;
  } catch {
    // Referrer may be absent or invalid.
  }
  if (Object.keys(campaign).length) {
    try {
      storage?.setItem(ANALYTICS_ATTRIBUTION_KEY, JSON.stringify(meta));
    } catch {
      // Storage can be unavailable in restricted webviews.
    }
  }
  return meta;
}

function scheduleFlush(delay = bootstrapReady ? 0 : 1_500) {
  if (flushTimer || !queue.length || !isAnalyticsEnabled()) return;
  flushTimer = globalThis.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, delay);
}

export function clearAnalyticsQueue() {
  queue.length = 0;
  recentViews.clear();
  if (flushTimer) globalThis.clearTimeout(flushTimer);
  flushTimer = null;
}

export function trackAnalytics(event, input = {}, options = {}) {
  if (!isAnalyticsEnabled()) return false;
  const payload = sanitizeAnalyticsPayload(event, {
    ...input,
    meta: {
      ...extractAnalyticsAttribution(),
      routeKey: currentRouteKey,
      deviceClass: globalThis.innerWidth < 640 ? 'mobile' : globalThis.innerWidth < 1024 ? 'tablet' : 'desktop',
      ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
    },
  });
  if (!payload) return false;

  if (options.dedupeKey) {
    const key = `${event}:${boundedString(options.dedupeKey, 260)}`;
    const now = Date.now();
    const previous = recentViews.get(key) || 0;
    if (now - previous < VIEW_DEDUPE_MS) return false;
    recentViews.set(key, now);
  }

  if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
  queue.push({ payload, attempts: 0 });
  if (!options.firstPartyOnly) {
    sendYandexMetricaEvent(event, payload);
    sendVkPixelEvent(event, payload);
  }
  scheduleFlush();
  return true;
}

export function trackConfirmedPurchase({ orderId, revenue, paymentStatus } = {}) {
  if (!isAnalyticsEnabled() || String(paymentStatus || '').toUpperCase() !== 'CONFIRMED') return false;
  const safeOrderId = entityId(orderId);
  if (safeOrderId === undefined) return false;
  const storageKey = `${ANALYTICS_PURCHASE_KEY_PREFIX}${safeOrderId}`;
  if (recordedPurchases.has(storageKey)) return false;
  try {
    if (safeStorage('localStorage')?.getItem(storageKey) === '1') return false;
  } catch {
    // Keep in-memory deduplication when persistent storage is unavailable.
  }

  const payload = { orderId: safeOrderId, meta: extractAnalyticsAttribution() };
  const safeRevenue = Number(revenue);
  if (Number.isFinite(safeRevenue)) payload.revenue = Math.max(0, safeRevenue);
  sendYandexMetricaEvent('purchase', payload);
  sendVkPixelEvent('purchase', payload);
  recordedPurchases.add(storageKey);
  try {
    safeStorage('localStorage')?.setItem(storageKey, '1');
  } catch {
    // The event is still deduplicated for the current page lifecycle.
  }
  return true;
}

export async function flushAnalytics() {
  if (flushing || !queue.length || !isAnalyticsEnabled() || typeof globalThis.fetch !== 'function') return;
  flushing = true;
  try {
    while (queue.length && isAnalyticsEnabled()) {
      const item = queue[0];
      let response;
      try {
        response = await globalThis.fetch(`${API_BASE}/events`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
      } catch {
        item.attempts += 1;
        if (item.attempts >= MAX_ATTEMPTS) queue.shift();
        break;
      }

      if (response.ok) {
        queue.shift();
        continue;
      }
      item.attempts += 1;
      if (![401, 403, 408, 429].includes(response.status) && response.status < 500) queue.shift();
      else if (item.attempts >= MAX_ATTEMPTS) queue.shift();
      break;
    }
  } finally {
    flushing = false;
    if (queue.length) scheduleFlush(5_000);
  }
}

export function markAnalyticsReady() {
  bootstrapReady = true;
  scheduleFlush(0);
}

export function getAnalyticsDebugState() {
  return { queued: queue.length, enabled: isAnalyticsEnabled(), bootstrapReady };
}
