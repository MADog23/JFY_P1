import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

type AuditInput = {
  orderId?: string | null;
  // PUNCH/SHIFT are Phase 2 (timeclock + scheduling) — see phase2/PLAN.md.
  entityType: "ORDER" | "ORDER_ITEM" | "EMPLOYEE" | "TAXONOMY" | "PUNCH" | "SHIFT";
  entityId: string;
  action: string;
  summary: string;
  performedById: string;
  // Set only by the login/auth call sites (actions/auth.ts) — kept as its own column
  // rather than folded into `summary` so the manager audit report (actions/audit-report.ts)
  // can hide/reveal it as one clean field instead of trying to redact free text.
  ipAddress?: string | null;
};

/**
 * Every write in this app should produce exactly one of these. It's the answer to
 * "who changed this and when" that the shop needs for accountability — never skip it,
 * and never let a mutation succeed if the audit write fails.
 *
 * If you're calling this from inside a `db.$transaction(async (tx) => ...)` block,
 * pass `tx` as the second argument. Writing through the plain `db` client from inside
 * someone else's open transaction targets a different connection, which can't see
 * that transaction's uncommitted rows yet — e.g. inserting an AuditLog row that
 * references an Order created earlier in the same transaction will fail its foreign
 * key check because the Order isn't visible outside that transaction until it commits.
 */
export async function logAudit(input: AuditInput, client: Prisma.TransactionClient | typeof db = db) {
  return client.auditLog.create({
    data: {
      orderId: input.orderId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      performedById: input.performedById,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

