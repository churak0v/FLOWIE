CREATE TABLE "DeliveryZone" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(80) NOT NULL,
  "price" INTEGER,
  "conditions" VARCHAR(500) NOT NULL DEFAULT '',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "polygon" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_price_check" CHECK ("price" IS NULL OR "price" BETWEEN 0 AND 100000),
  CONSTRAINT "DeliveryZone_priority_check" CHECK ("priority" BETWEEN 0 AND 1000),
  CONSTRAINT "DeliveryZone_active_check" CHECK (NOT "active" OR ("price" IS NOT NULL AND jsonb_array_length("polygon") >= 3))
);
CREATE INDEX "DeliveryZone_active_priority_idx" ON "DeliveryZone"("active", "priority");

CREATE TABLE "DeliverySettings" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "mode" VARCHAR(10) NOT NULL DEFAULT 'flat' CHECK ("mode" IN ('flat', 'zones')),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
