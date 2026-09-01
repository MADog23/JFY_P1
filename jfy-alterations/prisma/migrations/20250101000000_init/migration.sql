-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER');
CREATE TYPE "OrderStatus" AS ENUM ('IN_PROGRESS', 'SEALED', 'PICKED_UP');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'PAID');
CREATE TYPE "ItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PICKED_UP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pinHash" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT,
    "pickupContactName" TEXT,
    "pickupContactPhone" TEXT,
    "dueDate" TIMESTAMP(3),
    "generalNotes" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "clientToken" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3),
    "sealedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_clientToken_key" ON "Order"("clientToken");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_clientName_idx" ON "Order"("clientName");

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "garmentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "alterations" TEXT[],
    "alterationsCustom" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_status_idx" ON "OrderItem"("status");

-- CreateTable
CREATE TABLE "ItemNote" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemNote_orderItemId_idx" ON "ItemNote"("orderItemId");

-- CreateTable
CREATE TABLE "ItemMeasurement" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemMeasurement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemMeasurement_orderItemId_idx" ON "ItemMeasurement"("orderItemId");

-- CreateTable
CREATE TABLE "ItemImage" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "url" TEXT,
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemImage_orderItemId_idx" ON "ItemImage"("orderItemId");

-- CreateTable
CREATE TABLE "ItemPickup" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "pickedUpByName" TEXT NOT NULL,
    "pickedUpByPhone" TEXT,
    "authorizedById" TEXT NOT NULL,
    "pickedUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemPickup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ItemPickup_orderItemId_key" ON "ItemPickup"("orderItemId");

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_orderId_idx" ON "AuditLog"("orderId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateTable
CREATE TABLE "GarmentTypeOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GarmentTypeOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GarmentTypeOption_label_key" ON "GarmentTypeOption"("label");

-- CreateTable
CREATE TABLE "AlterationTypeOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AlterationTypeOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlterationTypeOption_label_key" ON "AlterationTypeOption"("label");

-- CreateTable
CREATE TABLE "OrderCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemMeasurement" ADD CONSTRAINT "ItemMeasurement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemMeasurement" ADD CONSTRAINT "ItemMeasurement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPickup" ADD CONSTRAINT "ItemPickup_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemPickup" ADD CONSTRAINT "ItemPickup_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
