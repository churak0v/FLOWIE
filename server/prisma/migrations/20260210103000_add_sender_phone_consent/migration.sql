-- Add sender phone and consent flags on orders
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "senderPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "consentPersonal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paymentClientConfirmed" BOOLEAN NOT NULL DEFAULT false;
