"use server";

/**
 * Phase 2 timeclock actions. Wired in behind PHASE2_ENABLED (lib/feature-flags.ts) —
 * these actions themselves have no flag check (a manager-only guard is the same
 * either way), the flag instead gates the pages/nav that reach them. See
 * phase2/PLAN.md for the full evaluation trail behind this design.
 *
 * Scope: raw punch capture + hours-worked totals only. No pay rate, no overtime
 * multiplier — see lib/hours.ts's header for why that's deliberate.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { shopDateTimeLocalSchema, shopDayStart, shopDayEnd } from "@/lib/dates";
import {
  type PunchLike,
  type PunchType,
  summarizePunchesByDay,
  currentPunchState,
  type CurrentPunchState,
  type DaySummary,
} from "@/lib/hours";

export type ActionResult = { ok: true } | { ok: false; error: string };

// How far back to look when figuring out someone's *current* punch state (clocked in /
// out / on break). Wide enough to cover a shift that started yesterday and ran past
// midnight without pulling someone's entire punch history on every page load.
const CURRENT_STATE_LOOKBACK_HOURS = 30;

async function getActivePunchesForUser(userId: string, from: Date, to: Date): Promise<PunchLike[]> {
  const rows = await db.punch.findMany({
    where: { userId, voidedAt: null, timestamp: { gte: from, lte: to } },
    select: { id: true, type: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });
  return rows as PunchLike[];
}

/** Internal — computes punch state for a userId we already trust (the caller already
 * resolved the session), so the clock actions below don't pay for requireSession's
 * active-account DB check twice per tap. */
async function getPunchStateForUserId(userId: string): Promise<CurrentPunchState> {
  const now = new Date();
  const from = new Date(now.getTime() - CURRENT_STATE_LOOKBACK_HOURS * 60 * 60 * 1000);
  const punches = await getActivePunchesForUser(userId, from, now);
  return currentPunchState(punches);
}

/** What the clock button should show right now for the signed-in user. */
export async function getMyPunchState(): Promise<{ state: CurrentPunchState; asOf: Date }> {
  const session = await requireSession();
  const state = await getPunchStateForUserId(session.userId);
  return { state, asOf: new Date() };
}

async function recordPunch(userId: string, createdById: string, type: PunchType): Promise<ActionResult> {
  const punch = await db.punch.create({
    data: { userId, createdById, type, timestamp: new Date() },
  });
  await logAudit({
    entityType: "PUNCH",
    entityId: punch.id,
    action: type,
    summary: `${type.replace("_", " ").toLowerCase()} recorded.`,
    performedById: createdById,
  });
  return { ok: true };
}

/** Self-service clock in. Refuses if the caller already has an open (unclosed) session. */
export async function clockIn(): Promise<ActionResult> {
  const session = await requireSession();
  const state = await getPunchStateForUserId(session.userId);
  if (state !== "CLOCKED_OUT") {
    return { ok: false, error: "You're already clocked in." };
  }
  return recordPunch(session.userId, session.userId, "CLOCK_IN");
}

/** Self-service clock out. Requires being clocked in and NOT currently on break — ending
 * the break first is a deliberate, separate step rather than an automatic side effect,
 * so the break's actual end time is always a real tap, not an inferred guess. */
export async function clockOut(): Promise<ActionResult> {
  const session = await requireSession();
  const state = await getPunchStateForUserId(session.userId);
  if (state === "CLOCKED_OUT") return { ok: false, error: "You're not clocked in." };
  if (state === "ON_BREAK") return { ok: false, error: "End your break before clocking out." };
  return recordPunch(session.userId, session.userId, "CLOCK_OUT");
}

export async function startBreak(): Promise<ActionResult> {
  const session = await requireSession();
  const state = await getPunchStateForUserId(session.userId);
  if (state !== "CLOCKED_IN") return { ok: false, error: "Clock in before starting a break." };
  return recordPunch(session.userId, session.userId, "BREAK_START");
}

export async function endBreak(): Promise<ActionResult> {
  const session = await requireSession();
  const state = await getPunchStateForUserId(session.userId);
  if (state !== "ON_BREAK") return { ok: false, error: "You're not on a break." };
  return recordPunch(session.userId, session.userId, "BREAK_END");
}

// from/to are plain "YYYY-MM-DD" dates (see lib/dates.ts's toDateInputValue); shopDayStart/
// shopDayEnd anchor them to shop-local day boundaries instead of z.coerce.date()'s default
// of parsing "YYYY-MM-DD" as UTC midnight, which is actually late evening the previous day
// in the shop's own timezone.
const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.").transform(shopDayStart),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.").transform(shopDayEnd),
});

/** Self-service: the signed-in user's own daily hours totals for a date range. No other
 * employee's data is reachable through this — see listDailyTotalsForRange for the
 * manager equivalent. */
