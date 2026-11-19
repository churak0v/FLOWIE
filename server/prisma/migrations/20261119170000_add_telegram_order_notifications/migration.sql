CREATE TABLE "TelegramOrderNotification" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "chatId" VARCHAR(32) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramOrderNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramOrderNotification_orderId_event_chatId_key"
ON "TelegramOrderNotification"("orderId", "event", "chatId");

CREATE INDEX "TelegramOrderNotification_status_nextAttemptAt_idx"
ON "TelegramOrderNotification"("status", "nextAttemptAt");

ALTER TABLE "TelegramOrderNotification"
ADD CONSTRAINT "TelegramOrderNotification_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
