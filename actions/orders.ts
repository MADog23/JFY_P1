"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { nextOrderNumber } from "@/lib/order-number";
import { generateClientToken } from "@/lib/token";
import { recomputeOrderTotal } from "@/lib/pricing";
import { recomputeOrderStatus } from "@/lib/order-status";
import type { ActionResult } from "./auth";

export type OrderListFilter = "ACTIVE" | "SEALED" | "PICKED_UP" | "CANCELLED" | "ALL";

/**
 * `search` matches against everything captured about the client at intake — name,
 * phone, email, and the (separate) pickup contact's name/phone — plus the order
 * number itself, since typing a ticket number into the same box is the natural thing
 * to try. `from`/`to` (yyyy-mm-dd, inclusive) filter by the order's *created* date —
 * i.e. when the intake ticket was made, not the due date — per the product decision
 * to search "when did this come in" rather than "when is it promised."
 */
const DEFAULT_PAGE_SIZE = 25;

export async function listOrders(params?: {
  filter?: OrderListFilter;
  search?: string;
  from?: string;
  to?: string;
  assignedToId?: string;
  page?: number;
  pageSize?: number;
}) {
  await requireSession();
  const { filter, search, from, to, assignedToId } = params ?? {};
  // Offset-based, not cursor-based: this table's ids are cuids (not sortable the way an
  // auto-increment or ULID would be), and orderBy is createdAt not id, so a Prisma
  // cursor here would mean carrying the last row's createdAt around as the cursor
  // instead of just an id — offset/limit is the simpler, safer choice for a list this
  // size (hundreds to low thousands of orders, not millions), and it's what lets the
  // dashboard show "page 2 of 6" rather than just "load more."
  const pageSize = Math.min(Math.max(params?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const page = Math.max(params?.page ?? 1, 1);

  const statusWhere: Prisma.OrderWhereInput =
    !filter || filter === "ALL"
      ? {}
      : filter === "ACTIVE"
      ? { status: "IN_PROGRESS" as const }
      : filter === "SEALED"
      ? { status: "SEALED" as const }
      : filter === "CANCELLED"
      ? { status: "CANCELLED" as const }
      : { status: "PICKED_UP" as const };

  const term = search?.trim();
  const searchWhere: Prisma.OrderWhereInput = term
    ? {
        OR: [
          { clientName: { contains: term, mode: "insensitive" } },
          { clientPhone: { contains: term, mode: "insensitive" } },
          { clientEmail: { contains: term, mode: "insensitive" } },
          { pickupContactName: { contains: term, mode: "insensitive" } },
          { pickupContactPhone: { contains: term, mode: "insensitive" } },
          { orderNumber: { contains: term, mode: "insensitive" } },
        ],
      }
    : {};

  const createdAtWhere: Prisma.DateTimeFilter = {};
  if (from) createdAtWhere.gte = new Date(`${from}T00:00:00`);
  if (to) createdAtWhere.lte = new Date(`${to}T23:59:59.999`);
  const dateWhere: Prisma.OrderWhereInput = from || to ? { createdAt: createdAtWhere } : {};

  // "Assigned to me": at least one item on the order is assigned to this person —
  // matches the per-item (not per-order) nature of assignment. Excludes soft-removed
  // items (actions/items.ts:removeItem) so a mistaken item that was assigned before
  // being removed doesn't linger on someone's "assigned to me" filter.
  const assigneeWhere: Prisma.OrderWhereInput = assignedToId
    ? { items: { some: { assignedToId, removedAt: null } } }
    : {};

  const where: Prisma.OrderWhereInput = { ...statusWhere, ...searchWhere, ...dateWhere, ...assigneeWhere };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        clientName: true,
        status: true,
        dueDate: true,
        createdAt: true,
        isRush: true,
        // Excludes soft-removed items (see OrderItem.removedAt) so the list's "N/M items
        // done" progress count matches what a manager sees on the order itself, not a
        // count padded by items that were removed as mistakes.
        items: { where: { removedAt: null }, select: { status: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  return { orders, total, page, pageSize, hasMore: page * pageSize < total };
}

/**
 * PRICING VISIBILITY: itemized PriceLine rows are manager-only to even *view*, not just
 * edit — this is a stricter rule than the rest of the app's intake-lock fields (which
 * stay employee-visible, read-only). So this always fetches the full record (managers
 * need it, and one code path is less to keep in sync), then strips priceLines out of
 * the object entirely for non-managers before it's ever serialized to the client. Order
 * total (totalPriceCents) and paymentStatus are NOT stripped — those stay visible to
 * employees by design (see lib/pricing.ts and the PriceLine model comment).
 */
export async function getOrderDetail(orderId: string) {
  const session = await requireSession();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      createdBy: { select: { name: true } },
      priceLines: {
        include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          // Capped like auditLogs below: an item's notes/images are unbounded in
          // principle (nothing stops staff from adding more over a long-running order),
          // so an uncapped fetch here is a page that gets slower the longer an order
          // lives. Most recent first, same as the UI already shows them, so the cap
          // only ever drops the oldest, least-relevant entries.
          notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
          measurements: { include: { updatedBy: { select: { name: true } } }, orderBy: { label: "asc" } },
          images: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
          pickup: { include: { authorizedBy: { select: { name: true } } } },
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { name: true } },
          removedBy: { select: { name: true } },
          priceLines: {
            include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      auditLogs: {
        include: { performedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!order) return null;
  if (session.role === "MANAGER") return order;

  // Employee view: strip the itemized breakdown, keep the total + payment status.
  return {
    ...order,
    priceLines: [],
    items: order.items.map((item) => ({ ...item, priceLines: [] })),
  };
}

// Itemized pricing entered at intake time — see the "Itemized pricing" step of
// components/IntakeForm.tsx. Optional by design: an employee can create a ticket with
// some, all, or none of these filled in, and a manager can add/fix pricing afterward
// (actions/pricing.ts) — but ONLY afterward; this is the one and only entry point
// where a non-manager is ever allowed to write a PriceLine.
const priceLineDraftSchema = z.object({
  description: z.string().min(1),
  amountCents: z.number().int().min(0),
  source: z.enum(["ALTERATION", "CUSTOM_INSTRUCTIONS", "FREEFORM"]).default("FREEFORM"),
});

const itemSchema = z.object({
  garmentType: z.string().min(1),
  description: z.string().min(1),
  alterations: z.array(z.string()).default([]),
  alterationsCustom: z.string().optional(),
  priceLines: z.array(priceLineDraftSchema).default([]),
});

const intakeSchema = z.object({
  clientName: z.string().min(1, "Client name is required."),
  clientPhone: z.string().min(7, "A phone number is required."),
  clientEmail: z.string().email().optional().or(z.literal("")),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().optional(),
  dueDate: z.string().optional(),
  isRush: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "Add at least one item to the order."),
  // Freeform charges not tied to any one item (e.g. a rush fee).
  orderPriceLines: z.array(priceLineDraftSchema).default([]),
});

/** Employee OR manager: creates the intake ticket. Locked after this point except by a manager. */
export async function createIntakeTicket(
  raw: z.infer<typeof intakeSchema>
): Promise<ActionResult & { orderId?: string }> {
  const session = await requireSession();
  const parsed = intakeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid intake form." };
  }
  const data = parsed.data;

  const order = await db.$transaction(async (tx) => {
    const orderNumber = await nextOrderNumber(tx);
    const created = await tx.order.create({
      data: {
        orderNumber,
        clientName: data.clientName.trim(),
        clientPhone: data.clientPhone.trim(),
        clientEmail: data.clientEmail || null,
        pickupContactName: data.pickupContactName || null,
        pickupContactPhone: data.pickupContactPhone || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        isRush: data.isRush,
        clientToken: generateClientToken(),
        createdById: session.userId,
        items: {
          create: data.items.map((item) => ({
            garmentType: item.garmentType,
            description: item.description,
            alterations: item.alterations,
            alterationsCustom: item.alterationsCustom || null,
          })),
        },
      },
      include: { items: true },
    });

    await logAudit(
      {
        orderId: created.id,
        entityType: "ORDER",
        entityId: created.id,
        action: "INTAKE_CREATED",
        summary: `Intake ticket ${created.orderNumber} created for ${created.clientName} with ${created.items.length} item(s) by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );

    // Item order in `created.items` matches `data.items` input order (Prisma nested
    // creates run sequentially in array order), so index-pairing them here is safe.
    const priceLineRows: Prisma.PriceLineCreateManyInput[] = [];
    data.items.forEach((item, i) => {
      const orderItemId = created.items[i].id;
      item.priceLines.forEach((pl) => {
        priceLineRows.push({
          orderId: created.id,
          orderItemId,
          description: pl.description,
          amountCents: pl.amountCents,
          source: pl.source,
          createdById: session.userId,
        });
      });
    });
    data.orderPriceLines.forEach((pl) => {
      priceLineRows.push({
        orderId: created.id,
        orderItemId: null,
        description: pl.description,
        amountCents: pl.amountCents,
        source: "FREEFORM",
        createdById: session.userId,
      });
    });

    if (priceLineRows.length > 0) {
      await tx.priceLine.createMany({ data: priceLineRows });
      await recomputeOrderTotal(created.id, tx);
      await logAudit(
        {
          orderId: created.id,
          entityType: "ORDER",
          entityId: created.id,
          action: "PRICING_SET_AT_INTAKE",
          summary: `${priceLineRows.length} price line(s) entered at intake for ${created.orderNumber} by ${session.name}.`,
          performedById: session.userId,
        },
        tx
      );
    }

    return created;
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
  redirect(`/${session.role === "MANAGER" ? "manager" : "employee"}/orders/${order.id}`);
}

const intakeEditSchema = z.object({
  orderId: z.string(),
  clientName: z.string().min(1),
  clientPhone: z.string().min(7),
  clientEmail: z.string().email().optional().or(z.literal("")),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().optional(),
  dueDate: z.string().optional(),
  isRush: z.boolean().default(false),
});

/** MANAGER ONLY: edits the locked intake identity fields on an existing order. */
export async function updateOrderIntake(
  raw: z.infer<typeof intakeEditSchema>
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = intakeEditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  const data = parsed.data;

  const before = await db.order.findUnique({ where: { id: data.orderId } });
  if (!before) return { ok: false, error: "Order not found." };
  if (before.status === "CANCELLED") return { ok: false, error: "This order is cancelled." };

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: data.orderId },
      data: {
        clientName: data.clientName.trim(),
        clientPhone: data.clientPhone.trim(),
        clientEmail: data.clientEmail || null,
        pickupContactName: data.pickupContactName || null,
        pickupContactPhone: data.pickupContactPhone || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        isRush: data.isRush,
      },
    });

    await logAudit(
      {
        orderId: data.orderId,
        entityType: "ORDER",
        entityId: data.orderId,
        action: "INTAKE_EDITED",
        summary: `Intake details for ${before.orderNumber} edited by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath(`/manager/orders/${data.orderId}`);
  revalidatePath(`/employee/orders/${data.orderId}`);
  return { ok: true };
}

/** Employee or manager: general working-profile notes for the whole order (not the locked intake fields). */
export async function updateGeneralNotes(orderId: string, generalNotes: string): Promise<ActionResult> {
  const session = await requireSession();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "CANCELLED") return { ok: false, error: "This order is cancelled." };

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { generalNotes } });
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "GENERAL_NOTES_EDITED",
        summary: `Order-level notes updated on ${order.orderNumber} by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  return { ok: true };
}

export async function updatePaymentStatus(
  orderId: string,
  paymentStatus: "UNPAID" | "DEPOSIT_PAID" | "PAID"
): Promise<ActionResult> {
  const session = await requireSession();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "CANCELLED") return { ok: false, error: "This order is cancelled." };

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus } });
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "PAYMENT_STATUS_CHANGED",
        summary: `Payment status for ${order.orderNumber} set to ${paymentStatus} by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  return { ok: true };
}

/**
 * MANAGER ONLY: soft-cancels an order that should never have existed (duplicate
 * intake, wrong client, a test ticket) — see the OrderStatus.CANCELLED comment in
 * schema.prisma for what this does and doesn't touch. Reversible: see uncancelOrder.
 */
export async function cancelOrder(orderId: string, reason?: string): Promise<ActionResult> {
  const session = await requireManager();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "CANCELLED") return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "ORDER_CANCELLED",
        summary: `Order ${order.orderNumber} cancelled by ${session.name}${reason?.trim() ? ` — ${reason.trim()}` : ""}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath("/manager");
  revalidatePath("/employee");
  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  return { ok: true };
}

/**
 * MANAGER ONLY: undoes an accidental cancellation. Recomputes the order's status fresh
 * from its (non-removed) items' current state — the same derivation every other status
 * change goes through — rather than just restoring whatever status it happened to be
 * before cancelling, since work could in principle have been queued up in the meantime.
 */
export async function uncancelOrder(orderId: string): Promise<ActionResult> {
  const session = await requireManager();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "CANCELLED") return { ok: false, error: "This order isn't cancelled." };

  await db.$transaction(async (tx) => {
    // recomputeOrderStatus bails out immediately for a CANCELLED order (see
    // lib/order-status.ts), so flip it to IN_PROGRESS first as a neutral starting point
    // for the same derivation every other action already relies on.
    await tx.order.update({ where: { id: orderId }, data: { status: "IN_PROGRESS" } });
    await recomputeOrderStatus(orderId, tx);
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "ORDER_UNCANCELLED",
        summary: `Order ${order.orderNumber} restored from cancelled by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath("/manager");
  revalidatePath("/employee");
  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  return { ok: true };
}

/** MANAGER ONLY: safety-valve to invalidate a leaked client link and issue a new one. */
export async function rotateClientToken(orderId: string): Promise<ActionResult> {
  const session = await requireManager();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { clientToken: generateClientToken() } });
    await logAudit(
      {
        orderId,
        entityType: "ORDER",
        entityId: orderId,
        action: "CLIENT_LINK_ROTATED",
        summary: `Client tracking link for ${order.orderNumber} was reset by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });

  revalidatePath(`/manager/orders/${orderId}`);
  return { ok: true };
}
