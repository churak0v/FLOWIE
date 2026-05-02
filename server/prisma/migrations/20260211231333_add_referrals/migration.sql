-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "referralLinkId" INTEGER;

-- AlterTable
ALTER TABLE "Recipient" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralAt" TIMESTAMP(3),
ADD COLUMN     "referralLinkId" INTEGER,
ADD COLUMN     "referralSource" TEXT;

-- CreateTable
CREATE TABLE "ReferralLink" (
    "id" SERIAL NOT NULL,
    "tag" TEXT NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralOpen" (
    "id" SERIAL NOT NULL,
    "referralLinkId" INTEGER NOT NULL,
    "userId" INTEGER,
    "source" TEXT,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralOpen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_tag_key" ON "ReferralLink"("tag");

-- CreateIndex
CREATE INDEX "ReferralLink_createdAt_idx" ON "ReferralLink"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralOpen_referralLinkId_createdAt_idx" ON "ReferralOpen"("referralLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralOpen_userId_createdAt_idx" ON "ReferralOpen"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_courierId_idx" ON "Order"("courierId");

-- CreateIndex
CREATE INDEX "Order_referralLinkId_createdAt_idx" ON "Order"("referralLinkId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralOpen" ADD CONSTRAINT "ReferralOpen_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralOpen" ADD CONSTRAINT "ReferralOpen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

