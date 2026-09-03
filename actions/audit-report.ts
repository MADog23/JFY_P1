"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { resolveWeekRange, toDateInputValue } from "@/lib/dates";

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
] as const;

const DEFAULT_PAGE_SIZE = 50;

export async function listAuditReport(params?: {
  from?: string;
  to?: string;
  category?: AuditCategory;
  performedById?: string;
  page?: number;
}) {
  await requireManager();
  const { category, performedById } = params ?? {};
  const page = Math.max(params?.page ?? 1, 1);
  const pageSize = DEFAULT_PAGE_SIZE;

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
    rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    // Echoed back so the filter bar can show the range actually applied — including
    // the default week, when the manager hasn't picked one explicitly.
    from: toDateInputValue(from),
    to: toDateInputValue(to),
  };
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
