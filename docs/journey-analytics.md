# Journey analytics contract

The storefront records cumulative active-time snapshots, not elapsed wall-clock
time. A page is active only while its document is visible and its window is
focused. A named section is active only while the page is active and at least
one element bearing its fixed `data-analytics-section` key intersects the
viewport.

`page_engagement` and `section_engagement` carry `activeMs` and a fixed
`reason` in `meta`; section snapshots also carry `sectionKey`. `pageViewId` and
`routeKey` remain top-level fields. A heartbeat is emitted every ten seconds,
and lifecycle snapshots are emitted for route leave, page hide, blur,
visibility loss and unload. Delivery retries retain the original `eventId`;
later snapshots receive a new ID.

The admin report uses the maximum cumulative `activeMs` for each
session/page-view/section key. It never sums heartbeat rows, so duplicate,
retried or out-of-order smaller snapshots cannot inflate time. Historical page
views without snapshots remain explicitly unmeasured. Section durations can
overlap and therefore are not additive.

Legacy 5/15/30/60-second milestones and 25/50/75/90 scroll milestones remain
for compatibility. Input remains behind the existing DNT/GPC/opt-out checks.
The metadata allowlist rejects free-form text, phone numbers, addresses and
coordinates; only fixed route, section and reason values plus bounded integer
time are accepted.

The journey report is read-only and limited to the existing 7- or 30-day
window and 50,000-event cap. Staff traffic is reported separately as excluded
QA traffic. Its ordered funnel uses known session IDs and ends only at the
trusted server `payment_success` event / confirmed-order finance records.
Preceding banner, section and product exposures are associations only: they do
not establish causal influence, visitor identity or advertising incrementality.
Visits are not people, elapsed time is not active time, and no missing
historical values are inferred.

The phone-auth path adds three first-party-only observations: `auth_open` for
each newly opened login sheet, `auth_code_requested` only after the OTP request
API succeeds, and `auth_verified` only after the verification API succeeds and
a subsequent `/auth/me` response confirms `phoneVerified`. These events contain
only the shared session, page-view, route and bounded attribution fields. They
never contain a phone number, OTP, name or form value and are not forwarded to
VK or Yandex goals. `auth_verified` means a successful phone authentication; it
does not distinguish a new registration from an existing-user login and must
not drive gift, payment or other financial decisions.
