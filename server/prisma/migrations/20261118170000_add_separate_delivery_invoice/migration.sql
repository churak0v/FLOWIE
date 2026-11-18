ALTER TABLE "Order"
  ALTER COLUMN "deliveryCost" DROP DEFAULT,
  ALTER COLUMN "deliveryCost" DROP NOT NULL,
  ALTER COLUMN "deliveryAddress" DROP NOT NULL,
  ADD COLUMN "askRecipientAddress" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "askRecipientTime" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'DETAILS_PENDING',
  ADD COLUMN "deliveryQuoteKey" VARCHAR(64),
  ADD COLUMN "deliveryQuoteDigest" VARCHAR(64);

-- Historical orders bundled delivery into their existing commercial flow. Preserve their ability
-- to progress without pretending that a new separate invoice exists.
UPDATE "Order" SET "deliveryStatus" = 'NOT_REQUIRED';

CREATE TABLE "DeliveryInvoice" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT '643',
  "status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
  "paymentChargeId" TEXT,
  "paymentMeta" TEXT,
  "paymentExpiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryInvoice_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "DeliveryInvoice_currency_rub" CHECK ("currency" = '643')
);

CREATE UNIQUE INDEX "DeliveryInvoice_orderId_key" ON "DeliveryInvoice"("orderId");
CREATE UNIQUE INDEX "DeliveryInvoice_paymentChargeId_key" ON "DeliveryInvoice"("paymentChargeId");
CREATE INDEX "DeliveryInvoice_status_paymentExpiresAt_idx" ON "DeliveryInvoice"("status", "paymentExpiresAt");
CREATE UNIQUE INDEX "Order_deliveryQuoteKey_key" ON "Order"("deliveryQuoteKey");

CREATE OR REPLACE FUNCTION "flowie_enforce_delivery_before_order_update"()
RETURNS trigger AS $$
DECLARE
  invoice_status TEXT;
BEGIN
  IF NEW."status" = 'IN_DELIVERY' AND OLD."status" IS DISTINCT FROM 'IN_DELIVERY' THEN
    IF NEW."deliveryStatus" NOT IN ('PAID', 'WAIVED', 'INCLUDED_IN_MAIN', 'NOT_REQUIRED') THEN
      RAISE EXCEPTION 'DELIVERY_PAYMENT_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."deliveryStatus" <> 'NOT_REQUIRED' AND (
      NEW."deliveryAddress" IS NULL OR btrim(NEW."deliveryAddress") = '' OR
      (NEW."askRecipientTime" AND (NEW."deliveryTime" IS NULL OR btrim(NEW."deliveryTime") = ''))
    ) THEN
      RAISE EXCEPTION 'DELIVERY_DETAILS_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."status" = 'CANCELLED' AND OLD."status" IS DISTINCT FROM 'CANCELLED' THEN
    SELECT "status" INTO invoice_status FROM "DeliveryInvoice" WHERE "orderId" = NEW."id";
    IF invoice_status = 'PAID' THEN
      NEW."deliveryStatus" := 'RECONCILIATION_REQUIRED';
      UPDATE "DeliveryInvoice"
      SET "status" = 'RECONCILIATION_REQUIRED', "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "orderId" = NEW."id";
    ELSE
      NEW."deliveryStatus" := 'CANCELLED';
      UPDATE "DeliveryInvoice"
      SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "orderId" = NEW."id";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "flowie_order_delivery_guard"
BEFORE UPDATE OF "status" ON "Order"
FOR EACH ROW
EXECUTE FUNCTION "flowie_enforce_delivery_before_order_update"();
