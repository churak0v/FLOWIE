const COUNTER_ID = Number(String(import.meta.env?.VITE_YANDEX_METRICA_ID || '').trim());
let initialized = false;
let lastPageUrl = '';

export function initYandexMetrica({ enabled = true } = {}) {
  if (!enabled || initialized || !Number.isSafeInteger(COUNTER_ID) || COUNTER_ID <= 0 || typeof window === 'undefined') return false;
  initialized = true;
  window.ym = window.ym || function ym(...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l = Date.now();
  if (!document.querySelector('script[data-flowie-metrica]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.dataset.flowieMetrica = 'true';
    document.head.appendChild(script);
  }
  window.ym(COUNTER_ID, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
  lastPageUrl = window.location.href;
  return true;
}

export function createYandexMetricaGoal(event, payload = {}) {
  const params = {};
  if (Number.isSafeInteger(Number(payload.productId))) params.productId = Number(payload.productId);
  if (Number.isSafeInteger(Number(payload.orderId))) params.orderId = Number(payload.orderId);
  if (Number.isFinite(Number(payload.revenue))) params.revenue = Math.max(0, Number(payload.revenue));
  if (typeof payload?.meta?.bannerId === 'string') params.bannerId = payload.meta.bannerId.slice(0, 32);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    if (typeof payload?.meta?.[key] === 'string') params[key] = payload.meta[key].slice(0, 80);
  }
  const rawGoal = event === 'page_view'
    ? 'landing_view'
    : event === 'engagement_milestone'
      ? `engaged_${Number(payload?.meta?.seconds) || 0}s`
      : event === 'scroll_depth'
        ? `scroll_${Number(payload?.meta?.percent) || 0}`
        : event;
  const goal = String(rawGoal || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  return goal ? { goal, params } : null;
}

export function sendYandexMetricaEvent(event, payload = {}) {
  if (!initialized || typeof window?.ym !== 'function') return false;
  const externalEvents = new Set(['page_view', 'engagement_milestone', 'scroll_depth', 'banner_click', 'product_card_click', 'product_view', 'cart_add', 'checkout_start', 'payment_start', 'purchase']);
  if (!externalEvents.has(event)) return false;
  if (event === 'engagement_milestone' && Number(payload?.meta?.seconds) !== 15) return false;
  if (event === 'scroll_depth' && Number(payload?.meta?.percent) !== 50) return false;
  const command = createYandexMetricaGoal(event, payload);
  if (!command) return false;
  if (event === 'page_view') {
    const isInitialLanding = window.location.href === lastPageUrl;
    if (!isInitialLanding) {
      lastPageUrl = window.location.href;
      window.ym(COUNTER_ID, 'hit', window.location.href, { title: document.title });
    }
    if (isInitialLanding) window.ym(COUNTER_ID, 'reachGoal', command.goal, command.params);
  } else {
    window.ym(COUNTER_ID, 'reachGoal', command.goal, command.params);
  }
  return true;
}

export function metricaCounterId() {
  return Number.isSafeInteger(COUNTER_ID) && COUNTER_ID > 0 ? COUNTER_ID : null;
}
