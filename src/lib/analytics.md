# First-party analytics

FLOWIE sends a small allowlisted set of interaction events to its own `POST /api/events` endpoint. There are no third-party counters, advertising pixels, session replay, or screen recording.

Each event has a fresh UUID `eventId` and a UUID `sessionId` stored in `sessionStorage`. Only event-specific IDs and allowlisted metadata are accepted. Paths never contain the URL query string; attribution keeps only `utm_source`, `utm_medium`, `utm_campaign`, and the referrer's hostname. Phone numbers, OTPs, delivery fields, comments, chat text, and arbitrary form values cannot pass through the collector.

Delivery is best-effort and never blocks navigation or checkout. Events wait in a bounded in-memory queue during guest authentication and have capped retries. Page and product views are deduplicated to tolerate React StrictMode.

Users can disable “Аналитика использования” in Account. This writes `localStorage.flowie_analytics_opt_out=1` and immediately clears queued behavioral events. The collector also disables itself when Do Not Track (`navigator.doNotTrack`) or Global Privacy Control is enabled. Functional referral events (`ref_open` and `write_access_requested`) use the existing API path and are intentionally independent of this preference.

The browser never emits `payment_success`; confirmed sales belong to the server.
