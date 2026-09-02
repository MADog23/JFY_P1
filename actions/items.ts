"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recomputeOrderStatus } from "@/lib/order-status";
import type { ActionResult } from "./auth";

function revalidateOrder(orderId: string) {
  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  revalidatePath("/manager");
  revalidatePath("/employee");
}

/** MANAGER ONLY: adds an item to an already-created intake ticket (e.g. a garment was missed). */
export async function addItemToOrder(
  orderId: string,
  item: { garmentType: string; description: string; alterations: string[]; alterationsCustom?: string }
): Promise<ActionResult> {
  const session = await requireManager();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  const created = await db.orderItem.create({
    data: {
      orderId,
      garmentType: item.garmentType,
      description: item.description,
      alterations: item.alterations,
      alterationsCustom: item.alterationsCustom || null,
    },
  });

  await db.$transaction((tx) => recomputeOrderStatus(orderId, tx));

  await logAudit({
    orderId,
    entityType: "ORDER_ITEM",
    entityId: created.id,
    action: "ITEM_ADDED",
    summary: `Item "${item.description}" (${item.garmentType}) added to ${order.orderNumber} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(orderId);
  return { ok: true };
}

const itemEditSchema = z.object({
  itemId: z.string(),
  garmentType: z.string().min(1),
  description: z.string().min(1),
  alterations: z.array(z.string()).default([]),
  alterationsCustom: z.string().optional(),
});

/** MANAGER ONLY: edits the locked intake identity of a single item. */
export async function updateItemIntake(raw: z.infer<typeof itemEditSchema>): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = itemEditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid data." };
  const data = parsed.data;

  const before = await db.orderItem.findUnique({ where: { id: data.itemId } });
  if (!before) return { ok: false, error: "Item not found." };

  await db.orderItem.update({
    where: { id: data.itemId },
    data: {
      garmentType: data.garmentType,
      description: data.description,
      alterations: data.alterations,
      alterationsCustom: data.alterationsCustom || null,
    },
  });

  await logAudit({
    orderId: before.orderId,
    entityType: "ORDER_ITEM",
    entityId: before.id,
    action: "ITEM_INTAKE_EDITED",
    summary: `Item details for "${before.description}" edited by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(before.orderId);
  return { ok: true };
}

/** Employee or manager: PENDING -> IN_PROGRESS -> COMPLETED. Completing locks the item. */
export async function setItemStatus(
  itemId: string,
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
): Promise<ActionResult> {
  const session = await requireSession();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status === "COMPLETED" || item.status === "PICKED_UP") {
    return { ok: false, error: "This item is locked. A manager needs to reopen it first." };
  }

  await db.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
        completedById: status === "COMPLETED" ? session.userId : null,
        // First time this item is actually started, for cycle-time analytics — never
        // overwritten on a later reopen (that's a resumption, not a first start).
        ...(status === "IN_PROGRESS" && !item.startedAt ? { startedAt: new Date() } : {}),
      },
    });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "STATUS_CHANGE",
    summary: `"${item.description}" marked ${status.replace("_", " ").toLowerCase()} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** MANAGER ONLY: reopens a completed item (and un-seals the order if it had sealed). */
export async function reopenItem(itemId: string): Promise<ActionResult> {
  const session = await requireManager();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status === "PICKED_UP") {
    return { ok: false, error: "This item has already been picked up and can't be reopened." };
  }

  await db.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        status: "IN_PROGRESS",
        completedAt: null,
        completedById: null,
        reopenedAt: new Date(),
        reopenedById: session.userId,
      },
    });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_REOPENED",
    summary: `"${item.description}" reopened for more work by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/**
 * MANAGER ONLY: soft-removes an item added entirely by mistake (duplicate, wrong
 * garment) — see OrderItem.removedAt in schema.prisma. Only allowed while the item is
 * still PENDING or IN_PROGRESS: once it's COMPLETED or PICKED_UP it's real operational
 * history, not a data-entry mistake, and updateItemIntake is the right tool to fix its
 * details instead. Also refuses to remove the last remaining (non-removed) item on an
 * order — recomputeOrderStatus has nothing to derive a status from with zero items, and
 * an order with none left doesn't make sense; cancel the whole order instead.
 */
