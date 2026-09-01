import "server-only";
import { db } from "./db";

type AuditInput = {
  orderId?: string | null;
  entityType: "ORDER" | "ORDER_ITEM" | "EMPLOYEE" | "TAXONOMY";
  entityId: string;
  action: string;
  summary: string;
  performedById: string;
};

/**
 * Every write in this app should produce exactly one of these. It's the answer to
 * "who changed this and when" that the shop needs for accountability — never skip it,
 * and never let a mutation succeed if the audit write fails (they run in the same
 * transaction wherever possible — see actions/*.ts).
 */
export async function logAudit(input: AuditInput) {
  return db.auditLog.create({
    data: {
      orderId: input.orderId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      performedById: input.performedById,
    },
  });
}
