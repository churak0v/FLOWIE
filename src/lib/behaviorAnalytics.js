import { trackAnalytics } from './analytics.js';

const ENGAGEMENT = [5, 15, 30, 60];
const DEPTHS = [25, 50, 75, 90];

function datasetNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function elementPosition(element, selector) {
  const explicit = datasetNumber(element.dataset.analyticsPosition);
  if (explicit) return explicit;
  const items = [...document.querySelectorAll(selector)];
  const index = items.indexOf(element);
  return index >= 0 && index < 200 ? index + 1 : undefined;
}

export function installBehaviorAnalytics(root = document) {
  if (!root || typeof window === 'undefined') return () => {};
  let activeMs = 0;
  let lastTick = performance.now();
  const sentEngagement = new Set();
  const sentDepth = new Set();
  const observed = new WeakSet();
  const dwellTimers = new WeakMap();

  const tick = () => {
    const now = performance.now();
    if (document.visibilityState === 'visible' && document.hasFocus()) activeMs += Math.min(1_500, now - lastTick);
    lastTick = now;
    for (const seconds of ENGAGEMENT) {
      if (activeMs >= seconds * 1_000 && !sentEngagement.has(seconds)) {
        sentEngagement.add(seconds);
        trackAnalytics('engagement_milestone', { meta: { seconds } }, { dedupeKey: `engagement:${seconds}` });
      }
    }
  };
  const interval = window.setInterval(tick, 1_000);

  const onScroll = () => {
    const total = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const max = Math.max(1, total - window.innerHeight);
    const percent = Math.min(100, Math.round((window.scrollY / max) * 100));
    for (const depth of DEPTHS) {
      if (percent >= depth && !sentDepth.has(depth)) {
        sentDepth.add(depth);
        trackAnalytics('scroll_depth', { meta: { percent: depth } }, { dedupeKey: `scroll:${depth}` });
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
          const position = elementPosition(element, kind === 'product' ? '[data-analytics-impression="product"]' : '[data-analytics-impression="banner"]');
          if (sectionKey) trackAnalytics('section_view', { meta: { sectionKey } }, { dedupeKey: `section:${sectionKey}` });
          if (kind === 'banner') trackAnalytics('banner_view', { meta: { bannerId: element.dataset.analyticsBanner, placementKey, position } }, { dedupeKey: `banner:${element.dataset.analyticsBanner}:${placementKey}` });
          if (kind === 'product') trackAnalytics('product_card_view', { productId: datasetNumber(element.dataset.analyticsProduct), meta: { placementKey, position } }, { dedupeKey: `product:${element.dataset.analyticsProduct}:${placementKey}` });
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
    const position = elementPosition(target, kind === 'product' ? '[data-analytics-impression="product"]' : '[data-analytics-impression="banner"]');
    const kind = target.dataset.analyticsImpression;
    if (elementKey) trackAnalytics('element_click', { meta: { elementKey, placementKey } });
    if (kind === 'banner') trackAnalytics('banner_click', { meta: { bannerId: target.dataset.analyticsBanner, placementKey, position } });
    if (kind === 'product') trackAnalytics('product_card_click', { productId: datasetNumber(target.dataset.analyticsProduct), meta: { placementKey, position } });
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
