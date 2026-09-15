import Link from "next/link";
import { getAnalytics, getClientAnalytics, getAgingItems, getPeriodHeadlineStats } from "@/actions/analytics";
import { formatCents } from "@/lib/money";
import { shopDayStart, addShopDays } from "@/lib/dates";
import { AnalyticsRangeFilters } from "@/components/analytics/AnalyticsRangeFilters";
import { StatCard } from "@/components/analytics/StatCard";
import { DeltaBadge } from "@/components/analytics/DeltaBadge";
import { MonthlyTrendChart } from "@/components/analytics/MonthlyTrendChart";
import { OrdinalBreakdownCard } from "@/components/analytics/OrdinalBreakdownCard";
import { CategoricalCompositionCard } from "@/components/analytics/CategoricalCompositionCard";
import { TopClientsCard } from "@/components/analytics/TopClientsCard";
import { AgingItemsCard } from "@/components/analytics/AgingItemsCard";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The immediately-preceding period of equal length to [from, to] — the comparison
 * window for the top KPI cards' "vs. previous period" delta. Plain shop-local calendar
 * math (addShopDays), same convention as everywhere else a date-range param is handled. */
function computePrevRange(from: string, to: string): { from: string; to: string } {
  const spanDays = Math.round((shopDayStart(to).getTime() - shopDayStart(from).getTime()) / 86400000) + 1;
  const prevTo = addShopDays(from, -1);
  const prevFrom = addShopDays(prevTo, -(spanDays - 1));
  return { from: prevFrom, to: prevTo };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : undefined;
  const hasRange = !!(from && to);
  const prevRange = hasRange ? computePrevRange(from!, to!) : null;

  const [stats, clientStats, agingOrders, prevPeriod] = await Promise.all([
    getAnalytics(from, to),
    getClientAnalytics(from, to),
    getAgingItems(),
    prevRange ? getPeriodHeadlineStats(prevRange.from, prevRange.to) : Promise.resolve(null),
  ]);

  const monthlyTrendPoints = stats.monthlyTrend.map((m) => ({
    month: m.month,
    label: m.label,
    valueCents: m.revenueCents,
    meta: `${m.orderCount} order${m.orderCount === 1 ? "" : "s"}${
      m.avgTurnaroundDays !== null ? ` · ${m.avgTurnaroundDays}d avg turnaround` : ""
    }${m.cancelledCount > 0 ? ` · ${m.cancelledCount} cancelled` : ""}`,
  }));

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-lg text-ink">Overview</h2>
        <p className="text-xs text-charcoal/50">
          {hasRange ? `A pulse on the shop for ${from} through ${to}.` : "A quick pulse on where the shop stands right now."}
        </p>
      </div>

      <AnalyticsRangeFilters from={from} to={to} />

      {/* --- Headline KPIs, with a vs.-previous-period delta once a range is picked --- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total revenue (priced orders)"
          value={formatCents(stats.totalRevenueCents)}
          delta={prevPeriod ? <DeltaBadge current={stats.totalRevenueCents} previous={prevPeriod.totalRevenueCents} /> : undefined}
        />
        <StatCard
          label="Avg. order value"
          value={formatCents(stats.avgOrderValueCents)}
          delta={prevPeriod ? <DeltaBadge current={stats.avgOrderValueCents} previous={prevPeriod.avgOrderValueCents} /> : undefined}
        />
        <StatCard
          label="Avg. turnaround"
          value={stats.avgTurnaroundDays !== null ? `${stats.avgTurnaroundDays} days` : "—"}
          delta={
            prevPeriod && stats.avgTurnaroundDays !== null ? (
              <DeltaBadge current={stats.avgTurnaroundDays} previous={prevPeriod.avgTurnaroundDays ?? 0} higherIsBetter={false} />
            ) : undefined
          }
        />
      </div>
      <p className="mb-6 -mt-3 text-xs text-charcoal/40">
        Based on itemized pricing entered on each order. Orders with no pricing entered yet count as $0.
        {prevPeriod ? " Deltas compare against the equivalent period immediately before the selected range." : ""}
      </p>

      {/* --- State of the shop right now: what needs a manager's attention today --- */}
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Right now</h2>
        <p className="text-xs text-charcoal/50">
          A snapshot, not scoped to the date range above — what's on the floor today, regardless of when it came in.
        </p>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total orders ever" value={stats.totalOrders} />
        <StatCard label="Overdue &amp; still in progress" value={stats.overdueActiveOrders} accent={stats.overdueActiveOrders > 0} />
        <StatCard
          label="Cancellation rate"
          value={stats.cancellationRate.rate !== null ? `${stats.cancellationRate.rate}%` : "—"}
          sublabel={`${stats.cancellationRate.cancelledCount}/${stats.cancellationRate.total} orders created${hasRange ? " in this range" : ""}`}
          accent={!!stats.cancellationRate.rate && stats.cancellationRate.rate > 10}
        />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <NeedsPricingCard orders={stats.needsPricing} totalGaps={stats.totalPricingGaps} />
        <AgingItemsCard orders={agingOrders} />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <OrdinalBreakdownCard
          title="Orders by status"
          stages={[
            { key: "IN_PROGRESS", label: "In progress", count: stats.orderStatusCounts.IN_PROGRESS ?? 0 },
            { key: "SEALED", label: "Ready for pickup", count: stats.orderStatusCounts.SEALED ?? 0 },
            { key: "PICKED_UP", label: "Fully picked up", count: stats.orderStatusCounts.PICKED_UP ?? 0 },
          ]}
        />
        <OrdinalBreakdownCard
          title="Items by status"
          stages={[
            { key: "PENDING", label: "Not started", count: stats.itemStatusCounts.PENDING ?? 0 },
            { key: "IN_PROGRESS", label: "In progress", count: stats.itemStatusCounts.IN_PROGRESS ?? 0 },
            { key: "COMPLETED", label: "Completed", count: stats.itemStatusCounts.COMPLETED ?? 0 },
            { key: "PICKED_UP", label: "Picked up", count: stats.itemStatusCounts.PICKED_UP ?? 0 },
          ]}
        />
        <OrdinalBreakdownCard
          title="Orders by payment status"
          stages={[
            { key: "UNPAID", label: "Unpaid", count: stats.paymentCounts.UNPAID ?? 0 },
            { key: "DEPOSIT_PAID", label: "Deposit paid", count: stats.paymentCounts.DEPOSIT_PAID ?? 0 },
            { key: "PAID", label: "Paid", count: stats.paymentCounts.PAID ?? 0 },
          ]}
        />
      </div>

      {/* --- Pricing insights --- */}
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Pricing insights</h2>
        <p className="text-xs text-charcoal/50">
          Built from the itemized price lines entered on each ticket — alteration and garment-type
          breakdowns only cover standard pricing, since write-in charges don't have a consistent label
          to group by.
        </p>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <RevenueByLabelCard title="Revenue by alteration" rows={stats.revenueByAlteration} />
        <RevenueByLabelCard title="Revenue by garment type" rows={stats.revenueByGarmentType} showAvg={false} />
      </div>
      <div className="mb-6">
        <CategoricalCompositionCard
          title="Revenue composition"
          valueLabel={formatCents(Object.values(stats.revenueBySource).reduce((a, b) => a + b, 0))}
          segments={[
            { key: "ALTERATION", label: "Standard alterations", value: stats.revenueBySource.ALTERATION ?? 0, valueLabel: formatCents(stats.revenueBySource.ALTERATION) },
            { key: "CUSTOM_INSTRUCTIONS", label: "Custom instructions", value: stats.revenueBySource.CUSTOM_INSTRUCTIONS ?? 0, valueLabel: formatCents(stats.revenueBySource.CUSTOM_INSTRUCTIONS) },
            { key: "FREEFORM", label: "Write-in charges", value: stats.revenueBySource.FREEFORM ?? 0, valueLabel: formatCents(stats.revenueBySource.FREEFORM) },
          ]}
        />
      </div>

      {/* --- Client relationships --- */}
      <div className="mb-6">
        <TopClientsCard
          repeatClientRatePct={clientStats.repeatClientRatePct}
          repeatClients={clientStats.repeatClients}
          totalClients={clientStats.totalClients}
          topClients={clientStats.topClients}
        />
      </div>

      {/* --- Historical performance --- */}
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Historical performance</h2>
        <p className="text-xs text-charcoal/50">
          Trends and operational metrics built from data the app was already recording on every ticket.
        </p>
      </div>
      <div className="mb-6">
        <MonthlyTrendChart title="Revenue by month" subtitle="Grouped by when the ticket was created." points={monthlyTrendPoints} />
      </div>
      <div className="mb-2 grid gap-4 sm:grid-cols-4">
        <StatCard label="On-time completion" value={stats.onTime.rate !== null ? `${stats.onTime.rate}%` : "—"} />
        <StatCard label="Avg. time to start work" value={stats.avgDaysToStart !== null ? `${stats.avgDaysToStart} days` : "—"} sublabel="Intake to first work" />
        <StatCard label="Avg. work duration" value={stats.avgDaysWorking !== null ? `${stats.avgDaysWorking} days` : "—"} sublabel="Start to completion" />
        <StatCard label="Avg. pickup lag" value={stats.avgPickupLagDays !== null ? `${stats.avgPickupLagDays} days` : "—"} />
        <StatCard label="Reopen rate" value={stats.reopenRate.rate !== null ? `${stats.reopenRate.rate}%` : "—"} accent={!!stats.reopenRate.rate && stats.reopenRate.rate > 15} />
        <StatCard label="Avg. days to full payment" value={stats.avgDaysToFullPayment !== null ? `${stats.avgDaysToFullPayment} days` : "—"} />
        <StatCard label="Rush orders" value={stats.rushShare.rate !== null ? `${stats.rushShare.rate}%` : "—"} />
      </div>
      <p className="mb-6 text-xs text-charcoal/40">
        On-time completion: {stats.onTime.onTimeCount}/{stats.onTime.total} due-dated orders sealed by their
        due date. Avg. time to start + avg. work duration are the two halves of turnaround — a rising number
        in one but not the other points at a queue problem vs. a capacity problem. Reopen rate:{" "}
        {stats.reopenRate.reopenedCount}/{stats.reopenRate.total} once-completed items sent back for more
        work. Rush orders: {stats.rushShare.rushCount}/{stats.rushShare.total} orders flagged rush.
      </p>

      <div className="mb-6">
        <TeamActivityCard rows={stats.teamActivity} />
      </div>
    </>
  );
}

