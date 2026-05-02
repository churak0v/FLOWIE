-- Add courier assignment and delivered timestamp
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "courierId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE SET NULL;
