"use server";

/**
 * Phase 2 scheduling actions. Wired in behind PHASE2_ENABLED (lib/feature-flags.ts) —
 * see actions/punches.ts's header and phase2/PLAN.md for the full context.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const shiftInputSchema = z
  .object({
    userId: z.string().min(1, "Choose an employee."),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    role: z.string().trim().max(80).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endAt > v.startAt, { message: "End time must be after the start time.", path: ["endAt"] });

/** MANAGER: creates a shift as a draft (unpublished — invisible to the assigned
 * employee until publishShifts is called). */
export async function createShift(input: {
  userId: string;
  startAt: string;
  endAt: string;
  role?: string;
  note?: string;
}): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = shiftInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const employee = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, name: true, active: true } });
  if (!employee || !employee.active) return { ok: false, error: "Employee not found or inactive." };

  const shift = await db.shift.create({
    data: {
      userId: parsed.data.userId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      role: parsed.data.role || null,
      note: parsed.data.note || null,
      createdById: session.userId,
    },
  });
  await logAudit({
    entityType: "SHIFT",
    entityId: shift.id,
    action: "SHIFT_CREATED",
    summary: `Scheduled "${employee.name}" ${parsed.data.startAt.toISOString()} – ${parsed.data.endAt.toISOString()} (draft).`,
    performedById: session.userId,
  });
  return { ok: true };
}

/** MANAGER: edits a shift's time/role/note. Works on drafts and published shifts alike —
 * a schedule that's already gone out sometimes still needs a correction; the audit trail
 * is what makes that visible after the fact, not a lock on editing published shifts. */
export async function updateShift(
  shiftId: string,
  input: { startAt: string; endAt: string; role?: string; note?: string }
): Promise<ActionResult> {
  const session = await requireManager();
  const existing = await db.shift.findUnique({ where: { id: shiftId } });
  if (!existing || existing.cancelledAt) return { ok: false, error: "Shift not found." };

  const parsed = z
    .object({ startAt: z.coerce.date(), endAt: z.coerce.date(), role: z.string().trim().max(80).optional(), note: z.string().trim().max(500).optional() })
    .refine((v) => v.endAt > v.startAt, { message: "End time must be after the start time.", path: ["endAt"] })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.shift.update({
    where: { id: shiftId },
    data: {
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      role: parsed.data.role || null,
      note: parsed.data.note || null,
    },
  });
  await logAudit({
    entityType: "SHIFT",
    entityId: shiftId,
    action: "SHIFT_EDITED",
    summary: `Changed shift time from ${existing.startAt.toISOString()}–${existing.endAt.toISOString()} to ${parsed.data.startAt.toISOString()}–${parsed.data.endAt.toISOString()}.`,
    performedById: session.userId,
  });
  return { ok: true };
}

/** MANAGER: publishes one or more draft shifts at once (e.g. "publish the whole week").
 * Idempotent per shift — already-published shifts in the list are silently skipped
 * rather than erroring the whole batch. */
export async function publishShifts(shiftIds: string[]): Promise<ActionResult> {
  const session = await requireManager();
  if (shiftIds.length === 0) return { ok: false, error: "No shifts selected." };

  const shifts = await db.shift.findMany({ where: { id: { in: shiftIds }, cancelledAt: null, publishedAt: null } });
  const now = new Date();
  for (const shift of shifts) {
    await db.shift.update({ where: { id: shift.id }, data: { publishedAt: now } });
    await logAudit({
      entityType: "SHIFT",
      entityId: shift.id,
      action: "SHIFT_PUBLISHED",
      summary: `Published shift ${shift.startAt.toISOString()} – ${shift.endAt.toISOString()}.`,
      performedById: session.userId,
    });
  }
  return { ok: true };
}

/** MANAGER: soft-cancels a shift (wrong person scheduled, duplicate). Never deleted —
 * same philosophy as everything else in this app. */
export async function cancelShift(shiftId: string, reason?: string): Promise<ActionResult> {
  const session = await requireManager();
  const existing = await db.shift.findUnique({ where: { id: shiftId } });
  if (!existing) return { ok: false, error: "Shift not found." };
  if (existing.cancelledAt) return { ok: false, error: "This shift is already cancelled." };

  await db.shift.update({
    where: { id: shiftId },
    data: { cancelledAt: new Date(), cancelledById: session.userId },
  });
  await logAudit({
    entityType: "SHIFT",
    entityId: shiftId,
    action: "SHIFT_CANCELLED",
    summary: `Cancelled shift ${existing.startAt.toISOString()} – ${existing.endAt.toISOString()}.${reason ? ` Reason: ${reason.trim()}` : ""}`,
    performedById: session.userId,
  });
  return { ok: true };
}

const rangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

/** MANAGER: every shift (draft + published, not cancelled) in a date range, for one
 * employee or everyone — the schedule-building view. */
export async function listShiftsForRange(from: string, to: string, userId?: string) {
  await requireManager();
  const range = rangeSchema.parse({ from, to });
  return db.shift.findMany({
    where: {
      cancelledAt: null,
      userId: userId || undefined,
      startAt: { lte: range.to },
      endAt: { gte: range.from },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { startAt: "asc" },
  });
}

/** Self-service: the signed-in user's own published, non-cancelled shifts in a range —
 * "my schedule." Drafts are never returned here regardless of whose they are. */
export async function listMyShiftsForRange(from: string, to: string) {
  const session = await requireSession();
  const range = rangeSchema.parse({ from, to });
  return db.shift.findMany({
    where: {
      userId: session.userId,
      cancelledAt: null,
      publishedAt: { not: null },
      startAt: { lte: range.to },
      endAt: { gte: range.from },
    },
    orderBy: { startAt: "asc" },
  });
}
