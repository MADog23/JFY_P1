"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { nextOrderNumber } from "@/lib/order-number";
import { generateClientToken } from "@/lib/token";
import type { ActionResult } from "./auth";

export async function listOrders(filter?: "ACTIVE" | "SEALED" | "PICKED_UP" | "ALL") {
  await requireSession();
  const where =
    !filter || filter === "ALL"
      ? {}
      : filter === "ACTIVE"
      ? { status: "IN_PROGRESS" as const }
      : filter === "SEALED"
      ? { status: "SEALED" as const }
      : { status: "PICKED_UP" as const };

  return db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      clientName: true,
      status: true,
      dueDate: true,
      createdAt: true,
      items: { select: { status: true } },
    },
    take: 100,
  });
}

export async function getOrderDetail(orderId: string) {
  await requireSession();
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      createdBy: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
          measurements: { include: { updatedBy: { select: { name: true } } }, orderBy: { label: "asc" } },
          images: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
          pickup: { include: { authorizedBy: { select: { name: true } } } },
        },
      },
      auditLogs: {
        include: { performedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

const itemSchema = z.object({
  garmentType: z.string().min(1),
  description: z.string().min(1),
  alterations: z.array(z.string()).default([]),
  alterationsCustom: z.string().optional(),
});

const intakeSchema = z.object({
  clientName: z.string().min(1, "Client name is required."),
  clientPhone: z.string().min(7, "A phone number is required."),
  clientEmail: z.string().email().optional().or(z.literal("")),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item to the order."),
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

    await logAudit({
      orderId: created.id,
      entityType: "ORDER",
      entityId: created.id,
      action: "INTAKE_CREATED",
      summary: `Intake ticket ${created.orderNumber} created for ${created.clientName} with ${created.items.length} item(s) by ${session.name}.`,
      performedById: session.userId,
    });

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

  await db.order.update({
    where: { id: data.orderId },
    data: {
      clientName: data.clientName.trim(),
      clientPhone: data.clientPhone.trim(),
      clientEmail: data.clientEmail || null,
      pickupContactName: data.pickupContactName || null,
      pickupContactPhone: data.pickupContactPhone || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  await logAudit({
    orderId: data.orderId,
    entityType: "ORDER",
    entityId: data.orderId,
    action: "INTAKE_EDITED",
    summary: `Intake details for ${before.orderNumber} edited by ${session.name}.`,
    performedById: session.userId,
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

  await db.order.update({ where: { id: orderId }, data: { generalNotes } });
  await logAudit({
    orderId,
    entityType: "ORDER",
    entityId: orderId,
    action: "GENERAL_NOTES_EDITED",
    summary: `Order-level notes updated on ${order.orderNumber} by ${session.name}.`,
    performedById: session.userId,
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

  await db.order.update({ where: { id: orderId }, data: { paymentStatus } });
  await logAudit({
    orderId,
    entityType: "ORDER",
    entityId: orderId,
    action: "PAYMENT_STATUS_CHANGED",
    summary: `Payment status for ${order.orderNumber} set to ${paymentStatus} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath(`/manager/orders/${orderId}`);
  revalidatePath(`/employee/orders/${orderId}`);
  return { ok: true };
}

/** MANAGER ONLY: safety-valve to invalidate a leaked client link and issue a new one. */
export async function rotateClientToken(orderId: string): Promise<ActionResult> {
  const session = await requireManager();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  await db.order.update({ where: { id: orderId }, data: { clientToken: generateClientToken() } });
  await logAudit({
    orderId,
    entityType: "ORDER",
    entityId: orderId,
    action: "CLIENT_LINK_ROTATED",
    summary: `Client tracking link for ${order.orderNumber} was reset by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath(`/manager/orders/${orderId}`);
  return { ok: true };
}
