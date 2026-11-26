import { getAnalyticsOrderContext, isAnalyticsEnabled } from './analytics.js';

const LIMITS = { utm_source: 80, utm_medium: 80, utm_campaign: 80, utm_content: 80, utm_term: 80, referrerHost: 255, trafficChannel: 32, trafficSource: 255, yclid: 256, mt_click_id: 256 };
const CHANNELS = new Set(['paid_search', 'paid_social', 'organic_search', 'organic_social', 'email', 'campaign', 'referral', 'direct_or_unknown']);

export function buildOrderPayload(orderData) {
  // Callers cannot bypass opt-out by supplying an analytics object themselves.
  const { analytics: _callerAnalytics, ...order } = orderData || {};
  if (!isAnalyticsEnabled()) return order;
  try {
    const { sessionId, attribution: context } = getAnalyticsOrderContext();
    const attribution = {};
    for (const [key, limit] of Object.entries(LIMITS)) {
      if (typeof context?.[key] !== 'string') continue;
      let value = [...context[key].slice(0, limit)].map(character => {
        const code = character.codePointAt(0);
        return code <= 31 || code === 127 ? ' ' : character;
      }).join('').trim();
      if (!value) continue;
      if (key === 'yclid' || key === 'mt_click_id') {
        if (/^[A-Za-z0-9._:-]+$/.test(value)) attribution[key] = value;
        continue;
      }
      const platformNumericId = ['utm_campaign', 'utm_content'].includes(key) && context.utm_source === 'vk_ads' && /^\d{1,10}$/.test(value);
      if (!platformNumericId) value = value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]').replace(/(?:\+?\d[\s().-]*){7,}/g, '[phone]').trim();
      if (key === 'trafficChannel' && !CHANNELS.has(value)) continue;
      if (key === 'trafficSource' && !/^[A-Za-z0-9_.:-]+$/.test(value)) continue;
      attribution[key] = value;
    }
    return { ...order, analytics: { sessionId, attribution } };
  } catch {
    // Analytics availability must never prevent an otherwise valid purchase.
    return order;
  }
}
