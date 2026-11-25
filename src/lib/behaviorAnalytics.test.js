import test from 'node:test';
import assert from 'node:assert/strict';
import { beginAnalyticsPageView, clearAnalyticsQueue, flushAnalytics, setAnalyticsOptOut } from './analytics.js';
import { installBehaviorAnalytics } from './behaviorAnalytics.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
}

function environment({ elements = [] } = {}) {
  let now = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const windowListeners = new Map();
  const rootListeners = new Map();
  let intervalId = 0;
  let timeoutId = 0;
  let hitTest = () => null;
  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const document = {
    visibilityState: 'visible',
    hasFocus: () => true,
    documentElement: { scrollHeight: 1100 },
    body: { scrollHeight: 1100 },
    querySelectorAll: () => elements,
    elementFromPoint: (x, y) => hitTest(x, y),
    addEventListener: (name, handler) => rootListeners.set(name, handler),
    removeEventListener: (name) => rootListeners.delete(name),
  };
  const window = {
    innerHeight: 100,
    innerWidth: 390,
    scrollY: 0,
    setInterval(handler) { intervalId += 1; intervals.set(intervalId, handler); return intervalId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(handler, delay) { timeoutId += 1; timeouts.set(timeoutId, { handler, due: now + Number(delay || 0) }); return timeoutId; },
    clearTimeout(id) { timeouts.delete(id); },
    addEventListener: (name, handler) => windowListeners.set(name, handler),
    removeEventListener: (name) => windowListeners.delete(name),
  };
  const restores = [
    replaceGlobal('window', window), replaceGlobal('document', document),
    replaceGlobal('performance', { now: () => now }), replaceGlobal('IntersectionObserver', FakeIntersectionObserver),
    replaceGlobal('MutationObserver', undefined), replaceGlobal('localStorage', memoryStorage()),
    replaceGlobal('sessionStorage', memoryStorage()), replaceGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false }),
  ];
  return {
    document, window, rootListeners,
    advance(milliseconds) {
      const steps = Math.ceil(milliseconds / 1000);
      for (let index = 0; index < steps; index += 1) {
        now += Math.min(1000, milliseconds - index * 1000);
        [...intervals.values()].forEach((handler) => handler());
        for (const [id, timer] of [...timeouts]) {
          if (timer.due > now) continue;
          timeouts.delete(id);
          timer.handler();
        }
      }
    },
    visibility(value) { document.visibilityState = value; rootListeners.get('visibilitychange')?.(); },
    blur() { windowListeners.get('blur')?.(); },
    focus() { windowListeners.get('focus')?.(); },
    intersect(element, visible) {
      const observer = observers.find((item) => item.options?.threshold?.length === 2);
      observer?.callback([{ target: element, isIntersecting: visible, intersectionRatio: visible ? 0.75 : 0 }]);
    },
    intersectImpression(element, visible) {
      const observer = observers.find((item) => item.options?.threshold?.length === 1);
      observer?.callback([{ target: element, isIntersecting: visible, intersectionRatio: visible ? 0.75 : 0 }]);
    },
    setHitTest(handler) { hitTest = handler; },
    pendingTimeouts() { return timeouts.size; },
    scroll(y) { window.scrollY = y; windowListeners.get('scroll')?.(); },
    restore() { restores.reverse().forEach((restore) => restore()); },
  };
}

async function drainEvents() {
  const events = [];
  const restoreFetch = replaceGlobal('fetch', async (_url, options) => {
    events.push(JSON.parse(options.body));
    return { ok: true, status: 202 };
  });
  try { await flushAnalytics(); } finally { restoreFetch(); }
  return events;
}