export async function listMyDailyTotals(from: string, to: string): Promise<DaySummary[]> {
  const session = await requireSession();
  const range = rangeSchema.parse({ from, to });
  const punches = await getActivePunchesForUser(session.userId, range.from, range.to);
  return summarizePunchesByDay(punches);
}

/** MANAGER: daily hours totals for one employee, or every active employee, over a date
 * range — the review surface for "does this look right before it goes anywhere." */
export async function listDailyTotalsForRange(
  from: string,
  to: string,
  userId?: string
): Promise<{ userId: string; name: string; days: DaySummary[] }[]> {
  await requireManager();
  const range = rangeSchema.parse({ from, to });

  const users = await db.user.findMany({
    where: userId ? { id: userId } : { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const results = [];
  for (const user of users) {
    const punches = await getActivePunchesForUser(user.id, range.from, range.to);
    results.push({ userId: user.id, name: user.name, days: summarizePunchesByDay(punches) });
  }
  return results;
}

/** MANAGER: raw punch list for one employee in a range — the correction/review UI reads
 * from this, not from the summarized totals, so a manager can see (and fix) the actual
 * events behind a flagged or surprising total. */
export async function listRawPunches(userId: string, from: string, to: string) {
  await requireManager();
  const range = rangeSchema.parse({ from, to });
  return db.punch.findMany({
    where: { userId, timestamp: { gte: range.from, lte: range.to } },
    include: {
      createdBy: { select: { id: true, name: true } },
      editedBy: { select: { id: true, name: true } },
      voidedBy: { select: { id: true, name: true } },
    },
    orderBy: { timestamp: "asc" },
  });
}

/** MANAGER: add a punch on someone else's behalf (a missed clock-in/out, backfilled from
 * memory) — createdById is always the manager's own id, never the target employee's, so
 * it's always visible later that this wasn't a self-punch. */
export async function addManualPunch(
  targetUserId: string,
  type: PunchType,
  timestamp: string,
  note?: string
): Promise<ActionResult> {
  const session = await requireManager();
  const parsedTimestamp = shopDateTimeLocalSchema.safeParse(timestamp);
  if (!parsedTimestamp.success) return { ok: false, error: "Enter a valid date/time." };

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true } });
  if (!target) return { ok: false, error: "Employee not found." };

  const punch = await db.punch.create({
    data: {
      userId: target.id,
      createdById: session.userId,
      type,
      timestamp: parsedTimestamp.data,
      note: note || null,
    },
  });
  await logAudit({
    entityType: "PUNCH",
    entityId: punch.id,
    action: "MANUAL_PUNCH_ADDED",
    summary: `Manually added a ${type.replace("_", " ").toLowerCase()} for "${target.name}".`,
    performedById: session.userId,
  });
  return { ok: true };
}

/**
 * MANAGER: corrects an existing punch's time and/or type. The previous values go into
 * the audit summary (not a dedicated schema column) — same pattern as ItemNote's
 * edit-audit trail: the correction record itself is the accountability trail.
 */
export async function correctPunch(
  punchId: string,
  newTimestamp: string,
  newType: PunchType
): Promise<ActionResult> {
  const session = await requireManager();
  const parsedTimestamp = shopDateTimeLocalSchema.safeParse(newTimestamp);
  if (!parsedTimestamp.success) return { ok: false, error: "Enter a valid date/time." };

  const existing = await db.punch.findUnique({ where: { id: punchId } });
  if (!existing || existing.voidedAt) return { ok: false, error: "Punch not found." };

  await db.punch.update({
    where: { id: punchId },
    data: { timestamp: parsedTimestamp.data, type: newType, editedAt: new Date(), editedById: session.userId },
  });
  await logAudit({
    entityType: "PUNCH",
    entityId: punchId,
    action: "PUNCH_CORRECTED",
    summary: `Changed punch from ${existing.type} at ${existing.timestamp.toISOString()} to ${newType} at ${parsedTimestamp.data.toISOString()}.`,
    performedById: session.userId,
  });
  return { ok: true };
}

/** MANAGER: soft-voids a punch that shouldn't count at all (double-tap, test punch) —
 * excluded from hours totals but never deleted, same as everything else in this app. */
export async function voidPunch(punchId: string, reason: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!reason?.trim()) return { ok: false, error: "Enter a reason for voiding this punch." };

  const existing = await db.punch.findUnique({ where: { id: punchId } });
  if (!existing) return { ok: false, error: "Punch not found." };
  if (existing.voidedAt) return { ok: false, error: "This punch is already voided." };

  await db.punch.update({
    where: { id: punchId },
    data: { voidedAt: new Date(), voidedById: session.userId, voidReason: reason.trim() },
  });
  await logAudit({
    entityType: "PUNCH",
    entityId: punchId,
    action: "PUNCH_VOIDED",
    summary: `Voided a ${existing.type} punch at ${existing.timestamp.toISOString()}: ${reason.trim()}`,
    performedById: session.userId,
  });
  return { ok: true };
}
