import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

/** Must be called inside a transaction (tx) to avoid two intakes racing for the same number. */
export async function nextOrderNumber(tx: Prisma.TransactionClient = db): Promise<string> {
  const counter = await tx.orderCounter.upsert({
    where: { id: 1 },
    update: { lastNumber: { increment: 1 } },
    create: { id: 1, lastNumber: 1 },
  });
  return `JFY-${String(counter.lastNumber).padStart(6, "0")}`;
}
