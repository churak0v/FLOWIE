import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ANALYTICS_OPT_OUT_KEY,
  clearAnalyticsQueue,
  createAnalyticsUuid,
  extractAnalyticsAttribution,
  getAnalyticsDebugState,
  getAnalyticsSessionId,
  isAnalyticsEnabled,
  sanitizeAnalyticsPayload,
  setAnalyticsOptOut,
  trackAnalytics,
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
  const meta = extractAnalyticsAttribution(
    { search: '?utm_source=tg&utm_medium=bot&utm_campaign=november&phone=secret', hostname: 'flowie.example' },
    'https://partner.example/private/path?token=secret',
  );
  assert.deepEqual(meta, {
    utm_source: 'tg',
    utm_medium: 'bot',
    utm_campaign: 'november',
    referrerHost: 'partner.example',
  });
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
