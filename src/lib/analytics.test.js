import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ANALYTICS_OPT_OUT_KEY,
  ANALYTICS_PURCHASE_KEY_PREFIX,
  clearAnalyticsQueue,
  createAnalyticsUuid,
  extractAnalyticsAttribution,
  getAnalyticsDebugState,
  getAnalyticsSessionId,
  isAnalyticsEnabled,
  sanitizeAnalyticsPayload,
  setAnalyticsOptOut,
  trackAnalytics,
  trackConfirmedPurchase,
} from './analytics.js';

const require = createRequire(import.meta.url);
const { normalizeClientEvent } = require('../../server/services/analytics');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

test('creates UUID event and stable UUID session identifiers', () => {
  const restoreSession = replaceGlobal('sessionStorage', memoryStorage());
  try {
    assert.match(createAnalyticsUuid(), /^[0-9a-f-]{36}$/i);
    const first = getAnalyticsSessionId();
    assert.equal(getAnalyticsSessionId(), first);
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  } finally {
    restoreSession();
  }
});

test('keeps only event-specific fields and produces a server-valid payload', () => {
  const payload = sanitizeAnalyticsPayload('filter_change', {
    productId: 42,
    meta: {
      filter: 'occasion / private',
      value: 'birthday',
      resultCount: 10,
      phone: '+7 999 000-00-00',
      path: '/catalog?phone=secret#fragment',
    },
  });

  assert.deepEqual(payload.meta, {
    path: '/catalog',
    filter: 'occasion_private',
    value: 'birthday',
  });
  assert.equal(payload.productId, 42);
  assert.doesNotThrow(() => normalizeClientEvent(payload));
  assert.equal(sanitizeAnalyticsPayload('payment_success'), null);
});

test('redacts phone and email patterns from search queries', () => {
  const payload = sanitizeAnalyticsPayload('search', {
    meta: { query: 'roses +7 999 123-45-67 me@example.test', resultCount: 0 },
  });
  assert.equal(payload.meta.query, 'roses [phone] [email]');
  assert.equal(payload.meta.resultCount, 0);
  assert.doesNotThrow(() => normalizeClientEvent(payload));
});

test('extracts only UTM values and external referrer hostname', () => {
  const restoreSession = replaceGlobal('sessionStorage', memoryStorage());
  const meta = extractAnalyticsAttribution(
    { search: '?utm_source=tg&utm_medium=bot&utm_campaign=november&utm_content=rose-video&phone=secret', hostname: 'flowie.example' },
    'https://partner.example/private/path?token=secret',
  );
  assert.deepEqual(meta, {
    utm_source: 'tg',
    utm_medium: 'bot',
    utm_campaign: 'november',
    utm_content: 'rose-video',
    referrerHost: 'partner.example',
  });
  assert.equal(extractAnalyticsAttribution({ search: '', hostname: 'flowie.example' }, '').utm_content, 'rose-video');
  restoreSession();
});

test('tracks the required funnel events and rejects unknown events', () => {
  const restoreStorage = replaceGlobal('localStorage', memoryStorage());
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    clearAnalyticsQueue();
    assert.equal(trackAnalytics('product_view', { productId: 1 }), true);
    assert.equal(trackAnalytics('cart_add', { productId: 1, meta: { quantity: 1 } }), true);
    assert.equal(trackAnalytics('checkout_start'), true);
    assert.equal(trackAnalytics('payment_start', { orderId: 2 }), true);
    assert.equal(trackAnalytics('not_allowed'), false);
    assert.equal(getAnalyticsDebugState().queued, 4);
  } finally {
    clearAnalyticsQueue();
    restoreNavigator();
    restoreStorage();
  }
});

test('records a confirmed purchase once per order in the same browser', () => {
  const localStorage = memoryStorage();
  const restoreStorage = replaceGlobal('localStorage', localStorage);
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    assert.equal(trackConfirmedPurchase({ orderId: 991991, revenue: 4590, paymentStatus: 'PENDING' }), false);
    assert.equal(trackConfirmedPurchase({ orderId: 991991, revenue: 4590, paymentStatus: 'CONFIRMED' }), true);
    assert.equal(localStorage.getItem(`${ANALYTICS_PURCHASE_KEY_PREFIX}991991`), '1');
    assert.equal(trackConfirmedPurchase({ orderId: 991991, revenue: 4590, paymentStatus: 'CONFIRMED' }), false);
  } finally {
    restoreNavigator();
    restoreStorage();
  }
});

test('does not record purchases while analytics is disabled', () => {
  const localStorage = memoryStorage();
  const restoreStorage = replaceGlobal('localStorage', localStorage);
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    setAnalyticsOptOut(true);
    assert.equal(trackConfirmedPurchase({ orderId: 991992, revenue: 1, paymentStatus: 'CONFIRMED' }), false);
    assert.equal(localStorage.getItem(`${ANALYTICS_PURCHASE_KEY_PREFIX}991992`), null);
  } finally {
    clearAnalyticsQueue();
    restoreNavigator();
    restoreStorage();
  }
});

test('opt-out and DNT disable behavioral analytics', () => {
  const localStorage = memoryStorage();
  const restoreStorage = replaceGlobal('localStorage', localStorage);
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    setAnalyticsOptOut(true);
    assert.equal(localStorage.getItem(ANALYTICS_OPT_OUT_KEY), '1');
    assert.equal(isAnalyticsEnabled(), false);
    setAnalyticsOptOut(false);
    assert.equal(isAnalyticsEnabled(), true);
    globalThis.navigator.doNotTrack = '1';
    assert.equal(isAnalyticsEnabled(), false);
  } finally {
    clearAnalyticsQueue();
    restoreNavigator();
    restoreStorage();
  }
});

test('guest bootstrap queue is bounded and opt-out clears it', () => {
  const localStorage = memoryStorage();
  const restoreStorage = replaceGlobal('localStorage', localStorage);
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    clearAnalyticsQueue();
    for (let index = 0; index < 45; index += 1) {
      trackAnalytics('search', { meta: { query: `bouquet ${index}`, resultCount: index } });
    }
    assert.equal(getAnalyticsDebugState().queued, 40);
    setAnalyticsOptOut(true);
    assert.equal(getAnalyticsDebugState().queued, 0);
  } finally {
    clearAnalyticsQueue();
    restoreNavigator();
    restoreStorage();
  }
});
