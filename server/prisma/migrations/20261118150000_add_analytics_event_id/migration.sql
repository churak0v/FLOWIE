ALTER TABLE "AnalyticsEvent"
ADD COLUMN "eventId" VARCHAR(96);

CREATE UNIQUE INDEX "AnalyticsEvent_eventId_key" ON "AnalyticsEvent"("eventId");
