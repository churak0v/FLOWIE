# Registration gift and home discovery release

Owner authorized Raffaello150g (one box) with the first order after registration. No minimum purchase or expiration was introduced. Price of the gift is unpriced internally, never assumed as zero procurement cost.

The offer is server-controlled and disabled by default. Explicit deployment configuration enables it. Home places it after the first five products and collage card; ProductDetails has a compact version. CTA records exposure before opening the existing OTP sheet. Real visibility also records exposure after >=50% for1s. Exposure includes placement and an immutable offer/terms/version snapshot.

First phone verification claims the recorded offer once; existing verified accounts cannot claim by logging in again. Account reads server-owned obligation even if the campaign is disabled later. Payment before registration cannot consume it; the first confirmed, non-cancelled payment after claim is eligible. Cancellations leave it outstanding. No gift is marked fulfilled automatically on registration/payment.

Managers see the gift in the automatic first eligible paid-order Telegram notification. Staff IDs are explicitly allowlisted. The button «Подарок передан» records fulfillment only after delivery; replay is idempotent. Staff queue API is /api/admin/registration-gifts; order-specific endpoint and audit note are available. No manual messages are sent during release verification.

Additive migration creates RegistrationGiftLedger. Back up DB/uploads first. Run scripts/production/verify-registration-gift-rollback.cjs via stdin in the new API image after migration: negative-ID fixtures are rolled back, no real SMS/payment/Telegram actions. Then activate web/API with independent immutable tags, retain previous hashed web chunks, restart edge and verify public status and health.

Home rubrics now contain five products plus a sixth2×2 collage card. The destination preserves budget/rose filters; collage thumbnails do not consume inventory positions. Rose matching excludes pink-color adjectives on other flowers.
