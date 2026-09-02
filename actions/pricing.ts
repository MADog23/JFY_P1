"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recomputeOrderTotal } from "@/lib/pricing";
import type { ActionResult } from "./auth";

// MANAGER ONLY, no exceptions: every mutation in this file. The one and only place an
// employee is allowed to write a PriceLine is createIntakeTicket (actions/orders.ts),
// at ticket-creation time. Once the order exists, pricing becomes a manager-only
// surface for both editing AND viewing — see actions/orders.ts:getOrderDetail for the
// read-side redaction that keeps these rows out of an employee's order page entirely.

function revalidateOrder(orderId: string) {
  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  revalidatePath("/manager/analytics");
}

const lineSchema = z.object({
  description: z.string().min(1, "Description is required."),
  amountCents: z.number().int().min(0, "Amount can't be negative."),
});

export async function addPriceLine(
  orderId: string,
  orderItemId: string | null,
  description: string,
  amountCents: number
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = lineSchema.safeParse({ description, amountCents });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "CANCELLED") return { ok: false, error: "This order is cancelled." };

  if (orderItemId) {
    const item = await db.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item || item.orderId !== orderId) return { ok: false, error: "Item not found on this order." };
    if (item.removedAt) return { ok: false, error: "This item has been removed." };
  }

  await db.$transaction(async (tx) => {
    await tx.priceLine.create({
      data: {
        orderId,
        orderItemId,
        description: parsed.data.description.trim(),
        amountCents: parsed.data.amountCents,
        source: "FREEFORM",
        createdById: session.userId,
      },
    });
    await recomputeOrderTotal(orderId, tx);
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "PRICE_LINE_ADDED",
        summary: `Price line "${parsed.data.description.trim()}" ($${(parsed.data.amountCents / 100).toFixed(2)}) added to ${order.orderNumber} by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidateOrder(orderId);
  return { ok: true };
}

export async function updatePriceLine(
  priceLineId: string,
  description: string,
  amountCents: number
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = lineSchema.safeParse({ description, amountCents });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await db.priceLine.findUnique({ where: { id: priceLineId } });
  if (!existing) return { ok: false, error: "Price line not found." };

  await db.$transaction(async (tx) => {
    await tx.priceLine.update({
      where: { id: priceLineId },
      data: {
        description: parsed.data.description.trim(),
        amountCents: parsed.data.amountCents,
        updatedById: session.userId,
      },
    });
    await recomputeOrderTotal(existing.orderId, tx);
    await logAudit(
      {
        orderId: existing.orderId,
        entityType: "ORDER",
        entityId: existing.orderId,
        action: "PRICE_LINE_EDITED",
        summary: `Price line "${existing.description}" changed to "${parsed.data.description.trim()}" ($${(parsed.data.amountCents / 100).toFixed(2)}) by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidateOrder(existing.orderId);
  return { ok: true };
}

export async function deletePriceLine(priceLineId: string): Promise<ActionResult> {
  const session = await requireManager();
  const existing = await db.priceLine.findUnique({ where: { id: priceLineId } });
  if (!existing) return { ok: false, error: "Price line not found." };

  await db.$transaction(async (tx) => {
    await tx.priceLine.delete({ where: { id: priceLineId } });
    await recomputeOrderTotal(existing.orderId, tx);
    await logAudit(
      {
        orderId: existing.orderId,
        entityType: "ORDER",
        entityId: existing.orderId,
        action: "PRICE_LINE_DELETED",
        summary: `Price line "${existing.description}" ($${(existing.amountCents / 100).toFixed(2)}) removed by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidateOrder(existing.orderId);
  return { ok: true };
}
