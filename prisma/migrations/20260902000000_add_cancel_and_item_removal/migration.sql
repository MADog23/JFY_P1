-- AlterEnum: soft-cancel for an order that should never have existed (duplicate
-- intake, wrong client, a test ticket). See prisma/schema.prisma's OrderStatus comment
-- and actions/orders.ts:cancelOrder/uncancelOrder.
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable: soft-removal for an item added entirely by mistake. See
-- prisma/schema.prisma's OrderItem.removedAt comment and actions/items.ts:removeItem/
-- restoreItem.
ALTER TABLE "OrderItem" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "OrderItem" ADD COLUMN "removedById" TEXT;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
