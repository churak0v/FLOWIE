CREATE TABLE "StaffCredential" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "login" VARCHAR(64) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffCredential_userId_key" ON "StaffCredential"("userId");
CREATE UNIQUE INDEX "StaffCredential_login_key" ON "StaffCredential"("login");

ALTER TABLE "StaffCredential"
ADD CONSTRAINT "StaffCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
