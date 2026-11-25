ALTER TABLE "AnalyticsEvent"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sessionId" VARCHAR(96),
  ADD COLUMN "pageViewId" VARCHAR(96),
  ADD COLUMN "routeKey" VARCHAR(64);

UPDATE "AnalyticsEvent"
SET "sessionId" = "meta"->>'sessionId'
WHERE "sessionId" IS NULL
  AND "meta"->>'sessionId' ~ '^[A-Za-z0-9._:-]{8,96}$';

CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");
CREATE INDEX "AnalyticsEvent_event_routeKey_createdAt_idx" ON "AnalyticsEvent"("event", "routeKey", "createdAt");
CREATE INDEX "AnalyticsEvent_productId_event_createdAt_idx" ON "AnalyticsEvent"("productId", "event", "createdAt");

ALTER TABLE "Order"
  ADD COLUMN "analyticsSessionId" VARCHAR(96),
  ADD COLUMN "analyticsAttribution" JSONB;

CREATE INDEX "Order_analyticsSessionId_idx" ON "Order"("analyticsSessionId");
