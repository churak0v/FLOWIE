CREATE TABLE "BouquetImportBatch" (
  "id" TEXT PRIMARY KEY, "chatId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COLLECTING', "state" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BouquetImportBatch_chatId_userId_status_idx" ON "BouquetImportBatch"("chatId", "userId", "status");
CREATE TABLE "BouquetImportUpdate" ("updateId" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "FlowerPurchasePrice" (
  "id" TEXT PRIMARY KEY, "supplierId" TEXT NOT NULL, "ingredientId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "unit" TEXT NOT NULL, "priceKopecks" INTEGER NOT NULL CHECK ("priceKopecks" >= 0),
  "effectiveAt" TIMESTAMP(3) NOT NULL, "source" TEXT NOT NULL, "confirmed" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FlowerPurchasePrice_supplierId_ingredientId_unit_effectiveAt_idx" ON "FlowerPurchasePrice"("supplierId", "ingredientId", "unit", "effectiveAt");
CREATE TABLE "BouquetRecipe" (
  "id" TEXT PRIMARY KEY, "productId" INTEGER REFERENCES "Product"("id") ON DELETE SET NULL,
  "importId" TEXT REFERENCES "BouquetImportBatch"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL, "lines" JSONB NOT NULL, "costs" JSONB NOT NULL, "snapshot" JSONB,
  "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "BouquetRecipe_productId_key" ON "BouquetRecipe"("productId");
