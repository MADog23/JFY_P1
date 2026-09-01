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
  };
}
