"use server";

import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export async function getAnalytics() {
  await requireManager();

  const [orderStatusCounts, itemStatusCounts, paymentCounts, overdue, recentSealed, totalOrders] =
    await Promise.all([
      db.order.groupBy({ by: ["status"], _count: true }),
      db.orderItem.groupBy({ by: ["status"], _count: true }),
      db.order.groupBy({ by: ["paymentStatus"], _count: true }),
      db.order.count({
        where: { dueDate: { lt: new Date() }, status: { in: ["IN_PROGRESS"] } },
      }),
      db.order.findMany({
        where: { status: { in: ["SEALED", "PICKED_UP"] }, sealedAt: { not: null } },
        select: { createdAt: true, sealedAt: true },
        orderBy: { sealedAt: "desc" },
        take: 200,
      }),
      db.order.count(),
    ]);

  const turnaroundDays = recentSealed
    .filter((o) => o.sealedAt)
    .map((o) => (o.sealedAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgTurnaroundDays =
    turnaroundDays.length > 0
      ? Math.round((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length) * 10) / 10
      : null;

  return {
    totalOrders,
    orderStatusCounts: Object.fromEntries(orderStatusCounts.map((r) => [r.status, r._count])),
    itemStatusCounts: Object.fromEntries(itemStatusCounts.map((r) => [r.status, r._count])),
    paymentCounts: Object.fromEntries(paymentCounts.map((r) => [r.paymentStatus, r._count])),
    overdueActiveOrders: overdue,
    avgTurnaroundDays,
  };
}
