import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Recomputes an Order's status from the status of its items. This is the single
 * source of truth for the seal/reopen/pickup lifecycle so that no code path can
 * accidentally leave an order sealed when work has reopened, or unsealed when it
 * shouldn't be:
 *
 *  - Any item PENDING or IN_PROGRESS            -> order IN_PROGRESS
 *  - Every item COMPLETED or PICKED_UP (mixed)   -> order SEALED
 *  - Every item PICKED_UP                        -> order PICKED_UP
 *
 * Call this inside the same transaction as any item status change.
 */
export async function recomputeOrderStatus(
  orderId: string,
  tx: Prisma.TransactionClient = db
) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
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
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { sealedAt: true } });
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "SEALED",
        sealedAt: order?.sealedAt ?? new Date(),
      },
    });
  } else {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "IN_PROGRESS", sealedAt: null, sealedById: null },
    });
  }
}
