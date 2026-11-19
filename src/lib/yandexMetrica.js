const COUNTER_ID = Number(String(import.meta.env?.VITE_YANDEX_METRICA_ID || '').trim());
let initialized = false;

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
    webvisor: false,
  });
  return true;
}

export function sendYandexMetricaEvent(event, payload = {}) {
  if (!initialized || typeof window?.ym !== 'function') return false;
  const safePayload = {};
  if (Number.isSafeInteger(Number(payload.productId))) safePayload.productId = Number(payload.productId);
  if (Number.isSafeInteger(Number(payload.orderId))) safePayload.orderId = Number(payload.orderId);
  if (Number.isFinite(Number(payload.revenue))) safePayload.revenue = Math.max(0, Number(payload.revenue));
  if (event === 'page_view') {
    window.ym(COUNTER_ID, 'hit', window.location.href, { title: document.title });
  } else {
    window.ym(COUNTER_ID, 'reachGoal', String(event || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64), safePayload);
  }
  return true;
}

export function metricaCounterId() {
  return Number.isSafeInteger(COUNTER_ID) && COUNTER_ID > 0 ? COUNTER_ID : null;
}
