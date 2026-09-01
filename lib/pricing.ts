import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Recomputes Order.totalPriceCents from every PriceLine attached to it (item-level and
 * order-level combined). Call this inside the same transaction as any PriceLine
 * add/edit/delete, the same way lib/order-status.ts:recomputeOrderStatus is called
 * alongside item status changes — so the denormalized total can never drift from the
 * rows that make it up.
 */
export async function recomputeOrderTotal(orderId: string, tx: Prisma.TransactionClient = db) {
  const result = await tx.priceLine.aggregate({
    where: { orderId },
    _sum: { amountCents: true },
  });

  await tx.order.update({
    where: { id: orderId },
    data: { totalPriceCents: result._sum.amountCents ?? 0 },
  });
}