export async function removeItem(itemId: string, reason?: string): Promise<ActionResult> {
  const session = await requireManager();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.removedAt) return { ok: true };
  if (item.status === "COMPLETED" || item.status === "PICKED_UP") {
    return { ok: false, error: "This item has already been worked — edit its details instead of removing it." };
  }

  const remainingCount = await db.orderItem.count({
    where: { orderId: item.orderId, removedAt: null, id: { not: itemId } },
  });
  if (remainingCount === 0) {
    return { ok: false, error: "Can't remove the last item on an order — cancel the whole order instead." };
  }

  await db.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: { removedAt: new Date(), removedById: session.userId },
    });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_REMOVED",
    summary: `"${item.description}" (${item.garmentType}) removed by ${session.name}${reason?.trim() ? ` — ${reason.trim()}` : ""}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** MANAGER ONLY: undoes an accidental item removal. */
export async function restoreItem(itemId: string): Promise<ActionResult> {
  const session = await requireManager();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!item.removedAt) return { ok: false, error: "This item hasn't been removed." };

  await db.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: { removedAt: null, removedById: null },
    });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_RESTORED",
    summary: `"${item.description}" restored by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** Employee or manager: append-only working-profile note. */
export async function addItemNote(itemId: string, body: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!body.trim()) return { ok: false, error: "Note can't be empty." };

  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };

  await db.itemNote.create({
    data: { orderItemId: itemId, authorId: session.userId, body: body.trim() },
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "NOTE_ADDED",
    summary: `Note added to "${item.description}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/**
 * Fixes a note that was entered wrong (typo, wrong measurement jotted down, wrong
 * item's info) — see the ItemNote model comment in schema.prisma for why notes are
 * otherwise append-only. The original author's name and the note's original createdAt
 * are left as-is (this is a correction, not a re-authoring).
 *
 * Who can do this: the note's own author, or any manager — never a different
 * employee's note. This is deliberately NOT a free edit even for the author: every
 * edit is audit-logged with the note's previous text in the summary (`was: "..."`),
 * so nothing can be silently rewritten — the log always keeps what it used to say,
 * who changed it, and when, which is the actual property the append-only design was
 * protecting. Letting the author fix their own typo without flagging down a manager
 * doesn't cost that; it only removes the requirement that someone *else* sign off on
 * a self-correction.
 */
export async function editItemNote(noteId: string, body: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!body.trim()) return { ok: false, error: "Note can't be empty." };

  const note = await db.itemNote.findUnique({ where: { id: noteId }, include: { orderItem: true } });
  if (!note) return { ok: false, error: "Note not found." };
  if (session.role !== "MANAGER" && note.authorId !== session.userId) {
    return { ok: false, error: "You can only edit your own notes." };
  }

  await db.itemNote.update({ where: { id: noteId }, data: { body: body.trim() } });

  await logAudit({
    orderId: note.orderItem.orderId,
    entityType: "ORDER_ITEM",
    entityId: note.orderItemId,
    action: "NOTE_EDITED",
    summary: `Note on "${note.orderItem.description}" corrected by ${session.name} (was: "${note.body}").`,
    performedById: session.userId,
  });

  revalidateOrder(note.orderItem.orderId);
  return { ok: true };
}

/** Removes a note added in error — the note's own author, or any manager (never a
 * different employee's note; see editItemNote just above for the same reasoning).
 * The audit log entry from when it was originally added is untouched, and the
 * deletion itself is logged with the note's text, so there's still a full record it
 * once existed and who removed it. */
export async function deleteItemNote(noteId: string): Promise<ActionResult> {
  const session = await requireSession();
  const note = await db.itemNote.findUnique({ where: { id: noteId }, include: { orderItem: true } });
  if (!note) return { ok: false, error: "Note not found." };
  if (session.role !== "MANAGER" && note.authorId !== session.userId) {
    return { ok: false, error: "You can only delete your own notes." };
  }

  await db.itemNote.delete({ where: { id: noteId } });

  await logAudit({
    orderId: note.orderItem.orderId,
    entityType: "ORDER_ITEM",
    entityId: note.orderItemId,
    action: "NOTE_DELETED",
    summary: `Note "${note.body}" removed from "${note.orderItem.description}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(note.orderItem.orderId);
  return { ok: true };
}

/** Employee or manager: add or update a measurement value. */
export async function upsertMeasurement(
  itemId: string,
  label: string,
  value: string,
  measurementId?: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!label.trim() || !value.trim()) return { ok: false, error: "Label and value are required." };

  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };

  if (measurementId) {
    await db.itemMeasurement.update({
      where: { id: measurementId },
      data: { label: label.trim(), value: value.trim(), updatedById: session.userId },
    });
  } else {
    await db.itemMeasurement.create({
      data: {
        orderItemId: itemId,
        label: label.trim(),
        value: value.trim(),
        updatedById: session.userId,
      },
    });
  }

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "MEASUREMENT_SAVED",
    summary: `Measurement "${label.trim()}" set to "${value.trim()}" on "${item.description}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** Employee or manager: removes a measurement that was added in error. */
export async function deleteMeasurement(measurementId: string): Promise<ActionResult> {
  const session = await requireSession();
  const measurement = await db.itemMeasurement.findUnique({
    where: { id: measurementId },
    include: { orderItem: true },
  });
  if (!measurement) return { ok: false, error: "Measurement not found." };

  await db.itemMeasurement.delete({ where: { id: measurementId } });

  await logAudit({
    orderId: measurement.orderItem.orderId,
    entityType: "ORDER_ITEM",
    entityId: measurement.orderItemId,
    action: "MEASUREMENT_DELETED",
    summary: `Measurement "${measurement.label}" (was "${measurement.value}") removed from "${measurement.orderItem.description}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(measurement.orderItem.orderId);
  return { ok: true };
}

