"use server";

/**
 * Phase 2 — vacation/time-off requests: an employee requests a range of calendar days
 * off, tagged paid or unpaid; a manager approves or denies it. Wired in behind
 * PHASE2_ENABLED (see lib/feature-flags.ts), same as Punch/Shift — the flag gates the
 * pages/nav, not these actions themselves (a manager-only guard is the same either way).
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { shopDayStart, shopDayEnd, formatShopDateTime } from "@/lib/dates";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type TimeOffType = "PAID" | "UNPAID";
export type TimeOffStatus = "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");
const requestSchema = z.object({
  startDate: dateOnly,
  endDate: dateOnly,
  type: z.enum(["PAID", "UNPAID"]),
  reason: z.string().max(500).optional(),
});

/** Both list functions below take the same optional `{from, to}` — matches any request
 * whose date range OVERLAPS the given window (not just ones that start inside it), so
 * a multi-day request that only partially falls in the searched range still shows up.
 * Either bound can be omitted; omitting both applies no date filter at all. */
function dateRangeWhere(from?: string, to?: string): Prisma.TimeOffRequestWhereInput {
  const where: Prisma.TimeOffRequestWhereInput = {};
  if (to) where.startDate = { lte: shopDayEnd(to) };
  if (from) where.endDate = { gte: shopDayStart(from) };
  return where;
}

function rangeLabel(startDate: Date, endDate: Date): string {
  const start = formatShopDateTime(startDate, { dateStyle: "medium" });
  const end = formatShopDateTime(endDate, { dateStyle: "medium" });
  return start === end ? start : `${start} – ${end}`;
}

/** Self-service: submit a new time-off request for the signed-in user. Always starts
 * PENDING — a manager (see decideTimeOffRequest) has to approve or deny it before it's
 * official. */
export async function requestTimeOff(input: {
  startDate: string;
  endDate: string;
  type: TimeOffType;
  reason?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const startDate = shopDayStart(parsed.data.startDate);
  const endDate = shopDayEnd(parsed.data.endDate);
  if (startDate > endDate) return { ok: false, error: "The start date must be on or before the end date." };

  const request = await db.timeOffRequest.create({
    data: {
      userId: session.userId,
      startDate,
      endDate,
      type: parsed.data.type,
      reason: parsed.data.reason?.trim() || null,
      createdById: session.userId,
    },
  });
  await logAudit({
    entityType: "TIME_OFF",
    entityId: request.id,
    action: "TIME_OFF_REQUESTED",
    summary: `"${session.name}" requested ${parsed.data.type.toLowerCase()} time off for ${rangeLabel(startDate, endDate)}.`,
    performedById: session.userId,
  });
  return { ok: true };
}

/**
 * Self-service: withdraws the signed-in user's own request — while it's PENDING, or
 * even after it's been APPROVED (plans changed after the fact is a real, common case;
 * no reason to force a manager to do this for them). Refuses once it's DENIED (nothing
 * to withdraw — it was never granted) or already CANCELLED. See cancelTimeOffRequest
 * below for the manager-side equivalent (e.g. the employee can't do this themselves,
 * or a manager needs to revoke an approval on their end).
 */
export async function cancelMyTimeOffRequest(requestId: string): Promise<ActionResult> {
  const session = await requireSession();
  const existing = await db.timeOffRequest.findUnique({ where: { id: requestId } });
  if (!existing || existing.userId !== session.userId) return { ok: false, error: "Request not found." };
  if (existing.status === "DENIED") return { ok: false, error: "This request was already denied — there's nothing to withdraw." };
  if (existing.status === "CANCELLED") return { ok: false, error: "This request has already been withdrawn." };

  const wasApproved = existing.status === "APPROVED";
  await db.timeOffRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  await logAudit({
    entityType: "TIME_OFF",
    entityId: requestId,
    action: "TIME_OFF_CANCELLED",
    summary: `"${session.name}" withdrew their ${wasApproved ? "already-approved " : ""}time-off request for ${rangeLabel(existing.startDate, existing.endDate)}.`,
    performedById: session.userId,
  });
  return { ok: true };
}

/**
 * MANAGER: cancels/revokes any request that isn't already cancelled — including one
 * that's been APPROVED or DENIED. Covers two cases the self-service version above
 * doesn't: the employee can't withdraw it themselves (called in, no app access), or a
 * manager needs to reverse an approval after the fact (a staffing conflict came up,
 * the employee asked a manager directly instead of using the app). Nothing in this app
 * is a dead end once decided — same philosophy as the other manager correction tools
 * (cancelOrder/removeItem, etc.).
 */
export async function cancelTimeOffRequest(requestId: string, note?: string): Promise<ActionResult> {
  const session = await requireManager();
  const existing = await db.timeOffRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { name: true } } },
  });
  if (!existing) return { ok: false, error: "Request not found." };
  if (existing.status === "CANCELLED") return { ok: false, error: "This request has already been cancelled." };

  const priorStatus = existing.status.toLowerCase();
  await db.timeOffRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  await logAudit({
    entityType: "TIME_OFF",
    entityId: requestId,
    action: "TIME_OFF_CANCELLED_BY_MANAGER",
    summary: `"${session.name}" cancelled ${existing.user.name}'s ${priorStatus} time-off request for ${rangeLabel(existing.startDate, existing.endDate)}.${
      note?.trim() ? ` (${note.trim()})` : ""
    }`,
    performedById: session.userId,
  });
  return { ok: true };
}

