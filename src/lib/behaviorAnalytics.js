import { getAnalyticsContext, trackAnalytics } from './analytics.js';

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
  let lastTick = performance.now();
  const sentEngagement = new Set();
  const sentDepth = new Set();
  const observed = new WeakSet();
  const dwellTimers = new WeakMap();

  const tick = () => {
    const now = performance.now();
    const focused = typeof ownerDocument.hasFocus !== 'function' || ownerDocument.hasFocus();
    if (ownerDocument.visibilityState === 'visible' && focused) activeMs += Math.min(1_500, now - lastTick);
    lastTick = now;
    for (const seconds of ENGAGEMENT) {
      if (activeMs >= seconds * 1_000 && !sentEngagement.has(seconds)) {
        sentEngagement.add(seconds);
        trackAnalytics('engagement_milestone', { pageViewId, meta: { seconds } }, { dedupeKey: `${pageViewId}:engagement:${seconds}` });
      }
    }
  };
  const interval = window.setInterval(tick, 1_000);

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

  const observe = () => {
    if (!impressionObserver) return;
    root.querySelectorAll('[data-analytics-section],[data-analytics-impression]').forEach((element) => {
      if (observed.has(element)) return;
      observed.add(element);
      impressionObserver.observe(element);
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
    tick();
    window.clearInterval(interval);
    window.removeEventListener('scroll', onScroll);
    root.removeEventListener('click', onClick, true);
    mutationObserver?.disconnect();
    impressionObserver?.disconnect();
  };
}