/**
 * Employee or manager: records that a photo was captured. `url` is intentionally left
 * null in Phase 1 — see lib/images.ts for how to wire this up to real cloud storage
 * later without changing the schema or this action's signature.
 */
export async function addImagePlaceholder(itemId: string, caption?: string): Promise<ActionResult> {
  const session = await requireSession();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };

  await db.itemImage.create({
    data: { orderItemId: itemId, url: null, caption: caption || null, uploadedById: session.userId },
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "IMAGE_LOGGED",
    summary: `Photo placeholder logged for "${item.description}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/**
 * Employee or manager: authorizes pickup of a single completed item. Because this
 * operates per item, "partial pickup" (some items of an order picked up, others not)
 * and "order pickup" (every item eventually picked up, one at a time) both fall out
 * of this same action — there's no separate order-level pickup action, an order is
 * "picked up" once recomputeOrderStatus sees every item as PICKED_UP.
 */
export async function authorizeItemPickup(
  itemId: string,
  pickedUpByName: string,
  pickedUpByPhone?: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!pickedUpByName.trim()) return { ok: false, error: "Enter who is picking up this item." };

  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status !== "COMPLETED") {
    return { ok: false, error: "Only completed items can be picked up." };
  }

  await db.$transaction(async (tx) => {
    await tx.itemPickup.create({
      data: {
        orderItemId: itemId,
        pickedUpByName: pickedUpByName.trim(),
        pickedUpByPhone: pickedUpByPhone?.trim() || null,
        authorizedById: session.userId,
      },
    });
    await tx.orderItem.update({ where: { id: itemId }, data: { status: "PICKED_UP" } });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "PICKUP_AUTHORIZED",
    summary: `"${item.description}" picked up by ${pickedUpByName.trim()}, authorized by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/**
 * MANAGER ONLY: undoes an accidental pickup — puts the item back to COMPLETED (its
 * state just before pickup) and removes the pickup record. The original pickup is
 * still visible in the order's activity log (the PICKUP_AUTHORIZED entry is never
 * deleted), so there's no loss of history, just a corrected current state.
 */
export async function undoItemPickup(itemId: string): Promise<ActionResult> {
  const session = await requireManager();
  const item = await db.orderItem.findUnique({ where: { id: itemId }, include: { pickup: true } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status !== "PICKED_UP" || !item.pickup) {
    return { ok: false, error: "This item hasn't been picked up." };
  }

  const wasPickedUpBy = item.pickup.pickedUpByName;

  await db.$transaction(async (tx) => {
    await tx.itemPickup.delete({ where: { orderItemId: itemId } });
    await tx.orderItem.update({ where: { id: itemId }, data: { status: "COMPLETED" } });
    await recomputeOrderStatus(item.orderId, tx);
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "PICKUP_UNDONE",
    summary: `Pickup of "${item.description}" (was picked up by ${wasPickedUpBy}) undone by ${session.name}. Item is back to completed.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/**
 * ASSIGNMENT — informational only. This labels who's responsible for an item (for
 * accountability and the workload analytics) but never gates who can start/complete
 * it — setItemStatus/reopenItem/authorizeItemPickup all still accept any signed-in
 * employee or manager regardless of assignedToId, unchanged. Three entry points:
 *   - claimItem:   employee or manager, self-assign, only if currently unassigned
 *   - assignItem:  MANAGER ONLY, assign/reassign to any active staff member
 *   - releaseItem: the assignee themselves, or any manager, clears the assignment
 */

/** Employee or manager: claims an unassigned item for themselves. */
export async function claimItem(itemId: string): Promise<ActionResult> {
  const session = await requireSession();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status === "COMPLETED" || item.status === "PICKED_UP") {
    return { ok: false, error: "This item is already done — nothing to pick up." };
  }
  if (item.assignedToId) {
    return { ok: false, error: "This item is already assigned to someone else." };
  }

  await db.orderItem.update({
    where: { id: itemId },
    data: { assignedToId: session.userId, assignedById: session.userId, assignedAt: new Date() },
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_ASSIGNED",
    summary: `"${item.description}" picked up by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** MANAGER ONLY: assigns (or reassigns) an item to a specific active employee or manager. */
export async function assignItem(itemId: string, assigneeId: string): Promise<ActionResult> {
  const session = await requireManager();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status === "COMPLETED" || item.status === "PICKED_UP") {
    return { ok: false, error: "This item is already done — nothing to assign." };
  }

  const assignee = await db.user.findUnique({ where: { id: assigneeId } });
  if (!assignee || !assignee.active) return { ok: false, error: "That staff member isn't available." };

  await db.orderItem.update({
    where: { id: itemId },
    data: { assignedToId: assignee.id, assignedById: session.userId, assignedAt: new Date() },
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_ASSIGNED",
    summary: `"${item.description}" assigned to ${assignee.name} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}

/** The current assignee, or any manager: clears an item's assignment. */
export async function releaseItem(itemId: string): Promise<ActionResult> {
  const session = await requireSession();
  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!item.assignedToId) return { ok: false, error: "This item isn't assigned to anyone." };
  if (session.role !== "MANAGER" && item.assignedToId !== session.userId) {
    return { ok: false, error: "You can only release items assigned to you." };
  }

  await db.orderItem.update({
    where: { id: itemId },
    data: { assignedToId: null, assignedById: null, assignedAt: null },
  });

  await logAudit({
    orderId: item.orderId,
    entityType: "ORDER_ITEM",
    entityId: itemId,
    action: "ITEM_UNASSIGNED",
    summary: `Assignment on "${item.description}" cleared by ${session.name}.`,
    performedById: session.userId,
  });

  revalidateOrder(item.orderId);
  return { ok: true };
}