/** Self-service: the signed-in user's own requests, most recent first — optionally
 * narrowed by status and/or a date range (see dateRangeWhere above). No other
 * employee's requests are reachable through this — see listTimeOffRequests for the
 * manager equivalent. */
export async function listMyTimeOffRequests(params?: { status?: TimeOffStatus; from?: string; to?: string }) {
  const session = await requireSession();
  return db.timeOffRequest.findMany({
    where: {
      userId: session.userId,
      ...(params?.status ? { status: params.status } : {}),
      ...dateRangeWhere(params?.from, params?.to),
    },
    orderBy: { createdAt: "desc" },
    include: { decidedBy: { select: { id: true, name: true } } },
  });
}

/** MANAGER: every request, optionally filtered by status, employee, and/or a date
 * range (see dateRangeWhere above). The review page defaults to PENDING via its own
 * caller — this just applies whatever filter it's given. */
export async function listTimeOffRequests(params?: { status?: TimeOffStatus; userId?: string; from?: string; to?: string }) {
  await requireManager();
  return db.timeOffRequest.findMany({
    where: {
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.userId ? { userId: params.userId } : {}),
      ...dateRangeWhere(params?.from, params?.to),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/** MANAGER: every active staff member, for the request-review filter and the
 * "log on behalf of" picker. */
export async function listStaffForTimeOff() {
  await requireManager();
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * MANAGER: approve or deny a pending request. Refuses to re-decide one that's already
 * been decided or withdrawn — a decision, once made, isn't silently overwritten, same
 * rule as everything else in this app (if a decision genuinely needs reversing later,
 * that's a deliberate follow-up action, not guessed at here).
 */
export async function decideTimeOffRequest(
  requestId: string,
  decision: "APPROVED" | "DENIED",
  note?: string
): Promise<ActionResult> {
  const session = await requireManager();
  const existing = await db.timeOffRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { name: true } } },
  });
  if (!existing) return { ok: false, error: "Request not found." };
  if (existing.status !== "PENDING") return { ok: false, error: "This request has already been decided." };

  await db.timeOffRequest.update({
    where: { id: requestId },
    data: { status: decision, decidedById: session.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
  });
  await logAudit({
    entityType: "TIME_OFF",
    entityId: requestId,
    action: decision === "APPROVED" ? "TIME_OFF_APPROVED" : "TIME_OFF_DENIED",
    summary: `"${session.name}" ${decision === "APPROVED" ? "approved" : "denied"} ${existing.user.name}'s time-off request for ${rangeLabel(existing.startDate, existing.endDate)}.`,
    performedById: session.userId,
  });
  return { ok: true };
}

/**
 * MANAGER: logs a request on an employee's behalf (e.g. a phone-call ask) and decides
 * it immediately as APPROVED — the manager IS the decision-maker in the act of creating
 * it, so there's no separate pending step to skip through. createdById is always the
 * manager's own id, never the employee's — mirrors Punch's addManualPunch, so it's
 * always visible later that this wasn't a self-request.
 */
export async function createTimeOffOnBehalf(
  targetUserId: string,
  input: { startDate: string; endDate: string; type: TimeOffType; reason?: string }
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true } });
  if (!target) return { ok: false, error: "Employee not found." };

  const startDate = shopDayStart(parsed.data.startDate);
  const endDate = shopDayEnd(parsed.data.endDate);
  if (startDate > endDate) return { ok: false, error: "The start date must be on or before the end date." };

  const request = await db.timeOffRequest.create({
    data: {
      userId: target.id,
      startDate,
      endDate,
      type: parsed.data.type,
      reason: parsed.data.reason?.trim() || null,
      createdById: session.userId,
      status: "APPROVED",
      decidedById: session.userId,
      decidedAt: new Date(),
    },
  });
  await logAudit({
    entityType: "TIME_OFF",
    entityId: request.id,
    action: "TIME_OFF_LOGGED_BY_MANAGER",
    summary: `"${session.name}" logged and approved ${parsed.data.type.toLowerCase()} time off for "${target.name}" (${rangeLabel(startDate, endDate)}).`,
    performedById: session.userId,
  });
  return { ok: true };
}
