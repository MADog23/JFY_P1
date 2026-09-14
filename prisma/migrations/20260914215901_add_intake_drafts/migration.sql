-- DropIndex
DROP INDEX "Order_clientEmail_trgm_idx";

-- DropIndex
DROP INDEX "Order_clientName_trgm_idx";

-- DropIndex
DROP INDEX "Order_clientPhone_trgm_idx";

-- DropIndex
DROP INDEX "Order_orderNumber_trgm_idx";

-- DropIndex
DROP INDEX "Order_pickupContactName_trgm_idx";

-- DropIndex
DROP INDEX "Order_pickupContactPhone_trgm_idx";

-- CreateTable
CREATE TABLE "IntakeDraft" (
    "id" TEXT NOT NULL,
    "formState" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeDraft_updatedAt_idx" ON "IntakeDraft"("updatedAt");

-- AddForeignKey
ALTER TABLE "IntakeDraft" ADD CONSTRAINT "IntakeDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeDraft" ADD CONSTRAINT "IntakeDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
