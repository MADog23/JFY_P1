"use server";

import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { shopDayStart, shopDayEnd, startOfWeek, toDateInputValue, toShopDateKey } from "@/lib/dates";
import { summarizePunchesByDay, type DaySummary, type PunchLike } from "@/lib/hours";

/** Which of an item's checked alterations have no matching ALTERATION-sourced price line
 * yet — matched by label (PriceLine.description mirrors the exact alteration label when
 * source is ALTERATION, see the controlled-vocabulary note in getAnalytics below), not by
 * array position, so this stays correct even when alterations get priced out of order. A
 * label selected twice needs two matching price lines before it counts as fully priced. */
function unpricedAlterationLabels(alterations: string[], priceLines: { description: string }[]): string[] {
  const remaining = new Map<string, number>();
  for (const pl of priceLines) remaining.set(pl.description, (remaining.get(pl.description) ?? 0) + 1);
  const unpriced: string[] = [];
  for (const label of alterations) {
    const left = remaining.get(label) ?? 0;
    if (left > 0) remaining.set(label, left - 1);
    else unpriced.push(label);
  }
  return unpriced;
}

export type NeedsPricingOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  gaps: number;
  /** Only the items that actually have an unpriced alteration — a fully-priced item on
   * an otherwise-flagged order is left out rather than listed with an empty array. */
  items: { garmentType: string; unpricedAlterations: string[] }[];
};

/** Shared by getAnalytics and getPricingAnalytics — both compute "which open tickets
 * still need pricing, and specifically what on them is unpriced" from the same shape of
 * pre-fetched order/item/priceLine data. */
function buildNeedsPricing(
  orders: {
    id: string;
    orderNumber: string;
    clientName: string;
    items: { garmentType: string; alterations: string[]; priceLines: { description: string }[] }[];
  }[]
): NeedsPricingOrder[] {
  return orders
    .map((o) => {
      const items = o.items
        .map((item) => ({
          garmentType: item.garmentType,
          unpricedAlterations: unpricedAlterationLabels(item.alterations, item.priceLines),
        }))
        .filter((item) => item.unpricedAlterations.length > 0);
      const gaps = items.reduce((sum, item) => sum + item.unpricedAlterations.length, 0);
      return { id: o.id, orderNumber: o.orderNumber, clientName: o.clientName, gaps, items };
    })
    .filter((o) => o.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps);
}

