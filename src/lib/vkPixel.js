const PIXEL_ID = String(import.meta.env?.VITE_VK_PIXEL_ID || '').trim();
let initialized = false;
let lastPageUrl = '';

function validPixelId(value) {
  return /^\d+$/.test(String(value || '').trim());
}

export function createVkPixelCommand(event, payload = {}, pixelId = PIXEL_ID) {
  if (!validPixelId(pixelId)) return null;
  if (event === 'page_view') {
    return { id: String(pixelId), type: 'pageView', start: Date.now() };
  }

  const goal = String(event || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  if (!goal) return null;
  const command = { id: String(pixelId), type: 'reachGoal', goal };
  if (Number.isFinite(Number(payload.revenue))) command.value = Math.max(0, Number(payload.revenue));
  const params = {};
  if (Number.isSafeInteger(Number(payload.productId)) && Number(payload.productId) > 0) {
    params.product_id = String(Number(payload.productId));
  }
  if (Number.isSafeInteger(Number(payload.orderId)) && Number(payload.orderId) > 0) {
    params.order_id = String(Number(payload.orderId));
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    if (typeof payload?.meta?.[key] === 'string' && payload.meta[key]) {
      params[key] = payload.meta[key].slice(0, 80);
    }
  }
  if (Object.keys(params).length) command.params = params;
  return command;
}

export function initVkPixel({ enabled = true } = {}) {
  if (!enabled || initialized || !validPixelId(PIXEL_ID) || typeof window === 'undefined') return false;
  initialized = true;
  window._tmr = window._tmr || [];
  const command = createVkPixelCommand('page_view');
  window._tmr.push(command);
  lastPageUrl = window.location.href;

  if (!document.getElementById('tmr-code')) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.id = 'tmr-code';
    script.src = 'https://top-fwz1.mail.ru/js/code.js';
    document.head.appendChild(script);
  }
  return true;
}

export function sendVkPixelEvent(event, payload = {}) {
  if (!initialized || typeof window?._tmr?.push !== 'function') return false;
  if (!new Set(['page_view', 'product_view', 'cart_add', 'checkout_start', 'payment_start', 'purchase']).has(event)) return false;
  if (event === 'page_view') {
    const currentUrl = window.location.href;
    const isInitialLanding = currentUrl === lastPageUrl;
    if (!isInitialLanding) {
      lastPageUrl = currentUrl;
      const pageView = createVkPixelCommand(event, payload);
      if (pageView) window._tmr.push(pageView);
      return true;
    }
    const landingView = createVkPixelCommand('landing_view', payload);
    if (!landingView) return false;
    window._tmr.push(landingView);
    return true;
  }
  const command = createVkPixelCommand(event, payload);
  if (!command) return false;
  window._tmr.push(command);
  return true;
}

export function vkPixelId() {
  return validPixelId(PIXEL_ID) ? PIXEL_ID : null;
}
