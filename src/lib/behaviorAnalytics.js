import { getAnalyticsContext, trackAnalytics } from './analytics.js';
import { SECTION_KEYS } from './analyticsTaxonomy.js';

const ENGAGEMENT = [5, 15, 30, 60];
const DEPTHS = [25, 50, 75, 90];

function datasetNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function elementPosition(element, selector, ownerDocument = document) {
  const explicit = datasetNumber(element.dataset.analyticsPosition);
  if (explicit) return explicit;
  const items = [...ownerDocument.querySelectorAll(selector)];
  const index = items.indexOf(element);
  return index >= 0 && index < 200 ? index + 1 : undefined;
}

export function installBehaviorAnalytics(root = document) {
  if (!root || typeof window === 'undefined') return () => {};
  const ownerDocument = root.ownerDocument || root;
  const pageViewId = getAnalyticsContext().pageViewId;
  let activeMs = 0;
  let lastSample = performance.now();
  let lastHeartbeat = lastSample;
  let pageIsActive = ownerDocument.visibilityState === 'visible'
    && (typeof ownerDocument.hasFocus !== 'function' || ownerDocument.hasFocus());
  const sectionActiveMs = new Map();
  const lastSectionSnapshotMs = new Map();
  let lastPageSnapshotMs = -1;
  const visibleSectionElements = new Map();
  const sectionVisibility = new WeakMap();
  const sentEngagement = new Set();
  const sentDepth = new Set();
  const observed = new WeakSet();
  const sectionElements = new Set();
  const dwellTimers = new WeakMap();

  const sample = () => {
    const now = performance.now();
    const delta = Math.max(0, now - lastSample);
    if (pageIsActive) {
      activeMs += delta;
      for (const [sectionKey, elements] of visibleSectionElements) {
        if (elements.size) sectionActiveMs.set(sectionKey, (sectionActiveMs.get(sectionKey) || 0) + delta);
      }
    }
    lastSample = now;
    for (const seconds of ENGAGEMENT) {
      if (activeMs >= seconds * 1_000 && !sentEngagement.has(seconds)) {
        sentEngagement.add(seconds);
        trackAnalytics('engagement_milestone', { pageViewId, meta: { seconds } }, { dedupeKey: `${pageViewId}:engagement:${seconds}` });
      }
    }
    return now;
  };

  const snapshot = (reason) => {
    sample();
    const pageMilliseconds = Math.floor(activeMs);
    if (reason !== 'heartbeat' || pageMilliseconds !== lastPageSnapshotMs) {
      trackAnalytics('page_engagement', { pageViewId, meta: { activeMs: pageMilliseconds, reason } }, { firstPartyOnly: true });
      lastPageSnapshotMs = pageMilliseconds;
    }
    for (const [sectionKey, milliseconds] of sectionActiveMs) {
      const rounded = Math.floor(milliseconds);
      if (reason === 'heartbeat' && rounded === lastSectionSnapshotMs.get(sectionKey)) continue;
      trackAnalytics('section_engagement', {
        pageViewId,
        meta: { sectionKey, activeMs: rounded, reason },
      }, { firstPartyOnly: true });
      lastSectionSnapshotMs.set(sectionKey, rounded);
    }
  };

  const refreshActiveState = () => {
    sample();
    pageIsActive = ownerDocument.visibilityState === 'visible'
      && (typeof ownerDocument.hasFocus !== 'function' || ownerDocument.hasFocus());
  };
  const tick = () => {
    const now = sample();
    if (now - lastHeartbeat >= 10_000) {
      snapshot('heartbeat');
      lastHeartbeat = now;
    }
  };
  const interval = window.setInterval(tick, 1_000);

  const onBlur = () => { sample(); pageIsActive = false; snapshot('blur'); };
  const onFocus = () => { refreshActiveState(); };
  const onVisibilityChange = () => {
    if (ownerDocument.visibilityState !== 'visible') {
      sample();
      pageIsActive = false;
      snapshot('hidden');
    } else refreshActiveState();
  };
  const onPageHide = () => snapshot('pagehide');
  const onBeforeUnload = () => snapshot('unload');
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  ownerDocument.addEventListener('visibilitychange', onVisibilityChange);

  const onScroll = () => {
    const total = Math.max(ownerDocument.documentElement?.scrollHeight || 0, ownerDocument.body?.scrollHeight || 0);
    const max = Math.max(1, total - window.innerHeight);
    // Floor the ratio so a milestone is an honest lower bound, never a rounded-up estimate.
    const percent = Math.min(100, Math.floor((window.scrollY / max) * 100));
    for (const depth of DEPTHS) {
      if (percent >= depth && !sentDepth.has(depth)) {
        sentDepth.add(depth);
        trackAnalytics('scroll_depth', { pageViewId, meta: { percent: depth } }, { dedupeKey: `${pageViewId}:scroll:${depth}` });
      }
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const impressionObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (dwellTimers.has(element)) continue;
        const impressionKind = element.dataset.analyticsImpression;
        dwellTimers.set(element, window.setTimeout(() => {
          const sectionKey = element.dataset.analyticsSection;
          const kind = element.dataset.analyticsImpression;
          const placementKey = element.dataset.analyticsPlacement;
          const position = elementPosition(element, kind === 'product' ? '[data-analytics-impression="product"]' : '[data-analytics-impression="banner"]', ownerDocument);
          if (sectionKey) trackAnalytics('section_view', { pageViewId, meta: { sectionKey } }, { dedupeKey: `${pageViewId}:section:${sectionKey}` });
          if (kind === 'banner') trackAnalytics('banner_view', { pageViewId, meta: { bannerId: element.dataset.analyticsBanner, placementKey, position } }, { dedupeKey: `${pageViewId}:banner:${element.dataset.analyticsBanner}:${placementKey}` });
          if (kind === 'product') trackAnalytics('product_card_view', { pageViewId, productId: datasetNumber(element.dataset.analyticsProduct), meta: { placementKey, position } }, { dedupeKey: `${pageViewId}:product:${element.dataset.analyticsProduct}:${placementKey}` });
          impressionObserver.unobserve(element);
        }, impressionKind === 'product' ? 750 : 1_000));
      } else {
        window.clearTimeout(dwellTimers.get(element));
        dwellTimers.delete(element);
      }
    }
  }, { threshold: [0.5] }) : null;

  const sectionObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    sample();
    for (const entry of entries) {
      const element = entry.target;
      const sectionKey = String(element.dataset.analyticsSection || '');
      if (!SECTION_KEYS.has(sectionKey)) continue;
      const wasVisible = sectionVisibility.get(element) === true;
      const isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (wasVisible === isVisible) continue;
      sectionVisibility.set(element, isVisible);
      let elements = visibleSectionElements.get(sectionKey);
      if (!elements) {
        elements = new Set();
        visibleSectionElements.set(sectionKey, elements);
      }
      if (isVisible) elements.add(element);
      else elements.delete(element);
      if (!sectionActiveMs.has(sectionKey)) sectionActiveMs.set(sectionKey, 0);
    }
  }, { threshold: [0, 0.5] }) : null;

  const observe = () => {
    sample();
    for (const element of sectionElements) {
      if (element.isConnected !== false) continue;
      sectionElements.delete(element);
      if (!sectionVisibility.get(element)) continue;
      sectionVisibility.set(element, false);
      visibleSectionElements.get(String(element.dataset.analyticsSection || ''))?.delete(element);
    }
    root.querySelectorAll('[data-analytics-section],[data-analytics-impression]').forEach((element) => {
      if (observed.has(element)) return;
      observed.add(element);
      impressionObserver?.observe(element);
      if (element.dataset.analyticsSection) {
        sectionElements.add(element);
        sectionObserver?.observe(element);
      }
    });
  };
  observe();
  const mutationObserver = typeof MutationObserver === 'function' ? new MutationObserver(observe) : null;
  mutationObserver?.observe(root.body || root, { childList: true, subtree: true });

  const onClick = (event) => {
    const target = event.target?.closest?.('[data-analytics-element],[data-analytics-impression]');
    if (!target) return;
    const elementKey = target.dataset.analyticsElement;
    const placementKey = target.dataset.analyticsPlacement;
    const kind = target.dataset.analyticsImpression;
    const position = elementPosition(target, kind === 'product' ? '[data-analytics-impression="product"]' : '[data-analytics-impression="banner"]', ownerDocument);
    if (elementKey) trackAnalytics('element_click', { pageViewId, meta: { elementKey, placementKey } });
    if (kind === 'banner') trackAnalytics('banner_click', { pageViewId, meta: { bannerId: target.dataset.analyticsBanner, placementKey, position } });
    if (kind === 'product') trackAnalytics('product_card_click', { pageViewId, productId: datasetNumber(target.dataset.analyticsProduct), meta: { placementKey, position } });
  };
  root.addEventListener('click', onClick, true);

  return () => {
    snapshot('route_leave');
    window.clearInterval(interval);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    ownerDocument.removeEventListener('visibilitychange', onVisibilityChange);
    root.removeEventListener('click', onClick, true);
    mutationObserver?.disconnect();
    impressionObserver?.disconnect();
    sectionObserver?.disconnect();
  };
}
