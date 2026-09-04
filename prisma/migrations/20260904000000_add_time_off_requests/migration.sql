-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateTable: vacation/time-off requests (Phase 2, gated behind PHASE2_ENABLED same as
-- Punch/Shift) — an employee requests a range of days off as paid or unpaid, a manager
-- approves or denies it. Nothing is ever deleted, only moved through "status".
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TimeOffRequest_userId_startDate_idx" ON "TimeOffRequest"("userId", "startDate");
CREATE INDEX "TimeOffRequest_status_idx" ON "TimeOffRequest"("status");

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
