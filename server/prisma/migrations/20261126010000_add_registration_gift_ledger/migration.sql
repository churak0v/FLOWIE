CREATE TABLE "RegistrationGiftLedger" (
  "id" TEXT NOT NULL,
  "campaignId" VARCHAR(80) NOT NULL,
  "userId" INTEGER NOT NULL,
  "verifiedPhone" VARCHAR(20),
  "giftName" VARCHAR(120) NOT NULL,
  "giftQuantity" INTEGER NOT NULL DEFAULT 1,
  "fulfillmentMode" VARCHAR(20) NOT NULL,
  "offerTitle" VARCHAR(100) NOT NULL,
  "offerBody" VARCHAR(240) NOT NULL,
  "offerTerms" VARCHAR(240),
  "termsVersion" VARCHAR(80) NOT NULL,
  "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "fulfilledById" INTEGER,
  "fulfillmentOrderId" INTEGER,
  "fulfillmentNote" VARCHAR(300),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationGiftLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationGiftLedger_campaignId_userId_key"
  ON "RegistrationGiftLedger"("campaignId", "userId");
CREATE UNIQUE INDEX "RegistrationGiftLedger_campaignId_verifiedPhone_key"
  ON "RegistrationGiftLedger"("campaignId", "verifiedPhone");
CREATE INDEX "RegistrationGiftLedger_claimedAt_fulfilledAt_idx"
  ON "RegistrationGiftLedger"("claimedAt", "fulfilledAt");
CREATE INDEX "RegistrationGiftLedger_verifiedPhone_idx"
  ON "RegistrationGiftLedger"("verifiedPhone");

ALTER TABLE "RegistrationGiftLedger"
  ADD CONSTRAINT "RegistrationGiftLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationGiftLedger"
  ADD CONSTRAINT "RegistrationGiftLedger_fulfilledById_fkey"
  FOREIGN KEY ("fulfilledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistrationGiftLedger"
  ADD CONSTRAINT "RegistrationGiftLedger_fulfillmentOrderId_fkey"
  FOREIGN KEY ("fulfillmentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
