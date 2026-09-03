"use server";

import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { resolveWeekRange, toDateInputValue } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { isRateLimited } from "@/lib/rate-limit";
import { grantIpReveal, getIpRevealStatus } from "@/lib/audit-ip-reveal";

/**
 * Manager-facing report over the AuditLog accountability trail — every mutation in the
 * app already writes one of these rows (see lib/audit.ts), this just gives a manager a
 * filtered, chronological window into them instead of only ever seeing one order's
 * trail at a time.
 */

// A "use server" file can only export async functions — not plain constants — so the
// category label list (used by both the client-side filter dropdown and the
// server-rendered table) lives in lib/audit-categories.ts instead and is imported by
// both, rather than from here. This file only exports the type.
export type AuditCategory = "ALL" | "ORDER" | "ORDER_ITEM" | "EMPLOYEE" | "TAXONOMY" | "PUNCH" | "SHIFT" | "SECURITY";

// "Security" isn't a real entityType — it's a curated list of actions that cuts across
// entityType (everything here happens to be tagged EMPLOYEE today, since logins and
// account changes are the app's only security-relevant surface, but this is matched by
// `action`, not `entityType`, so it stays correct if that ever changes). Deliberately
// excludes routine account housekeeping like EMPLOYEE_RENAMED, which isn't
// security-relevant — this list is meant to be short and worth actually reading after
// something looks wrong, not a repackaging of the whole Staff category.
const SECURITY_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "PASSWORD_CHANGED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_PIN_RESET",
  "EMPLOYEE_REACTIVATED",
  "EMPLOYEE_DEACTIVATED",
  "MANAGER_CREATED",
  "MANAGER_EDITED",
  "MANAGER_REACTIVATED",
  "MANAGER_DEACTIVATED",
  "AUDIT_IP_ADDRESSES_VIEWED",
] as const;

const DEFAULT_PAGE_SIZE = 50;

export async function listAuditReport(params?: {
  from?: string;
  to?: string;
  category?: AuditCategory;
  performedById?: string;
  page?: number;
}) {
  const session = await requireManager();
  const { category, performedById } = params ?? {};
  const page = Math.max(params?.page ?? 1, 1);
  const pageSize = DEFAULT_PAGE_SIZE;

  // Authoritative, server-side check against the signed step-up-reauth cookie (see
  // lib/audit-ip-reveal.ts) — never trust a client-supplied "show IPs" flag here, since
  // that would let anyone flip IP visibility without ever re-entering a password.
  const { active: ipRevealed, expiresAt: ipRevealExpiresAt } = await getIpRevealStatus(session.userId);

  // Defaults to the current shop-zone week (same helper the Schedule page already uses)
  // when no range is given — a manager widens the range deliberately, this never
  // silently queries the entire audit history by default.
  const { from, to } = resolveWeekRange(params?.from, params?.to);

  const categoryWhere: Prisma.AuditLogWhereInput =
    !category || category === "ALL"
      ? {}
      : category === "SECURITY"
      ? { action: { in: [...SECURITY_ACTIONS] } }
      : { entityType: category };

  const performedByWhere: Prisma.AuditLogWhereInput = performedById ? { performedById } : {};

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: from, lte: to },
    ...categoryWhere,
    ...performedByWhere,
  };

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        performedBy: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    // IP addresses stay masked unless the signed-in manager currently holds an active
    // reveal token — masking here (not in the UI layer) means a revealed IP is never
    // even sent to the browser until it's actually supposed to be visible.
    rows: ipRevealed ? rows : rows.map((row) => ({ ...row, ipAddress: null })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    // Echoed back so the filter bar can show the range actually applied — including
    // the default week, when the manager hasn't picked one explicitly.
    from: toDateInputValue(from),
    to: toDateInputValue(to),
    ipRevealed,
    // ms-epoch timestamp the client uses to auto-refresh itself the instant the reveal
    // window ends (see RevealIpAddressesControl) instead of only re-checking on the
    // next manual page load — null whenever ipRevealed is false.
    ipRevealExpiresAt,
  };
}

const REVEAL_RATE_LIMIT = { maxAttempts: 5, windowMs: 10 * 60 * 1000 };

/**
 * MANAGER, SELF ONLY: the step-up re-authentication behind "Show IP addresses" on the
 * audit report. A manager re-enters their OWN current password (not a new credential —
 * this isn't changing anything about the account) to prove it's really them before IP
 * addresses become visible, and that unlock event is itself audit-logged as
 * AUDIT_IP_ADDRESSES_VIEWED. The point isn't to stop a manager from seeing IPs (they
 * already have full access) — it's to create a provable, timestamped record of exactly
 * who chose to view them and when, so a claim that someone "could have" pulled an IP
 * off this report can be checked against an actual log entry instead of being
 * unfalsifiable either way.
 */
export async function confirmRevealAuditIpAddresses(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireManager();

  if (isRateLimited(`audit-ip-reveal:${session.userId}`, REVEAL_RATE_LIMIT)) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };
  }
  if (!password) return { ok: false, error: "Enter your password." };

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.passwordHash) return { ok: false, error: "Account not found." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Incorrect password." };

  await grantIpReveal(session.userId);
  await logAudit({
    entityType: "EMPLOYEE",
    entityId: session.userId,
    action: "AUDIT_IP_ADDRESSES_VIEWED",
    summary: `"${session.name}" re-authenticated to view IP addresses in the audit report.`,
    performedById: session.userId,
  });

  return { ok: true };
}

/** MANAGER ONLY: every staff account, active or not, for the "performed by" filter — a
 * deactivated account's past activity should still be reachable in the report, so this
 * deliberately isn't limited to `active: true` the way listAssignableStaff is. */
export async function listStaffForAuditFilter() {
  await requireManager();
  return db.user.findMany({
    select: { id: true, name: true, role: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}
