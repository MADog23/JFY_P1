-- AlterTable: structured rush flag (was previously only expressible as freeform
-- price-line text, which can't be reliably counted/grouped).
ALTER TABLE "Order" ADD COLUMN "isRush" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: cycle-time tracking (set once, on first PENDING -> IN_PROGRESS) and
-- per-item work assignment (informational only — does not gate who can change an
-- item's status; see actions/items.ts).
ALTER TABLE "OrderItem" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "OrderItem" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "OrderItem_assignedToId_idx" ON "OrderItem"("assignedToId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
