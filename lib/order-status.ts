import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Recomputes an Order's status from the status of its (non-removed) items. This is the
 * single source of truth for the seal/reopen/pickup lifecycle so that no code path can
 * accidentally leave an order sealed when work has reopened, or unsealed when it
 * shouldn't be:
 *
 *  - Any item PENDING or IN_PROGRESS            -> order IN_PROGRESS
 *  - Every item COMPLETED or PICKED_UP (mixed)   -> order SEALED
 *  - Every item PICKED_UP                        -> order PICKED_UP
 *
 * A soft-removed item (OrderItem.removedAt, see actions/items.ts:removeItem) never
 * counts toward any of this — it's excluded from the query below entirely, the same way
 * it's excluded from the public tracking page and analytics.
 *
 * CANCELLED is NOT part of this derivation and is deliberately sticky: a cancelled
 * order (actions/orders.ts:cancelOrder) stays CANCELLED regardless of what its items are
 * doing, so this bails out immediately rather than silently un-cancelling an order the
 * moment someone touches one of its items. Only uncancelOrder calls this function to
 * intentionally recompute a fresh status from current item state.
 *
 * Call this inside the same transaction as any item status/removal change.
 */
export async function recomputeOrderStatus(
  orderId: string,
  tx: Prisma.TransactionClient = db
) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, sealedAt: true } });
  if (!order || order.status === "CANCELLED") return;

  const items = await tx.orderItem.findMany({
    where: { orderId, removedAt: null },
    select: { status: true },
  });

  if (items.length === 0) return;

  const allPickedUp = items.every((i) => i.status === "PICKED_UP");
  const allDone = items.every((i) => i.status === "COMPLETED" || i.status === "PICKED_UP");

  if (allPickedUp) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "PICKED_UP" },
    });
  } else if (allDone) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "SEALED",
        sealedAt: order.sealedAt ?? new Date(),
      },
    });
  } else {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "IN_PROGRESS", sealedAt: null, sealedById: null },
    });
  }
}
