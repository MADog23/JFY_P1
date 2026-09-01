-- CreateEnum
CREATE TYPE "PriceLineSource" AS ENUM ('ALTERATION', 'CUSTOM_INSTRUCTIONS', 'FREEFORM');

-- AlterTable: denormalized total, visible to employees even though the itemized
-- PriceLine rows themselves are redacted for them once an order exists.
ALTER TABLE "Order" ADD COLUMN "totalPriceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PriceLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "source" "PriceLineSource" NOT NULL DEFAULT 'FREEFORM',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceLine_orderId_idx" ON "PriceLine"("orderId");
CREATE INDEX "PriceLine_orderItemId_idx" ON "PriceLine"("orderItemId");

-- AddForeignKey
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
