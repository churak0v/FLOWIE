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
  const windowListeners = new Map();
  const rootListeners = new Map();
  let intervalId = 0;
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
    addEventListener: (name, handler) => rootListeners.set(name, handler),
    removeEventListener: (name) => rootListeners.delete(name),
  };
  const window = {
    innerHeight: 100,
    innerWidth: 390,
    scrollY: 0,
    setInterval(handler) { intervalId += 1; intervals.set(intervalId, handler); return intervalId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout,
    clearTimeout,
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
      for (let index = 0; index < steps; index += 1) { now += Math.min(1000, milliseconds - index * 1000); [...intervals.values()].forEach((handler) => handler()); }
    },
    visibility(value) { document.visibilityState = value; rootListeners.get('visibilitychange')?.(); },
    blur() { windowListeners.get('blur')?.(); },
    focus() { windowListeners.get('focus')?.(); },
    intersect(element, visible) {
      const observer = observers.find((item) => item.options?.threshold?.length === 2);
      observer?.callback([{ target: element, isIntersecting: visible, intersectionRatio: visible ? 0.75 : 0 }]);
    },
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
    assert.deepEqual(events.map((event) => event.meta.reason), ['heartbeat', 'blur', 'heartbeat', 'route_leave']);
    assert.deepEqual(events.map((event) => event.meta.activeMs), [10_000, 12_000, 15_000, 15_000]);
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