export async function getAnalytics(from?: string, to?: string) {
  await requireManager();

  // NOT_CANCELLED shows up across most of the queries below — every "how many orders /
  // how much revenue / how long did things take" stat excludes an order a manager
  // soft-cancelled as a mistake (duplicate intake, wrong client, a test ticket), so a
  // handful of cleaned-up accidents can't quietly skew what's supposed to be real shop
  // performance. orderStatusCounts is the deliberate exception — that's the one place
  // CANCELLED should show up, as its own labeled bucket.
  const NOT_CANCELLED = { not: "CANCELLED" as const };

  // Optional shop-local date range (the analytics pages' shared ?from=&to= filter) —
  // when both are given, most "how much activity happened" stats below are scoped to
  // it by whichever date field each one is naturally keyed on (order creation, seal
  // date, completion, pickup...). A handful of stats stay unscoped on purpose even with
  // a range set, because they're inherently "right now" snapshots rather than
  // historical counts — see the inline notes at `overdue` and `itemsAssignedByUser`
  // below. When no range is given, every query behaves exactly as it always has.
  const range = from && to ? { gte: shopDayStart(from), lte: shopDayEnd(to) } : null;

  const [orderStatusCounts, itemStatusCounts, paymentCounts, overdue, recentSealed, totalOrders, revenue] =
    await Promise.all([
      db.order.groupBy({ by: ["status"], _count: true, where: range ? { createdAt: range } : undefined }),
      db.orderItem.groupBy({
        by: ["status"],
        _count: true,
        where: { removedAt: null, ...(range ? { createdAt: range } : {}) },
      }),
      db.order.groupBy({
        by: ["paymentStatus"],
        _count: true,
        where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
      }),
      // Deliberately unscoped even when a range is set — "overdue and still in
      // progress" is inherently a right-now snapshot of the pipeline, not a historical
      // count of how many orders were overdue at some point during the selected window.
      db.order.count({
        where: { dueDate: { lt: new Date() }, status: { in: ["IN_PROGRESS"] } },
      }),
      db.order.findMany({
        where: { status: { in: ["SEALED", "PICKED_UP"] }, sealedAt: range ? range : { not: null } },
        select: { createdAt: true, sealedAt: true },
        orderBy: { sealedAt: "desc" },
        // The 200-cap is a "recent activity" safety net for the unranged, all-time
        // case; a caller-chosen range is trusted to already be a reasonable size.
        take: range ? undefined : 200,
      }),
      db.order.count({ where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) } }),
      // Pricing is a manager-only surface end to end, so it's safe to aggregate raw
      // totals here — this whole action is already gated by requireManager() above.
      db.order.aggregate({
        where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
        _sum: { totalPriceCents: true },
        _avg: { totalPriceCents: true },
      }),
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
      where: { order: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) } },
      select: { amountCents: true, source: true, description: true, orderItem: { select: { garmentType: true } } },
    }),
    db.order.findMany({
      // status: "IN_PROGRESS" already excludes CANCELLED (it's a different value
      // entirely), so no NOT_CANCELLED needed on the order itself here. Scoped by
      // createdAt when a range is set (which open tickets from that window still need
      // pricing) — left unscoped by default, matching the all-time "what needs
      // attention right now" framing this card has always had.
      where: { status: "IN_PROGRESS", ...(range ? { createdAt: range } : {}) },
      select: {
        id: true,
        orderNumber: true,
        clientName: true,
        items: {
          // A soft-removed item was a mistake, not a garment still waiting on
          // pricing — it shouldn't show up as a "needs pricing" gap.
          where: { removedAt: null },
          select: {
            garmentType: true,
            alterations: true,
            // Only ALTERATION-sourced lines count toward "did every checked box get
            // priced" — a freeform extra doesn't retroactively cover a blank one.
            // description (not just a count) is what lets needsPricing name exactly
            // which checked alterations are still missing a price, below.
            priceLines: { where: { source: "ALTERATION" }, select: { description: true } },
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

  // Literal, self-evident metric: for each open order, name the individual checked
  // alterations that still have no ALTERATION-sourced price line — not an abstract
  // "needs attention" flag or bare count. An order with 3 alterations and 2 matching
  // price lines has exactly 1 named gap; an order with equal or more price lines has 0.
  const needsPricing = buildNeedsPricing(inProgressOrders);
  const totalPricingGaps = needsPricing.reduce((sum, o) => sum + o.gaps, 0);

  // --- Historical trends & operational metrics --------------------------------
  // Everything below was already being recorded by some existing action (order/item
  // timestamps, the audit log, pickup records) — none of this needed a schema change
  // except the two fields called out inline (isRush, startedAt).
  let monthsBack: number;
  let trendWindowStart: Date;
  if (range) {
    // Responsive to the selected range instead of a fixed trailing window — one bucket
    // per calendar month the range touches, capped so a multi-year range still renders
    // a reasonably sized table instead of one row per month since forever.
    const startOfFirstMonth = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const startOfLastMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    const spanMonths =
      (startOfLastMonth.getFullYear() - startOfFirstMonth.getFullYear()) * 12 +
      (startOfLastMonth.getMonth() - startOfFirstMonth.getMonth()) +
      1;
    monthsBack = Math.min(24, Math.max(1, spanMonths));
    trendWindowStart = startOfFirstMonth;
  } else {
    monthsBack = 6;
    trendWindowStart = new Date();
    trendWindowStart.setDate(1);
    trendWindowStart.setHours(0, 0, 0, 0);
    trendWindowStart.setMonth(trendWindowStart.getMonth() - (monthsBack - 1));
  }
  // Only set when a range is active — without it, the trend queries below stay
  // open-ended ("since trendWindowStart, up to now"), exactly as before.
  const trendUpperBound = range ? range.lte : undefined;

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
    cancelledOrdersForTrend,
  ] = await Promise.all([
    db.order.findMany({
      where: {
        createdAt: trendUpperBound ? { gte: trendWindowStart, lte: trendUpperBound } : { gte: trendWindowStart },
        status: NOT_CANCELLED,
      },
      select: { createdAt: true, totalPriceCents: true },
    }),
    db.order.findMany({
      where: {
        sealedAt: trendUpperBound ? { gte: trendWindowStart, lte: trendUpperBound } : { gte: trendWindowStart },
        status: NOT_CANCELLED,
      },
      select: { createdAt: true, sealedAt: true },
    }),
    // On-time rate: every order that has both a due date and a seal date (i.e. the
    // work is fully done, pickup notwithstanding). All-time by default; scoped to
    // orders sealed within the selected range when one is set. Excludes an order
    // sealed and then later cancelled, same as everything else here.
    db.order.findMany({
      where: { dueDate: { not: null }, sealedAt: range ? range : { not: null }, status: NOT_CANCELLED },
      select: { dueDate: true, sealedAt: true },
    }),
    // Pickup lag: how long a finished item sits after completion before it's actually
    // picked up. Fetched unscoped and filtered in JS below by the pickup's own
    // pickedUpAt when a range is set — pickup is a nested relation, and this keeps the
    // where-clause shape identical to before rather than risking new relation-filter
    // syntax on a query that already isn't cheap.
    db.orderItem.findMany({
      where: { status: "PICKED_UP", completedAt: { not: null } },
      select: { completedAt: true, pickup: { select: { pickedUpAt: true } } },
    }),
    // Reopen rate's denominator is "items that have been completed at least once" —
    // completedAt/completedById get reset to null on reopen (see reopenItem), so
    // status COMPLETED/PICKED_UP-or-reopenedAt-not-null is how to find that
    // population rather than filtering on completedAt directly. Scoped by intake
    // (createdAt) when a range is set: "of items created in this window, how many
    // were later reopened."
    db.orderItem.findMany({
      where: {
        OR: [{ status: { in: ["COMPLETED", "PICKED_UP"] } }, { reopenedAt: { not: null } }],
        // An item that was completed, reopened, and THEN removed as a mistake
        // shouldn't count toward "how often does work get reopened."
        removedAt: null,
        ...(range ? { createdAt: range } : {}),
      },
      select: { reopenedAt: true },
    }),
    db.order.groupBy({
      by: ["createdById"],
      _count: true,
      where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
    }),
    // completedById/authorizedById: an item can only reach COMPLETED/PICKED_UP while NOT
    // removed (removeItem refuses once an item is past IN_PROGRESS — see
    // actions/items.ts), so these two are structurally unaffected by item removal. Left
    // un-filtered by order cancellation too: an order being cancelled AFTER an item was
    // fully completed and picked up is a rare enough edge case that it's not worth the
    // extra join here, unlike the revenue/volume stats above where it's a real,
    // reasonably likely way to skew a headline number.
    db.orderItem.groupBy({
      by: ["completedById"],
      _count: true,
      where: { completedById: { not: null }, ...(range ? { completedAt: range } : {}) },
    }),
    db.itemPickup.groupBy({ by: ["authorizedById"], _count: true, where: range ? { pickedUpAt: range } : undefined }),
    db.orderItem.groupBy({
      by: ["assignedToId"],
      _count: true,
      // Deliberately unscoped even when a range is set — matches the same "assigned to
      // me, right now" definition used in actions/orders.ts's listOrders and the
      // Employees analytics page's "currently assigned" column. A removed item's stale
      // assignment shouldn't inflate anyone's count either way.
      where: { assignedToId: { not: null }, removedAt: null },
    }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } }),
    // Time to full payment: AuditLog has no structured old/new-value fields, so this
    // matches the exact summary text updatePaymentStatus writes — if that wording
    // ever changes, this match needs to change with it. Restricted to orders whose
    // *current* paymentStatus is PAID, and (ordered ascending) the first such row per
    // order, so a since-reversed status doesn't get counted and a flip-flopped one
    // isn't double counted. Scoped to orders created within the selected range, when set.
    db.auditLog.findMany({
      where: {
        action: "PAYMENT_STATUS_CHANGED",
        summary: { contains: "set to PAID by" },
        order: { paymentStatus: "PAID", status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
      },
      select: { orderId: true, createdAt: true, order: { select: { createdAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.order.groupBy({
      by: ["isRush"],
      _count: true,
      where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
    }),
    // Cycle time (intake -> first work): bounded like avgTurnaroundDays above so this
    // stays a snapshot of recent activity rather than scanning the whole table.
    // removedAt: null matters here specifically — an item can be started (startedAt
    // set) and then removed as a duplicate/mistake before ever completing, which would
    // otherwise drag "avg days to start work" toward a stray removed item's numbers.
    db.orderItem.findMany({
      where: { startedAt: { not: null }, removedAt: null, ...(range ? { createdAt: range } : {}) },
      // completedAt added alongside startedAt/createdAt so the same fetch can answer both
      // "intake -> first work" (avgDaysToStart) and "first work -> done" (avgDaysWorking,
      // below) — the two halves of turnaround, split so a manager can tell a slow queue
      // apart from slow work once it's actually started.
      select: { createdAt: true, startedAt: true, completedAt: true },
      orderBy: { startedAt: "desc" },
      take: range ? undefined : 300,
    }),
    // Cancellation trend — same shape/window as ordersForVolumeRevenue above, but the
    // CANCELLED orders that query deliberately excludes. Folded into monthlyTrend below
    // so "did cancellations spike a given month" sits right next to revenue/volume rather
    // than needing its own separate chart.
    db.order.findMany({
      where: {
        createdAt: trendUpperBound ? { gte: trendWindowStart, lte: trendUpperBound } : { gte: trendWindowStart },
        status: "CANCELLED",
      },
      select: { createdAt: true },
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
  // Cancellations bucket by creation month too, same as revenue/volume — "of the orders
  // that came in this month, how many were later cancelled," not "how many were cancelled
  // during this month" (a January order cancelled in March counts toward January).
  const cancelledByMonth = new Map<string, number>();
  for (const o of cancelledOrdersForTrend) {
    const key = monthKey(o.createdAt);
    cancelledByMonth.set(key, (cancelledByMonth.get(key) ?? 0) + 1);
  }
  const monthlyTrend = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(trendWindowStart);
    d.setMonth(d.getMonth() + i);
    const key = monthKey(d);
    const rev = revenueByMonth.get(key);
    const orderCount = rev?.orderCount ?? 0;
    const cancelledCount = cancelledByMonth.get(key) ?? 0;
    const monthTotal = orderCount + cancelledCount;
    return {
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      revenueCents: rev?.revenueCents ?? 0,
      orderCount,
      avgTurnaroundDays: avg(turnaroundByMonth.get(key) ?? []),
      cancelledCount,
      cancellationRatePct: monthTotal > 0 ? Math.round((cancelledCount / monthTotal) * 1000) / 10 : null,
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
      .filter((i) => !range || (i.pickup!.pickedUpAt >= range.gte && i.pickup!.pickedUpAt <= range.lte))
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

  // The other half of turnaround: once someone actually starts an item, how long does the
  // work itself take? Only items that have gone all the way to completedAt count here —
  // a still-in-progress item hasn't finished the "work" leg yet, so it can't contribute a
  // duration. Paired with avgDaysToStart above, this is meant to answer "is turnaround
  // slipping because tickets sit unstarted longer, or because the work itself is taking
  // longer" — two different problems that used to be invisible inside one blended number.
  const workedItems = startedItems.filter((i) => i.completedAt);
  const avgDaysWorking = avg(
    workedItems.map((i) => (i.completedAt!.getTime() - i.startedAt!.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Cancellation rate: reuses orderStatusCounts (already fetched above, already scoped to
  // the selected range, and — per that query's own comment — the one place CANCELLED is
  // deliberately left in rather than filtered out) instead of a new query.
  const cancelledOrderCount = orderStatusCounts.find((r) => r.status === "CANCELLED")?._count ?? 0;
  const totalCreatedIncludingCancelled = orderStatusCounts.reduce((sum, r) => sum + r._count, 0);
  const cancellationRate = {
    rate:
      totalCreatedIncludingCancelled > 0
        ? Math.round((cancelledOrderCount / totalCreatedIncludingCancelled) * 1000) / 10
        : null,
    cancelledCount: cancelledOrderCount,
    total: totalCreatedIncludingCancelled,
  };

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
    avgDaysWorking,
    cancellationRate,
  };
}

// ============================================================================
// Employee analytics — a date-ranged view (unlike getAnalytics's all-time
// teamActivity snapshot above), since "how many hours did this person work this
// month" is the natural question here, not "ever." Phase 2 data (shifts/punches/
// time off) — the tables exist regardless of PHASE2_ENABLED (see schema.prisma's
// header), so this reads real data even if staff-facing Phase 2 pages are
// currently switched off for the team.
//
// "Overtime" means worked minutes beyond 40 in a shop week (Mon-Sun, see
// lib/dates.ts) — a plain factual threshold, not a pay-rate or multiplier
// decision. This app deliberately computes no pay (see lib/hours.ts's header);
// a manager who needs an actual payroll number takes hours from here to
// whatever does that.
// ============================================================================

const MINUTES_PER_OT_WEEK = 40 * 60;

async function getActivePunchesForRange(userId: string, from: Date, to: Date): Promise<PunchLike[]> {
  const rows = await db.punch.findMany({
    where: { userId, voidedAt: null, timestamp: { gte: from, lte: to } },
    select: { id: true, type: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });
  return rows as PunchLike[];
}

function weekKeyForDateKey(dateKey: string): string {
  return toDateInputValue(startOfWeek(shopDayStart(dateKey)));
}

/** Total worked minutes plus overtime minutes (worked beyond 40 in any shop week the
 * `days` touch) for one employee's already-summarized daily totals. A week only
 * partially covered by the caller's date range is summed from just the days actually
 * present — this is "overtime within the days you looked at," not a claim about a full
 * calendar week that extends outside the query. */
function summarizeWorkedAndOvertime(days: DaySummary[]): { workedMinutes: number; overtimeMinutes: number } {
  const byWeek = new Map<string, number>();
  let workedMinutes = 0;
  for (const day of days) {
    workedMinutes += day.totalMinutes;
    const weekKey = weekKeyForDateKey(day.date);
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + day.totalMinutes);
  }
  let overtimeMinutes = 0;
  for (const minutes of byWeek.values()) {
    if (minutes > MINUTES_PER_OT_WEEK) overtimeMinutes += minutes - MINUTES_PER_OT_WEEK;
  }
  return { workedMinutes, overtimeMinutes };
}

function shiftMinutes(shifts: { startAt: Date; endAt: Date }[]): number {
  return shifts.reduce((sum, s) => sum + (s.endAt.getTime() - s.startAt.getTime()) / 60000, 0);
}

export type EmployeeAnalyticsRow = {
  userId: string;
  name: string;
  role: "EMPLOYEE" | "MANAGER";
  scheduledMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  ticketsCreated: number;
  itemsCompleted: number;
  pickupsAuthorized: number;
  currentlyAssigned: number;
};

/** MANAGER: every active employee's date-ranged roster summary — the landing table on
 * the Employees analytics page, before drilling into any one person. */
export async function getEmployeeAnalyticsOverview(from: string, to: string): Promise<EmployeeAnalyticsRow[]> {
  await requireManager();
  const range = { from: shopDayStart(from), to: shopDayEnd(to) };
  const NOT_CANCELLED = { not: "CANCELLED" as const };

  const [users, ticketsByUser, itemsCompletedByUser, pickupsByUser, assignedByUser] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.order.groupBy({
      by: ["createdById"],
      _count: true,
      where: { status: NOT_CANCELLED, createdAt: { gte: range.from, lte: range.to } },
    }),
    db.orderItem.groupBy({
      by: ["completedById"],
      _count: true,
      where: { completedById: { not: null }, completedAt: { gte: range.from, lte: range.to } },
    }),
    db.itemPickup.groupBy({ by: ["authorizedById"], _count: true, where: { pickedUpAt: { gte: range.from, lte: range.to } } }),
    // Not date-ranged, deliberately — "currently assigned" is an inherently "right now"
    // count (what's on someone's plate today), the same definition getAnalytics's
    // teamActivity uses, regardless of which date range the rest of this page is showing.
    db.orderItem.groupBy({ by: ["assignedToId"], _count: true, where: { assignedToId: { not: null }, removedAt: null } }),
  ]);

  const ticketsMap = new Map(ticketsByUser.map((r) => [r.createdById, r._count]));
  const itemsMap = new Map(itemsCompletedByUser.filter((r) => r.completedById).map((r) => [r.completedById as string, r._count]));
  const pickupsMap = new Map(pickupsByUser.map((r) => [r.authorizedById, r._count]));
  const assignedMap = new Map(assignedByUser.filter((r) => r.assignedToId).map((r) => [r.assignedToId as string, r._count]));

  const rows: EmployeeAnalyticsRow[] = [];
  for (const user of users) {
    const [shifts, punches] = await Promise.all([
      db.shift.findMany({
        where: { userId: user.id, cancelledAt: null, publishedAt: { not: null }, startAt: { lte: range.to }, endAt: { gte: range.from } },
        select: { startAt: true, endAt: true },
      }),
      getActivePunchesForRange(user.id, range.from, range.to),
    ]);
    const { workedMinutes, overtimeMinutes } = summarizeWorkedAndOvertime(summarizePunchesByDay(punches));
    rows.push({
      userId: user.id,
      name: user.name,
      role: user.role,
      scheduledMinutes: shiftMinutes(shifts),
      workedMinutes,
      overtimeMinutes,
      ticketsCreated: ticketsMap.get(user.id) ?? 0,
      itemsCompleted: itemsMap.get(user.id) ?? 0,
      pickupsAuthorized: pickupsMap.get(user.id) ?? 0,
      currentlyAssigned: assignedMap.get(user.id) ?? 0,
    });
  }
  return rows.sort((a, b) => b.workedMinutes - a.workedMinutes);
}

export type EmployeeAnalyticsDetail = {
  userId: string;
  name: string;
  role: "EMPLOYEE" | "MANAGER";
  scheduledMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  /** One row per shop week (Mon-Sun) touched by the range, oldest first — lets a
   * manager see WHERE a scheduled-vs-actual gap or an overtime week actually fell,
   * not just a range-wide total. */
  weeklyBreakdown: { weekStart: string; scheduledMinutes: number; workedMinutes: number; overtimeMinutes: number }[];
  ticketsCreated: number;
  itemsCompleted: number;
  avgItemTurnaroundDays: number | null;
  garmentBreakdown: { label: string; count: number }[];
  pickupsAuthorized: number;
  currentlyAssigned: number;
  approvedTimeOffDays: number;
  approvedTimeOffCount: number;
};

/** MANAGER: one employee's full date-ranged drill-down — garment turnover, scheduled vs.
 * actual hours (with overtime), and their ticket/pickup/assignment activity in range. */
export async function getEmployeeAnalyticsDetail(userId: string, from: string, to: string): Promise<EmployeeAnalyticsDetail | null> {
  await requireManager();
  const range = { from: shopDayStart(from), to: shopDayEnd(to) };
  const NOT_CANCELLED = { not: "CANCELLED" as const };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
  if (!user) return null;

  const [shifts, punches, ticketsCreated, completedItems, pickupsAuthorized, currentlyAssigned, timeOffApproved] = await Promise.all([
    db.shift.findMany({
      where: { userId, cancelledAt: null, publishedAt: { not: null }, startAt: { lte: range.to }, endAt: { gte: range.from } },
      select: { startAt: true, endAt: true },
    }),
    getActivePunchesForRange(userId, range.from, range.to),
    db.order.count({ where: { createdById: userId, status: NOT_CANCELLED, createdAt: { gte: range.from, lte: range.to } } }),
    // "Garment turnover" for this person: garments THEY completed in range, and how long
    // (creation -> their completion) each took — an item-level cycle time, not the
    // order-level turnaround Overview/Pricing use.
    db.orderItem.findMany({
      where: { completedById: userId, completedAt: { gte: range.from, lte: range.to } },
      select: { garmentType: true, createdAt: true, completedAt: true },
    }),
    db.itemPickup.count({ where: { authorizedById: userId, pickedUpAt: { gte: range.from, lte: range.to } } }),
    db.orderItem.count({ where: { assignedToId: userId, removedAt: null } }),
    // Overlap, not clipped to the range — same convention actions/time-off.ts's
    // dateRangeWhere already uses, so a request that only partially falls in the
    // queried range still counts (in full) rather than being silently trimmed.
    db.timeOffRequest.findMany({
      where: { userId, status: "APPROVED", startDate: { lte: range.to }, endDate: { gte: range.from } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const days = summarizePunchesByDay(punches);
  const { workedMinutes, overtimeMinutes } = summarizeWorkedAndOvertime(days);

  const weekMap = new Map<string, { scheduledMinutes: number; workedMinutes: number }>();
  for (const s of shifts) {
    const weekKey = weekKeyForDateKey(toShopDateKey(s.startAt));
    const entry = weekMap.get(weekKey) ?? { scheduledMinutes: 0, workedMinutes: 0 };
    entry.scheduledMinutes += (s.endAt.getTime() - s.startAt.getTime()) / 60000;
    weekMap.set(weekKey, entry);
  }
  for (const day of days) {
    const weekKey = weekKeyForDateKey(day.date);
    const entry = weekMap.get(weekKey) ?? { scheduledMinutes: 0, workedMinutes: 0 };
    entry.workedMinutes += day.totalMinutes;
    weekMap.set(weekKey, entry);
  }
  const weeklyBreakdown = [...weekMap.entries()]
    .map(([weekStart, v]) => ({
      weekStart,
      scheduledMinutes: v.scheduledMinutes,
      workedMinutes: v.workedMinutes,
      overtimeMinutes: Math.max(0, v.workedMinutes - MINUTES_PER_OT_WEEK),
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

  const garmentCounts = new Map<string, number>();
  for (const item of completedItems) garmentCounts.set(item.garmentType, (garmentCounts.get(item.garmentType) ?? 0) + 1);
  const garmentBreakdown = [...garmentCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const turnaroundDays = completedItems
    .filter((i) => i.completedAt)
    .map((i) => (i.completedAt!.getTime() - i.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgItemTurnaroundDays =
    turnaroundDays.length > 0 ? Math.round((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length) * 10) / 10 : null;

  const approvedTimeOffDays = timeOffApproved.reduce(
    (sum, r) => sum + Math.round((r.endDate.getTime() - r.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    0
  );

  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    scheduledMinutes: shiftMinutes(shifts),
    workedMinutes,
    overtimeMinutes,
    weeklyBreakdown,
    ticketsCreated,
    itemsCompleted: completedItems.length,
    avgItemTurnaroundDays,
    garmentBreakdown,
    pickupsAuthorized,
    currentlyAssigned,
    approvedTimeOffDays,
    approvedTimeOffCount: timeOffApproved.length,
  };
}

// ============================================================================
// Pricing analytics — a deeper dive than Overview's pricing cards: a longer trend
// window, full (unsliced) alteration/garment lists, and an order-value distribution
// Overview doesn't show. Built from the exact same underlying data (itemized
// PriceLine rows) — nothing new was recorded for this, same as everything else in
// analytics.
// ============================================================================

const PRICE_BUCKET_LABELS = ["Unpriced ($0)", "Under $25", "$25 – $49", "$50 – $99", "$100 – $199", "$200 – $399", "$400+"] as const;

function priceBucketLabel(cents: number): (typeof PRICE_BUCKET_LABELS)[number] {
  const dollars = cents / 100;
  if (dollars <= 0) return "Unpriced ($0)";
  if (dollars < 25) return "Under $25";
  if (dollars < 50) return "$25 – $49";
  if (dollars < 100) return "$50 – $99";
  if (dollars < 200) return "$100 – $199";
  if (dollars < 400) return "$200 – $399";
  return "$400+";
}

export type PricingAnalytics = {
  monthlyTrend: { month: string; label: string; revenueCents: number; orderCount: number; avgOrderValueCents: number }[];
  revenueByAlteration: { label: string; totalCents: number; count: number; avgCents: number }[];
  revenueByGarmentType: { label: string; totalCents: number; count: number; avgCents: number }[];
  revenueBySource: Record<string, number>;
  priceDistribution: { label: string; count: number }[];
  needsPricing: NeedsPricingOrder[];
  totalPricingGaps: number;
  totalRevenueCents: number;
  avgOrderValueCents: number;
  totalPricedOrders: number;
};

/** MANAGER: the Pricing analytics page — a 12-month trend (by default) plus the full
 * (not top-8) alteration/garment revenue breakdowns, price distribution, and pricing
 * gaps. Accepts the same optional shop-local from/to range as getAnalytics — every
 * query here behaves exactly as before when it's omitted. */
export async function getPricingAnalytics(from?: string, to?: string): Promise<PricingAnalytics> {
  await requireManager();
  const NOT_CANCELLED = { not: "CANCELLED" as const };
  const range = from && to ? { gte: shopDayStart(from), lte: shopDayEnd(to) } : null;

  let monthsBack: number;
  let trendWindowStart: Date;
  if (range) {
    const startOfFirstMonth = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const startOfLastMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    const spanMonths =
      (startOfLastMonth.getFullYear() - startOfFirstMonth.getFullYear()) * 12 +
      (startOfLastMonth.getMonth() - startOfFirstMonth.getMonth()) +
      1;
    monthsBack = Math.min(24, Math.max(1, spanMonths));
    trendWindowStart = startOfFirstMonth;
  } else {
    monthsBack = 12;
    trendWindowStart = new Date();
    trendWindowStart.setDate(1);
    trendWindowStart.setHours(0, 0, 0, 0);
    trendWindowStart.setMonth(trendWindowStart.getMonth() - (monthsBack - 1));
  }
  const trendUpperBound = range ? range.lte : undefined;

  const [ordersForTrend, allOrderValues, revenue, priceLines, inProgressOrders] = await Promise.all([
    db.order.findMany({
      where: {
        createdAt: trendUpperBound ? { gte: trendWindowStart, lte: trendUpperBound } : { gte: trendWindowStart },
        status: NOT_CANCELLED,
      },
      select: { createdAt: true, totalPriceCents: true },
    }),
    db.order.findMany({
      where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
      select: { totalPriceCents: true },
    }),
    db.order.aggregate({
      where: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) },
      _sum: { totalPriceCents: true },
      _avg: { totalPriceCents: true },
      _count: true,
    }),
    db.priceLine.findMany({
      where: { order: { status: NOT_CANCELLED, ...(range ? { createdAt: range } : {}) } },
      select: { amountCents: true, source: true, description: true, orderItem: { select: { garmentType: true } } },
    }),
    db.order.findMany({
      where: { status: "IN_PROGRESS", ...(range ? { createdAt: range } : {}) },
      select: {
        id: true,
        orderNumber: true,
        clientName: true,
        items: {
          where: { removedAt: null },
          select: {
            garmentType: true,
            alterations: true,
            priceLines: { where: { source: "ALTERATION" }, select: { description: true } },
          },
        },
      },
    }),
  ]);

  function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const byMonth = new Map<string, { revenueCents: number; orderCount: number }>();
  for (const o of ordersForTrend) {
    const key = monthKey(o.createdAt);
    const entry = byMonth.get(key) ?? { revenueCents: 0, orderCount: 0 };
    entry.revenueCents += o.totalPriceCents;
    entry.orderCount += 1;
    byMonth.set(key, entry);
  }
  const monthlyTrend = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(trendWindowStart);
    d.setMonth(d.getMonth() + i);
    const key = monthKey(d);
    const entry = byMonth.get(key);
    return {
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      revenueCents: entry?.revenueCents ?? 0,
      orderCount: entry?.orderCount ?? 0,
      avgOrderValueCents: entry && entry.orderCount > 0 ? Math.round(entry.revenueCents / entry.orderCount) : 0,
    };
  });

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
    .map(([label, v]) => ({ label, totalCents: v.totalCents, count: v.count, avgCents: Math.round(v.totalCents / v.count) }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const bucketCounts = new Map<string, number>(PRICE_BUCKET_LABELS.map((l) => [l, 0]));
  for (const o of allOrderValues) {
    const label = priceBucketLabel(o.totalPriceCents);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + 1);
  }
  const priceDistribution = PRICE_BUCKET_LABELS.map((label) => ({ label, count: bucketCounts.get(label) ?? 0 }));

  const needsPricing = buildNeedsPricing(inProgressOrders);
  const totalPricingGaps = needsPricing.reduce((sum, o) => sum + o.gaps, 0);

  return {
    monthlyTrend,
    revenueByAlteration,
    revenueByGarmentType,
    revenueBySource: sourceTotals,
    priceDistribution,
    needsPricing,
    totalPricingGaps,
    totalRevenueCents: revenue._sum.totalPriceCents ?? 0,
    avgOrderValueCents: Math.round(revenue._avg.totalPriceCents ?? 0),
    totalPricedOrders: revenue._count,
  };
}

// ============================================================================
// Garment & alteration analytics — narrows in on individual garment/alteration
// types rather than money alone: volume, completion rate, and turnaround per
// garment type; how often each alteration is actually selected vs. priced.
// Deliberately excludes soft-removed items (and price lines tied to them) from
// every count here — a removed item was a data-entry mistake (duplicate, wrong
// garment), not real garment volume, matching OrderItem.removedAt's documented
// intent ("excluded from status computation and analytics") more strictly than
// getAnalytics's own revenue-by-garment card does today.
// ============================================================================

export type GarmentAnalyticsRow = {
  label: string;
  itemCount: number;
  completedCount: number;
  avgTurnaroundDays: number | null;
  revenueCents: number;
  avgPriceCents: number | null;
  shareOfVolumePct: number;
};

export type AlterationAnalyticsRow = {
  label: string;
  timesSelected: number;
  timesPriced: number;
  revenueCents: number;
  avgPriceCents: number | null;
};

export type GarmentAnalytics = {
  garments: GarmentAnalyticsRow[];
  alterations: AlterationAnalyticsRow[];
  totalItems: number;
};

/** MANAGER: the Garments analytics page — per garment-type volume/completion/turnaround/
 * revenue, and per-alteration-type frequency (selected vs. actually priced) and revenue.
 * Accepts the same optional shop-local from/to range as getAnalytics/getPricingAnalytics
 * — every query behaves exactly as before (all-time) when it's omitted. When set, items
 * are scoped by intake (createdAt), same as everywhere else "when did this ticket come
 * in" is the relevant date. */
export async function getGarmentAnalytics(from?: string, to?: string): Promise<GarmentAnalytics> {
  await requireManager();
  const NOT_CANCELLED = { not: "CANCELLED" as const };
  const range = from && to ? { gte: shopDayStart(from), lte: shopDayEnd(to) } : null;

  const [items, priceLines] = await Promise.all([
    db.orderItem.findMany({
      where: { removedAt: null, order: { status: NOT_CANCELLED }, ...(range ? { createdAt: range } : {}) },
      select: { garmentType: true, alterations: true, createdAt: true, completedAt: true },
    }),
    // Order-level freeform lines (orderItemId null) pass the OR untouched — they never
    // attribute to a garment/alteration below anyway — while a line tied to a removed
    // item is excluded, consistent with excluding that item from `items` above. When a
    // range is set, an item-tied line is also excluded unless ITS item falls in the
    // same range as `items` above, so "revenue by garment" and "volume by garment" stay
    // in sync for whatever window is selected.
    db.priceLine.findMany({
      where: {
        order: { status: NOT_CANCELLED },
        OR: [{ orderItemId: null }, { orderItem: { removedAt: null, ...(range ? { createdAt: range } : {}) } }],
      },
      select: { amountCents: true, source: true, description: true, orderItem: { select: { garmentType: true } } },
    }),
  ]);

  const garmentAgg = new Map<
    string,
    { itemCount: number; completedCount: number; turnaroundSum: number; turnaroundCount: number; revenueCents: number; priceCount: number }
  >();
  for (const item of items) {
    const entry = garmentAgg.get(item.garmentType) ?? {
      itemCount: 0,
      completedCount: 0,
      turnaroundSum: 0,
      turnaroundCount: 0,
      revenueCents: 0,
      priceCount: 0,
    };
    entry.itemCount += 1;
    if (item.completedAt) {
      entry.completedCount += 1;
      entry.turnaroundSum += (item.completedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      entry.turnaroundCount += 1;
    }
    garmentAgg.set(item.garmentType, entry);
  }

  const alterationSelected = new Map<string, number>();
  for (const item of items) {
    for (const label of item.alterations) alterationSelected.set(label, (alterationSelected.get(label) ?? 0) + 1);
  }

  const alterationPricing = new Map<string, { revenueCents: number; timesPriced: number }>();
  for (const pl of priceLines) {
    if (pl.source === "ALTERATION") {
      const entry = alterationPricing.get(pl.description) ?? { revenueCents: 0, timesPriced: 0 };
      entry.revenueCents += pl.amountCents;
      entry.timesPriced += 1;
      alterationPricing.set(pl.description, entry);
    }
    if (pl.orderItem) {
      const g = garmentAgg.get(pl.orderItem.garmentType);
      if (g) {
        g.revenueCents += pl.amountCents;
        g.priceCount += 1;
      }
    }
  }

  const totalItems = items.length;
  const garments: GarmentAnalyticsRow[] = [...garmentAgg.entries()]
    .map(([label, v]) => ({
      label,
      itemCount: v.itemCount,
      completedCount: v.completedCount,
      avgTurnaroundDays: v.turnaroundCount > 0 ? Math.round((v.turnaroundSum / v.turnaroundCount) * 10) / 10 : null,
      revenueCents: v.revenueCents,
      avgPriceCents: v.priceCount > 0 ? Math.round(v.revenueCents / v.priceCount) : null,
      shareOfVolumePct: totalItems > 0 ? Math.round((v.itemCount / totalItems) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.itemCount - a.itemCount);

  const alterations: AlterationAnalyticsRow[] = [...alterationSelected.entries()]
    .map(([label, timesSelected]) => {
      const pricing = alterationPricing.get(label);
      return {
        label,
        timesSelected,
        timesPriced: pricing?.timesPriced ?? 0,
        revenueCents: pricing?.revenueCents ?? 0,
        avgPriceCents: pricing && pricing.timesPriced > 0 ? Math.round(pricing.revenueCents / pricing.timesPriced) : null,
      };
    })
    .sort((a, b) => b.timesSelected - a.timesSelected);

  return { garments, alterations, totalItems };
}

// ============================================================================
// Client relationships — repeat-client rate and top clients by lifetime spend.
// There's no separate Client table (see Order's schema comment: clientName/clientPhone/
// clientEmail live directly on Order) so clientPhone, trimmed, is the dedup key here —
// a phone typed with different spacing/punctuation across two visits won't match, a
// known and accepted limitation rather than something worth a real dedup pass right now.
// ============================================================================

export type TopClient = {
  clientName: string;
  clientPhone: string;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: Date;
};

export type ClientAnalytics = {
  /** Of every distinct client the shop has ever had (all-time, not range-scoped — a
   * client's history doesn't reset because a range filter is set), what share have
   * placed more than one order. */
  repeatClientRatePct: number | null;
  totalClients: number;
  repeatClients: number;
  /** Of the orders that fall in the selected window (or all-time, unscoped), what share
   * came from a client who had already ordered before — a client's very first-ever order
   * never counts as "repeat," even if that first order is the only one inside the window. */
  repeatOrderSharePct: number | null;
  ordersInWindow: number;
  repeatOrdersInWindow: number;
  /** By lifetime spend (not scoped to the selected window — "who are our best clients,
   * period" is the useful question here, not "who spent the most in the last 30 days"). */
  topClients: TopClient[];
};

/** MANAGER: repeat-business and top-client snapshot for the Overview page. Accepts the
 * same optional shop-local from/to as getAnalytics — only repeatOrderSharePct (which
 * orders count as "in the window") responds to it; repeat-client identity and the
 * top-clients list are always computed from full order history. */
export async function getClientAnalytics(from?: string, to?: string): Promise<ClientAnalytics> {
  await requireManager();
  const NOT_CANCELLED = { not: "CANCELLED" as const };
  const range = from && to ? { gte: shopDayStart(from), lte: shopDayEnd(to) } : null;

  const allOrders = await db.order.findMany({
    where: { status: NOT_CANCELLED },
    select: { clientPhone: true, clientName: true, createdAt: true, totalPriceCents: true },
    orderBy: { createdAt: "asc" },
    // Generous safety cap, same spirit as the 200/300-row caps elsewhere in this file for
    // an all-time, unbounded query — comfortably past what this shop is likely to reach
    // any time soon, revisit if it ever gets close.
    take: 20000,
  });

  const byPhone = new Map<string, { clientName: string; orders: { createdAt: Date; totalPriceCents: number }[] }>();
  for (const o of allOrders) {
    const phone = o.clientPhone.trim();
    if (!phone) continue; // required field in practice, but stay defensive
    const entry = byPhone.get(phone) ?? { clientName: o.clientName, orders: [] };
    entry.clientName = o.clientName; // keep whichever name is most recent for this phone
    entry.orders.push({ createdAt: o.createdAt, totalPriceCents: o.totalPriceCents });
    byPhone.set(phone, entry);
  }

  const totalClients = byPhone.size;
  let repeatClients = 0;
  let ordersInWindow = 0;
  let repeatOrdersInWindow = 0;
  const topClients: TopClient[] = [];

  for (const [phone, v] of byPhone) {
    if (v.orders.length > 1) repeatClients++;

    const totalSpentCents = v.orders.reduce((sum, o) => sum + o.totalPriceCents, 0);
    topClients.push({
      clientName: v.clientName,
      clientPhone: phone,
      orderCount: v.orders.length,
      totalSpentCents,
      lastOrderAt: v.orders[v.orders.length - 1].createdAt, // orders arrive pre-sorted asc
    });

    v.orders.forEach((o, i) => {
      const inWindow = range ? o.createdAt >= range.gte && o.createdAt <= range.lte : true;
      if (!inWindow) return;
      ordersInWindow++;
      if (i > 0) repeatOrdersInWindow++; // i > 0 means this client had an earlier order
    });
  }

  topClients.sort((a, b) => b.totalSpentCents - a.totalSpentCents);

  return {
    repeatClientRatePct: totalClients > 0 ? Math.round((repeatClients / totalClients) * 1000) / 10 : null,
    totalClients,
    repeatClients,
    repeatOrderSharePct: ordersInWindow > 0 ? Math.round((repeatOrdersInWindow / ordersInWindow) * 1000) / 10 : null,
    ordersInWindow,
    repeatOrdersInWindow,
    topClients: topClients.slice(0, 8),
  };
}

// ============================================================================
// Aging / unclaimed items — garments that are fully finished (item status COMPLETED)
// but haven't reached PICKED_UP yet. Deliberately unscoped by any date range, same as
// `overdue` in getAnalytics above — this is a right-now snapshot of what's physically
// sitting on the rack, not a historical count of what was ever waiting during some window.
// ============================================================================

export type AgingOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  maxDaysWaiting: number;
  items: { garmentType: string; daysWaiting: number }[];
};

/** MANAGER: every finished-but-not-picked-up item, grouped by order, longest-waiting
 * order first — the "state of the shop right now" list for Overview. */
export async function getAgingItems(): Promise<AgingOrder[]> {
  await requireManager();

  const items = await db.orderItem.findMany({
    where: {
      status: "COMPLETED", // finished but not yet PICKED_UP — a real status, not inferred from a missing pickup record
      removedAt: null,
      order: { status: { not: "CANCELLED" } },
    },
    select: {
      garmentType: true,
      completedAt: true,
      order: { select: { id: true, orderNumber: true, clientName: true } },
    },
  });

  const now = Date.now();
  const byOrder = new Map<string, AgingOrder>();
  for (const item of items) {
    if (!item.completedAt) continue; // status COMPLETED implies this is set, but stay defensive
    const daysWaiting = Math.floor((now - item.completedAt.getTime()) / (1000 * 60 * 60 * 24));
    const entry = byOrder.get(item.order.id) ?? {
      id: item.order.id,
      orderNumber: item.order.orderNumber,
      clientName: item.order.clientName,
      maxDaysWaiting: 0,
      items: [],
    };
    entry.items.push({ garmentType: item.garmentType, daysWaiting });
    entry.maxDaysWaiting = Math.max(entry.maxDaysWaiting, daysWaiting);
    byOrder.set(item.order.id, entry);
  }

  return [...byOrder.values()].sort((a, b) => b.maxDaysWaiting - a.maxDaysWaiting);
}

// ============================================================================
// Period headline stats — just the few numbers Overview's top KPI cards need to show a
// "vs. previous period" delta once a date range is selected. Deliberately NOT a call into
// the full getAnalytics suite above (which runs a couple dozen queries) — picking a date
// range shouldn't quietly double this page's query cost just to paint a delta arrow.
// ============================================================================

export type PeriodHeadlineStats = {
  totalRevenueCents: number;
  avgOrderValueCents: number;
  avgTurnaroundDays: number | null;
  orderCount: number;
};

/** MANAGER: the handful of headline numbers for one shop-local date range, used to
 * compute Overview's KPI deltas against the equivalent prior period. */
export async function getPeriodHeadlineStats(from: string, to: string): Promise<PeriodHeadlineStats> {
  await requireManager();
  const NOT_CANCELLED = { not: "CANCELLED" as const };
  const range = { gte: shopDayStart(from), lte: shopDayEnd(to) };

  const [revenue, sealedOrders] = await Promise.all([
    db.order.aggregate({
      where: { status: NOT_CANCELLED, createdAt: range },
      _sum: { totalPriceCents: true },
      _avg: { totalPriceCents: true },
      _count: true,
    }),
    // Same "sealed within this window" definition getAnalytics's own avgTurnaroundDays
    // uses when a range is set.
    db.order.findMany({
      where: { status: NOT_CANCELLED, sealedAt: range },
      select: { createdAt: true, sealedAt: true },
    }),
  ]);

  const turnaroundDays = sealedOrders
    .filter((o) => o.sealedAt)
    .map((o) => (o.sealedAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgTurnaroundDays =
    turnaroundDays.length > 0
      ? Math.round((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length) * 10) / 10
      : null;

  return {
    totalRevenueCents: revenue._sum.totalPriceCents ?? 0,
    avgOrderValueCents: Math.round(revenue._avg.totalPriceCents ?? 0),
    avgTurnaroundDays,
    orderCount: revenue._count,
  };
}
