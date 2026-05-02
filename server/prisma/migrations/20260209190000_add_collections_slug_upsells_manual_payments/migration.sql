-- Add product upsells fields.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "isUpsell" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "upsellSort" INTEGER NOT NULL DEFAULT 0;

-- Add collection slug.
ALTER TABLE "Collection"
  ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill slugs for existing collections.
UPDATE "Collection"
SET "slug" = CONCAT('c', "id"::text)
WHERE "slug" IS NULL OR "slug" = '';

-- Enforce not-null + uniqueness (after backfill).
ALTER TABLE "Collection"
  ALTER COLUMN "slug" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Collection_slug_key'
  ) THEN
    CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
  END IF;
END$$;

-- Manual payment fields on orders.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "paymentExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentClientConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "senderPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "consentPersonal" BOOLEAN NOT NULL DEFAULT false;
