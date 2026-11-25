import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ANALYTICS_OPT_OUT_KEY,
  ANALYTICS_PURCHASE_KEY_PREFIX,
  beginAnalyticsPageView,
  clearAnalyticsQueue,
  createAnalyticsUuid,
  extractAnalyticsAttribution,
  getAnalyticsDebugState,
  getAnalyticsSessionId,
  isAnalyticsEnabled,
  sanitizeAnalyticsPayload,
  setAnalyticsOptOut,
  trackAnalytics,
  trackAuthAnalytics,
  trackConfirmedPurchase,
  trackVerifiedAuthAfterConfirmation,
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
    trafficChannel: 'campaign',
    trafficSource: 'tg',
  });
  assert.equal(extractAnalyticsAttribution({ search: '', hostname: 'flowie.example' }, '').utm_content, 'rose-video');
  assert.deepEqual(extractAnalyticsAttribution(
    { search: '?utm_source=vk_ads&utm_campaign=123456789', hostname: 'flowie.example' },
    '',
  ), {
    utm_source: 'vk_ads',
    utm_campaign: '123456789',
    trafficChannel: 'campaign',
    trafficSource: 'vk_ads',
  });
  restoreSession();
});

test('attributes click ids before referrers and never fabricates UTM values', () => {
  const cases = [
    [{ search: '?yclid=opaque-click', hostname: 'flowie.example' }, 'https://google.com/search?q=private', { trafficChannel: 'paid_search', trafficSource: 'yandex', yclid: 'opaque-click' }],
    [{ search: '?vk_click_id=vk-click', hostname: 'flowie.example' }, 'https://yandex.ru/search/?text=private', { trafficChannel: 'paid_social', trafficSource: 'vk', mt_click_id: 'vk-click' }],
    [{ search: '', hostname: 'flowie.example' }, 'https://www.google.com/search?q=private', { trafficChannel: 'organic_search', trafficSource: 'www.google.com', referrerHost: 'www.google.com' }],
    [{ search: '', hostname: 'flowie.example' }, 'https://partner.example/private?email=person@example.test', { trafficChannel: 'referral', trafficSource: 'partner.example', referrerHost: 'partner.example' }],
    [{ search: '?phone=79990000000', hostname: 'flowie.example' }, '', { trafficChannel: 'direct_or_unknown', trafficSource: 'direct_or_unknown' }],
  ];
  for (const [locationLike, referrer, expected] of cases) {
    const restoreSession = replaceGlobal('sessionStorage', memoryStorage());
    try {
      const actual = extractAnalyticsAttribution(locationLike, referrer);
      assert.deepEqual(actual, expected);
      assert.equal(Object.keys(actual).some((key) => key.startsWith('utm_')), false);
      assert.doesNotMatch(JSON.stringify(actual), /private|person@example|79990000000/);
    } finally {
      restoreSession();
    }
  }
});

test('redacts personal values before attribution reaches session storage', () => {
  const sessionStorage = memoryStorage();
  const restoreSession = replaceGlobal('sessionStorage', sessionStorage);
  try {
    const actual = extractAnalyticsAttribution({
      search: '?utm_source=newsletter&utm_campaign=person@example.test&utm_term=%2B79991234567&yclid=bad%20click',
      hostname: 'flowie.example',
    }, '');
    assert.equal(actual.utm_campaign, '[email]');
    assert.equal(actual.utm_term, '[phone]');
    assert.equal(actual.yclid, undefined);
    assert.doesNotMatch(sessionStorage.getItem('flowie_analytics_attribution'), /person@example|79991234567|bad click/);
  } finally {
    restoreSession();
  }
});

test('preserves privacy-safe session and route context through the deployed API validator', () => {
  beginAnalyticsPageView('/product/42');
  const payload = sanitizeAnalyticsPayload('scroll_depth', { meta: { percent: 50 } });
  assert.equal(payload.routeKey, '/product/:id');
  assert.match(payload.pageViewId, /^[0-9a-f-]{36}$/i);
  assert.equal(payload.meta.percent, 50);
  const normalized = normalizeClientEvent(payload);
  assert.equal(normalized.routeKey, payload.routeKey);
  assert.equal(normalized.pageViewId, payload.pageViewId);
  assert.equal(normalized.sessionId, payload.sessionId);
  assert.equal(normalized.meta.percent, 50);
  assert.doesNotThrow(() => normalizeClientEvent(sanitizeAnalyticsPayload('engagement_milestone', { meta: { seconds: 15 } })));
  const engagement = sanitizeAnalyticsPayload('section_engagement', { meta: { sectionKey: 'gallery', activeMs: 12_345, reason: 'heartbeat' } });
  assert.equal(engagement.meta.activeMs, 12_345);
  assert.doesNotThrow(() => normalizeClientEvent(engagement));
  assert.equal(sanitizeAnalyticsPayload('page_engagement', { meta: { activeMs: 12_345, reason: 'free-form' } }), null);
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

test('auth observations are fixed, privacy-minimized and server-valid', async () => {
  const restoreStorage = replaceGlobal('localStorage', memoryStorage());
  const restoreSession = replaceGlobal('sessionStorage', memoryStorage());
  const restoreNavigator = replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false });
  try {
    clearAnalyticsQueue();
    for (const event of ['auth_open', 'auth_code_requested', 'auth_verified']) {
      const payload = sanitizeAnalyticsPayload(event, {
        meta: {
          phone: '+7 999 123-45-67',
          code: '123456',
          name: 'Private Person',
          value: 'form value',
          path: '/account?phone=79991234567',
        },
      });
      assert.deepEqual(payload.meta, { path: '/account' });
      assert.doesNotMatch(JSON.stringify(payload), /7999|123456|Private Person|form value/);
      assert.doesNotThrow(() => normalizeClientEvent(payload));
      assert.equal(trackAuthAnalytics(event), true);
    }
    assert.equal(trackAuthAnalytics('new_registration'), false);
    assert.equal(await trackVerifiedAuthAfterConfirmation(async () => ({ user: { phoneVerified: false } })), false);
    assert.equal(await trackVerifiedAuthAfterConfirmation(async () => { throw new Error('network'); }), false);
    assert.equal(await trackVerifiedAuthAfterConfirmation(async () => ({ user: { phoneVerified: true, phone: '+79991234567' } })), true);
    assert.equal(getAnalyticsDebugState().queued, 4);
  } finally {
    clearAnalyticsQueue();
    restoreNavigator();
    restoreSession();
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