function RevenueByLabelCard({
  title,
  rows,
  showAvg = true,
}: {
  title: string;
  rows: { label: string; totalCents: number; count: number; avgCents?: number }[];
  showAvg?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-3 text-sm font-medium text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-charcoal/40">No pricing entered yet.</p>
      ) : (
        <div className="divide-y divide-linen">
          {rows.slice(0, 8).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="text-ink">{row.label}</p>
                <p className="text-[11px] text-charcoal/40">
                  {row.count}× charged{showAvg && row.avgCents !== undefined ? ` · avg ${formatCents(row.avgCents)}` : ""}
                </p>
              </div>
              <span className="font-display text-base text-ink">{formatCents(row.totalCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NeedsPricingCard({
  orders,
  totalGaps,
}: {
  orders: { id: string; orderNumber: string; clientName: string; gaps: number; items: { garmentType: string; unpricedAlterations: string[] }[] }[];
  totalGaps: number;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Unpriced alterations</p>
        <span className={`font-display text-2xl ${totalGaps > 0 ? "text-alert" : "text-ink"}`}>{totalGaps}</span>
      </div>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Checked alterations on open tickets with no price entered yet.
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-charcoal/40">Every open ticket is fully priced.</p>
      ) : (
        <ul className="space-y-2.5">
          {orders.slice(0, 6).map((o) => (
            <li key={o.id}>
              <div className="flex items-center justify-between gap-3">
                <Link href={`/manager/orders/${o.id}`} className="text-sm text-thread hover:underline">
                  {o.orderNumber} — {o.clientName}
                </Link>
                <span className="whitespace-nowrap text-xs text-charcoal/50">{o.gaps} unpriced</span>
              </div>
              <p className="mt-0.5 text-xs text-charcoal/50">
                {o.items.map((item) => `${item.garmentType}: ${item.unpricedAlterations.join(", ")}`).join(" · ")}
              </p>
            </li>
          ))}
          {orders.length > 6 && <li className="text-xs text-charcoal/40">+{orders.length - 6} more orders</li>}
        </ul>
      )}
    </div>
  );
}

function TeamActivityCard({
  rows,
}: {
  rows: {
    userId: string;
    name: string;
    role: string | null;
    ticketsCreated: number;
    itemsCompleted: number;
    pickupsAuthorized: number;
    itemsAssigned: number;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-1 text-sm font-medium text-ink">Team activity</p>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Current-state snapshot, not full history — e.g. "items completed" credits whoever most recently
        completed an item, not necessarily who completed it first if it was later reopened. "Currently
        assigned" is how many items each person has claimed or been assigned right now.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-charcoal/40">No activity recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-charcoal/50">
                <th className="py-1.5 pr-3">Staff</th>
                <th className="py-1.5 pr-3">Tickets created</th>
                <th className="py-1.5 pr-3">Items completed</th>
                <th className="py-1.5 pr-3">Pickups authorized</th>
                <th className="py-1.5">Currently assigned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t border-linen">
                  <td className="py-1.5 pr-3 text-ink">{r.name}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.ticketsCreated}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.itemsCompleted}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.pickupsAuthorized}</td>
                  <td className="py-1.5 text-charcoal/70">{r.itemsAssigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
