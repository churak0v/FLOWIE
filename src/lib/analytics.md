# First-party analytics

FLOWIE sends an allowlisted set of interaction events to its own `POST /api/events` endpoint. Яндекс Метрика (including Webvisor) and VK Pixel receive only a smaller fixed marketing subset when analytics is enabled.

Each event has a fresh UUID `eventId`, a per-route `pageViewId`, and a UUID `sessionId` stored in `sessionStorage`. Behavioral dimensions use fixed registries. Paths are normalized route templates and never contain a query string. Attribution keeps bounded UTM values, the referrer hostname, and hashed advertising click IDs; raw click IDs are not persisted. Phone numbers, OTPs, delivery fields, comments, chat text, arbitrary selectors, element text, and arbitrary form values cannot pass through the collector.

Phase 1 behavior events are active engagement milestones (5/15/30/60 seconds), scroll milestones (25/50/75/90%), section visibility, fixed CTA clicks, banner impressions/clicks, and product-card impressions/clicks. Time advances only while the document is visible and focused. Impressions require at least 50% visibility plus dwell time.

Delivery is best-effort and never blocks navigation or checkout. Events wait in a bounded in-memory queue during guest authentication and have capped retries. Page and product views are deduplicated to tolerate React StrictMode.

Users can disable “Аналитика использования” in Account. This writes `localStorage.flowie_analytics_opt_out=1`, clears queued behavioral events, and reloads so already initialized Webvisor/VK code is no longer bootstrapped. The collector also disables itself when Do Not Track (`navigator.doNotTrack`) or Global Privacy Control is enabled. Sensitive application screens use Webvisor content/key masking. Functional referral events (`ref_open` and `write_access_requested`) use the existing API path and are intentionally independent of this preference.

The browser never emits first-party `payment_success`; confirmed sales belong to the server. The sanitized analytics session and attribution are copied to `Order`, so trusted `order_created` and `payment_success` events remain in the same funnel. A client-side confirmed purchase is sent only to external pixels and is not a financial source of truth.
