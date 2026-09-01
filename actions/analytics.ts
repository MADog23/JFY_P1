"use server";

import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export async function getAnalytics() {
  await requireManager();

  const [orderStatusCounts, itemStatusCounts, paymentCounts, overdue, recentSealed, totalOrders, revenue] =
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
      // Pricing is a manager-only surface end to end, so it's safe to aggregate raw
      // totals here — this whole action is already gated by requireManager() above.
      db.order.aggregate({ _sum: { totalPriceCents: true }, _avg: { totalPriceCents: true } }),
    ]);

  const turnaroundDays = recentSealed
    .filter((o) => o.sealedAt)
    .map((o) => (o.sealedAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgTurnaroundDays =
    turnaroundDays.length > 0
      ? Math.round((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length) * 10) / 10
      : null;

  // Everything below leans on the fact that PriceLine.description is a controlled
  // vocabulary for ALTERATION-sourced rows (always the exact taxonomy label an
  // employee/manager checked, never free text) and that every item-tied row can be
  // attributed to that item's garmentType — freeform write-ins have neither property,
  // which is exactly why they stay their own bucket instead of being broken out
  // further. One query, reduced four ways in JS rather than four separate queries.
  const [priceLines, inProgressOrders] = await Promise.all([
    db.priceLine.findMany({
      select: { amountCents: true, source: true, description: true, orderItem: { select: { garmentType: true } } },
    }),
    db.order.findMany({
      where: { status: "IN_PROGRESS" },
      select: {
        id: true,
        orderNumber: true,
        clientName: true,
        items: {
          select: {
            alterations: true,
            // Only ALTERATION-sourced lines count toward "did every checked box get
            // priced" — a freeform extra doesn't retroactively cover a blank one.
            priceLines: { where: { source: "ALTERATION" }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const alterationTotals = new Map<string, { totalCents: number; count: number }>();
  const garmentTotals = new Map<string, { totalCents: number; count: number }>();
  const sourceTotals: Record<string, number> = { ALTERATION: 0, CUSTOM_INSTRUCTIONS: 0, FREEFORM: 0 };

  for (const pl of priceLines) {
    sourceTotals[pl.source] = (sourceTotals[pl.source] ?? 0) + pl.amountCents;

    if (pl.source === "ALTERATION") {
      const entry = alterationTotals.get(pl.description) ?? { totalCents: 0, count: 0 };
      entry.totalCents += pl.amountCents;
      entry.count += 1;
      alterationTotals.set(pl.description, entry);
    }

    // Every item-tied charge (alteration, custom instructions, or a freeform extra
    // added for that specific item) counts toward that garment's revenue. Order-wide
    // freeform lines (no item) aren't attributable to a garment, so they're excluded
    // here even though they're still counted in sourceTotals.FREEFORM above.
    if (pl.orderItem) {
      const entry = garmentTotals.get(pl.orderItem.garmentType) ?? { totalCents: 0, count: 0 };
      entry.totalCents += pl.amountCents;
      entry.count += 1;
      garmentTotals.set(pl.orderItem.garmentType, entry);
    }
  }

  const revenueByAlteration = [...alterationTotals.entries()]
    .map(([label, v]) => ({ label, totalCents: v.totalCents, count: v.count, avgCents: Math.round(v.totalCents / v.count) }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const revenueByGarmentType = [...garmentTotals.entries()]
    .map(([label, v]) => ({ label, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents);

  // Literal, self-evident metric: for each open order, count the individual
  // checked alterations that still have no ALTERATION-sourced price line — not
  // an abstract "needs attention" flag. An order with 3 alterations and 2 price
  // lines has exactly 1 gap; an order with equal or more price lines has 0.
  const needsPricing = inProgressOrders
    .map((o) => {
      const gaps = o.items.reduce(
        (sum, item) => sum + Math.max(0, item.alterations.length - item.priceLines.length),
        0,
      );
      return { id: o.id, orderNumber: o.orderNumber, clientName: o.clientName, gaps };
    })
    .filter((o) => o.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps);

  const totalPricingGaps = needsPricing.reduce((sum, o) => sum + o.gaps, 0);

  // --- Historical trends & operational metrics --------------------------------
  // Everything below was already being recorded by some existing action (order/item
  // timestamps, the audit log, pickup records) — none of this needed a schema change
  // except the two fields called out inline (isRush, startedAt).
  const monthsBack = 6;
  const trendWindowStart = new Date();
  trendWindowStart.setDate(1);
  trendWindowStart.setHours(0, 0, 0, 0);
  trendWindowStart.setMonth(trendWindowStart.getMonth() - (monthsBack - 1));

  const [
    ordersForVolumeRevenue,
    ordersForTurnaroundTrend,
    dueDateOrders,
    pickedUpItemsForLag,
    reopenPopulation,
    ticketsCreatedByUser,
    itemsCompletedByUser,
    pickupsAuthorizedByUser,
    itemsAssignedByUser,
    activeUsers,
    paidAuditRows,
    rushCounts,
    startedItems,
  ] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: trendWindowStart } },
      select: { createdAt: true, totalPriceCents: true },
    }),
    db.order.findMany({
      where: { sealedAt: { gte: trendWindowStart } },
      select: { createdAt: true, sealedAt: true },
    }),
    // On-time rate: every order that has both a due date and a seal date (i.e. the
    // work is fully done, pickup notwithstanding) — all-time, not windowed.
    db.order.findMany({
      where: { dueDate: { not: null }, sealedAt: { not: null } },
      select: { dueDate: true, sealedAt: true },
    }),
    // Pickup lag: how long a finished item sits after completion before it's
    // actually picked up.
    db.orderItem.findMany({
      where: { status: "PICKED_UP", completedAt: { not: null } },
      select: { completedAt: true, pickup: { select: { pickedUpAt: true } } },
    }),
    // Reopen rate's denominator is "items that have been completed at least once" —
    // completedAt/completedById get reset to null on reopen (see reopenItem), so
    // status COMPLETED/PICKED_UP-or-reopenedAt-not-null is how to find that
    // population rather than filtering on completedAt directly.
    db.orderItem.findMany({
      where: { OR: [{ status: { in: ["COMPLETED", "PICKED_UP"] } }, { reopenedAt: { not: null } }] },
      select: { reopenedAt: true },
    }),
    db.order.groupBy({ by: ["createdById"], _count: true }),
    db.orderItem.groupBy({ by: ["completedById"], _count: true, where: { completedById: { not: null } } }),
    db.itemPickup.groupBy({ by: ["authorizedById"], _count: true }),
    db.orderItem.groupBy({ by: ["assignedToId"], _count: true, where: { assignedToId: { not: null } } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } }),
    // Time to full payment: AuditLog has no structured old/new-value fields, so this
    // matches the exact summary text updatePaymentStatus writes — if that wording
    // ever changes, this match needs to change with it. Restricted to orders whose
    // *current* paymentStatus is PAID, and (ordered ascending) the first such row per
    // order, so a since-reversed status doesn't get counted and a flip-flopped one
    // isn't double counted.
    db.auditLog.findMany({
      where: {
        action: "PAYMENT_STATUS_CHANGED",
        summary: { contains: "set to PAID by" },
        order: { paymentStatus: "PAID" },
      },
      select: { orderId: true, createdAt: true, order: { select: { createdAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.order.groupBy({ by: ["isRush"], _count: true }),
    // Cycle time (intake -> first work): bounded like avgTurnaroundDays above so this
    // stays a snapshot of recent activity rather than scanning the whole table.
    db.orderItem.findMany({
      where: { startedAt: { not: null } },
      select: { createdAt: true, startedAt: true },
      orderBy: { startedAt: "desc" },
      take: 300,
    }),
  ]);

  function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function avg(nums: number[], decimals = 1) {
    if (nums.length === 0) return null;
    const factor = 10 ** decimals;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * factor) / factor;
  }

  // Revenue/volume bucket by order *creation* month (consistent with the search
  // feature's "when did this come in" framing); turnaround buckets by *seal* month,
  // since that's when a turnaround figure actually becomes known — two different
  // date fields, merged into one series below by month key.
  const revenueByMonth = new Map<string, { revenueCents: number; orderCount: number }>();
  for (const o of ordersForVolumeRevenue) {
    const key = monthKey(o.createdAt);
    const entry = revenueByMonth.get(key) ?? { revenueCents: 0, orderCount: 0 };
    entry.revenueCents += o.totalPriceCents;
    entry.orderCount += 1;
    revenueByMonth.set(key, entry);
  }
  const turnaroundByMonth = new Map<string, number[]>();
  for (const o of ordersForTurnaroundTrend) {
    if (!o.sealedAt) continue;
    const key = monthKey(o.sealedAt);
    const arr = turnaroundByMonth.get(key) ?? [];
    arr.push((o.sealedAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    turnaroundByMonth.set(key, arr);
  }
  const monthlyTrend = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(trendWindowStart);
    d.setMonth(d.getMonth() + i);
    const key = monthKey(d);
    const rev = revenueByMonth.get(key);
    return {
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      revenueCents: rev?.revenueCents ?? 0,
      orderCount: rev?.orderCount ?? 0,
      avgTurnaroundDays: avg(turnaroundByMonth.get(key) ?? []),
    };
  });

  const onTimeCount = dueDateOrders.filter((o) => o.sealedAt! <= o.dueDate!).length;
  const onTime = {
    rate: dueDateOrders.length > 0 ? Math.round((onTimeCount / dueDateOrders.length) * 100) : null,
    onTimeCount,
    total: dueDateOrders.length,
  };

  const avgPickupLagDays = avg(
    pickedUpItemsForLag
      .filter((i) => i.pickup?.pickedUpAt && i.completedAt)
      .map((i) => (i.pickup!.pickedUpAt.getTime() - i.completedAt!.getTime()) / (1000 * 60 * 60 * 24))
  );

  const reopenedCount = reopenPopulation.filter((i) => i.reopenedAt).length;
  const reopenRate = {
    rate: reopenPopulation.length > 0 ? Math.round((reopenedCount / reopenPopulation.length) * 1000) / 10 : null,
    reopenedCount,
    total: reopenPopulation.length,
  };

  const userById = new Map(activeUsers.map((u) => [u.id, u]));
  const activity = new Map<
    string,
    { ticketsCreated: number; itemsCompleted: number; pickupsAuthorized: number; itemsAssigned: number }
  >();
  function bump(userId: string, field: "ticketsCreated" | "itemsCompleted" | "pickupsAuthorized" | "itemsAssigned", count: number) {
    const entry = activity.get(userId) ?? { ticketsCreated: 0, itemsCompleted: 0, pickupsAuthorized: 0, itemsAssigned: 0 };
    entry[field] = count;
    activity.set(userId, entry);
  }
  for (const row of ticketsCreatedByUser) bump(row.createdById, "ticketsCreated", row._count);
  for (const row of itemsCompletedByUser) if (row.completedById) bump(row.completedById, "itemsCompleted", row._count);
  for (const row of pickupsAuthorizedByUser) bump(row.authorizedById, "pickupsAuthorized", row._count);
  for (const row of itemsAssignedByUser) if (row.assignedToId) bump(row.assignedToId, "itemsAssigned", row._count);

  const teamActivity = [...activity.entries()]
    .filter(([userId]) => userById.has(userId)) // drop deactivated/deleted staff
    .map(([userId, counts]) => ({ userId, name: userById.get(userId)!.name, role: userById.get(userId)!.role, ...counts }))
    .sort((a, b) => b.ticketsCreated + b.itemsCompleted - (a.ticketsCreated + a.itemsCompleted));

  const seenOrdersForPayment = new Set<string>();
  const paymentDays: number[] = [];
  for (const row of paidAuditRows) {
    if (!row.orderId || !row.order || seenOrdersForPayment.has(row.orderId)) continue;
    seenOrdersForPayment.add(row.orderId);
    paymentDays.push((row.createdAt.getTime() - row.order.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }
  const avgDaysToFullPayment = avg(paymentDays);

  const rushCount = rushCounts.find((r) => r.isRush)?._count ?? 0;
  const rushTotal = rushCounts.reduce((sum, r) => sum + r._count, 0);
  const rushShare = { rate: rushTotal > 0 ? Math.round((rushCount / rushTotal) * 1000) / 10 : null, rushCount, total: rushTotal };

  const avgDaysToStart = avg(startedItems.map((i) => (i.startedAt!.getTime() - i.createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    totalOrders,
    orderStatusCounts: Object.fromEntries(orderStatusCounts.map((r) => [r.status, r._count])),
    itemStatusCounts: Object.fromEntries(itemStatusCounts.map((r) => [r.status, r._count])),
    paymentCounts: Object.fromEntries(paymentCounts.map((r) => [r.paymentStatus, r._count])),
    overdueActiveOrders: overdue,
    avgTurnaroundDays,
    totalRevenueCents: revenue._sum.totalPriceCents ?? 0,
    avgOrderValueCents: revenue._avg.totalPriceCents ?? 0,
    revenueByAlteration,
    revenueByGarmentType,
    revenueBySource: sourceTotals,
    needsPricing,
    totalPricingGaps,
    monthlyTrend,
    onTime,
    avgPickupLagDays,
    reopenRate,
    teamActivity,
    avgDaysToFullPayment,
    rushShare,
    avgDaysToStart,
  };
}