test('active-time milestones pause while hidden and emit honest 5/15/30/60 lower bounds', async () => {
  clearAnalyticsQueue();
  const env = environment();
  try {
    beginAnalyticsPageView('/catalog');
    const cleanup = installBehaviorAnalytics(env.document);
    env.advance(15_000);
    env.visibility('hidden');
    env.advance(20_000);
    env.visibility('visible');
    env.advance(45_000);
    cleanup();
    const events = await drainEvents();
    assert.deepEqual(events.filter((event) => event.event === 'engagement_milestone').map((event) => event.meta.seconds), [5, 15, 30, 60]);
    assert.equal(events.every((event) => event.routeKey === '/catalog'), true);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('cumulative snapshots use active focused time and lifecycle reasons', async () => {
  clearAnalyticsQueue();
  const env = environment();
  try {
    beginAnalyticsPageView('/product/42');
    const cleanup = installBehaviorAnalytics(env.document);
    env.advance(12_000);
    env.blur();
    env.advance(25_000);
    env.focus();
    env.advance(3_000);
    cleanup();
    const events = (await drainEvents()).filter((event) => event.event === 'page_engagement');
    assert.deepEqual(events.map((event) => event.meta.reason), ['heartbeat', 'blur', 'route_leave']);
    assert.deepEqual(events.map((event) => event.meta.activeMs), [10_000, 12_000, 15_000]);
    assert.equal(events.every((event) => event.routeKey === '/product/:id'), true);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('section snapshots count only visible focused overlap and remain cumulative', async () => {
  clearAnalyticsQueue();
  const section = { dataset: { analyticsSection: 'composition' } };
  const env = environment({ elements: [section] });
  try {
    beginAnalyticsPageView('/product/42');
    const cleanup = installBehaviorAnalytics(env.document);
    env.intersect(section, true);
    env.advance(6_000);
    env.intersect(section, false);
    env.advance(4_000);
    cleanup();
    const events = (await drainEvents()).filter((event) => event.event === 'section_engagement');
    assert.deepEqual(events.map((event) => event.meta.sectionKey), ['composition', 'composition']);
    assert.deepEqual(events.map((event) => event.meta.activeMs), [6_000, 6_000]);
    assert.deepEqual(events.map((event) => event.meta.reason), ['heartbeat', 'route_leave']);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('section engagement ignores geometry that is covered by the foreground sheet', async () => {
  clearAnalyticsQueue();
  const section = {
    dataset: { analyticsSection: 'hero' },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 390, bottom: 100 }),
    contains: () => false,
  };
  const sheet = { dataset: {} };
  const env = environment({ elements: [section] });
  try {
    env.setHitTest(() => section);
    beginAnalyticsPageView('/');
    const cleanup = installBehaviorAnalytics(env.document);
    env.intersect(section, true);
    env.advance(4_000);
    env.setHitTest(() => sheet);
    env.advance(8_000);
    cleanup();
    const events = (await drainEvents()).filter((event) => event.event === 'section_engagement' && event.meta.sectionKey === 'hero');
    assert.deepEqual(events.map((event) => event.meta.activeMs), [4_000, 4_000]);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('impressions require focus and real visibility, support element roots, and cleanup dwell timers', async () => {
  clearAnalyticsQueue();
  const banner = {
    dataset: { analyticsImpression: 'banner', analyticsBanner: 'photo-proof', analyticsPlacement: 'home_recommendations' },
    getBoundingClientRect: () => ({ left: 20, top: 20, right: 300, bottom: 90 }),
    contains: () => false,
    isConnected: true,
  };
  const sheet = { dataset: {} };
  const env = environment({ elements: [banner] });
  const customRoot = {
    ownerDocument: env.document,
    querySelectorAll: () => [banner],
    addEventListener: (name, handler) => env.rootListeners.set(name, handler),
    removeEventListener: (name) => env.rootListeners.delete(name),
  };
  try {
    env.setHitTest(() => sheet);
    beginAnalyticsPageView('/');
    const cleanup = installBehaviorAnalytics(customRoot);
    env.intersectImpression(banner, true);
    env.advance(2_000);
    assert.equal((await drainEvents()).some((event) => event.event === 'banner_view'), false);

    env.setHitTest(() => banner);
    env.visibility('hidden');
    env.advance(2_000);
    env.visibility('visible');
    env.advance(1_000);
    cleanup();
    const events = await drainEvents();
    assert.equal(events.filter((event) => event.event === 'banner_view').length, 1);
    assert.equal(env.pendingTimeouts(), 0);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('cleanup cancels an unfinished impression dwell timer', async () => {
  clearAnalyticsQueue();
  const product = {
    dataset: { analyticsImpression: 'product', analyticsProduct: '42', analyticsPlacement: 'product_recommendations' },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 180, bottom: 100 }),
    contains: () => false,
  };
  const env = environment({ elements: [product] });
  try {
    env.setHitTest(() => product);
    beginAnalyticsPageView('/product/1');
    const cleanup = installBehaviorAnalytics(env.document);
    env.intersectImpression(product, true);
    assert.equal(env.pendingTimeouts(), 1);
    cleanup();
    env.advance(1_000);
    const events = await drainEvents();
    assert.equal(events.some((event) => event.event === 'product_card_view'), false);
    assert.equal(env.pendingTimeouts(), 0);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('scroll thresholds are route-scoped and reset on navigation', async () => {
  clearAnalyticsQueue();
  const env = environment();
  try {
    beginAnalyticsPageView('/product/42');
    const firstCleanup = installBehaviorAnalytics(env.document);
    env.scroll(900);
    firstCleanup();
    beginAnalyticsPageView('/cart');
    env.window.scrollY = 0;
    const secondCleanup = installBehaviorAnalytics(env.document);
    env.scroll(500);
    secondCleanup();
    const events = (await drainEvents()).filter((event) => event.event === 'scroll_depth');
    assert.deepEqual(events.filter((event) => event.routeKey === '/product/:id').map((event) => event.meta.percent), [25, 50, 75, 90]);
    assert.deepEqual(events.filter((event) => event.routeKey === '/cart').map((event) => event.meta.percent), [25, 50]);
    assert.equal(new Set(events.map((event) => event.pageViewId)).size, 2);
  } finally { clearAnalyticsQueue(); env.restore(); }
});

test('delegated clicks use the target safely and opt-out suppresses all behavior events', async () => {
  clearAnalyticsQueue();
  const env = environment();
  try {
    beginAnalyticsPageView('/');
    const cleanup = installBehaviorAnalytics(env.document);
    const target = { dataset: { analyticsElement: 'nav_home', analyticsPlacement: 'bottom_nav' } };
    assert.doesNotThrow(() => env.rootListeners.get('click')?.({ target: { closest: () => target } }));
    cleanup();
    let events = await drainEvents();
    assert.equal(events.some((event) => event.event === 'element_click' && event.meta.elementKey === 'nav_home'), true);
    setAnalyticsOptOut(true);
    beginAnalyticsPageView('/catalog');
    const optedOutCleanup = installBehaviorAnalytics(env.document);
    env.advance(60_000); env.scroll(900); optedOutCleanup();
    events = await drainEvents();
    assert.deepEqual(events, []);
  } finally { setAnalyticsOptOut(false); clearAnalyticsQueue(); env.restore(); }
});
