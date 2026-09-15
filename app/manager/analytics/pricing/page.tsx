/**
 * Pricing analytics — a deeper dive than Overview's pricing cards: a 12-month trend
 * (vs. Overview's 6), the full (not top-8) alteration/garment revenue lists, and an
 * order-value distribution Overview doesn't show. Same underlying PriceLine data as
 * everywhere else — see actions/analytics.ts's getPricingAnalytics.
 */

import Link from "next/link";
import { getPricingAnalytics } from "@/actions/analytics";
import { formatCents } from "@/lib/money";
import { StatCard } from "@/components/analytics/StatCard";
import { BarRow, BarListCard } from "@/components/analytics/BarRow";
import { AnalyticsRangeFilters } from "@/components/analytics/AnalyticsRangeFilters";
import { MonthlyTrendChart } from "@/components/analytics/MonthlyTrendChart";
import { OrdinalBreakdownCard } from "@/components/analytics/OrdinalBreakdownCard";
import { CategoricalCompositionCard } from "@/components/analytics/CategoricalCompositionCard";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PricingAnalyticsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : undefined;
  const hasRange = !!(from && to);
  const stats = await getPricingAnalytics(from, to);

  const maxAlterationRevenue = Math.max(1, ...stats.revenueByAlteration.map((r) => r.totalCents));
  const maxGarmentRevenue = Math.max(1, ...stats.revenueByGarmentType.map((r) => r.totalCents));
  const totalCompositionCents = Object.values(stats.revenueBySource).reduce((a, b) => a + b, 0);

  const monthlyTrendPoints = stats.monthlyTrend.map((m) => ({
    month: m.month,
    label: m.label,
    valueCents: m.revenueCents,
    meta: `${m.orderCount} order${m.orderCount === 1 ? "" : "s"} · avg ${formatCents(m.avgOrderValueCents)}`,
  }));

  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Pricing</h2>
        <p className="text-xs text-charcoal/50">
          {hasRange
            ? `Trend and breakdown of the pricing data collected on every ticket, from ${from} through ${to}.`
            : "Trend and breakdown of the pricing data collected on every ticket, over the last 12 months."}
        </p>
      </div>

      <AnalyticsRangeFilters from={from} to={to} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total revenue (priced orders)" value={formatCents(stats.totalRevenueCents)} />
        <StatCard label="Avg. order value" value={formatCents(stats.avgOrderValueCents)} sublabel={`${stats.totalPricedOrders} orders`} />
        <StatCard
          label="Unpriced alterations"
          value={stats.totalPricingGaps}
          accent={stats.totalPricingGaps > 0}
          sublabel="Checked alterations on open tickets with no price entered yet"
        />
      </div>

      <div className="mb-6">
        <MonthlyTrendChart title="Revenue & volume by month" subtitle="Grouped by when the ticket was created." points={monthlyTrendPoints} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <BarListCard
          title="Revenue by alteration"
          subtitle="Standard, checked alterations only — write-in charges don't have a consistent label to group by."
          empty={stats.revenueByAlteration.length === 0 ? "No pricing entered yet." : undefined}
        >
          {stats.revenueByAlteration.map((r) => (
            <BarRow
              key={r.label}
              label={r.label}
              valueLabel={`${formatCents(r.totalCents)} · ${r.count}× · avg ${formatCents(r.avgCents)}`}
              pct={(r.totalCents / maxAlterationRevenue) * 100}
            />
          ))}
        </BarListCard>
        <BarListCard
          title="Revenue by garment type"
          subtitle="Every item-tied charge (alteration, custom instructions, or a freeform extra) counts toward its garment."
          empty={stats.revenueByGarmentType.length === 0 ? "No pricing entered yet." : undefined}
        >
          {stats.revenueByGarmentType.map((r) => (
            <BarRow
              key={r.label}
              label={r.label}
              valueLabel={`${formatCents(r.totalCents)} · ${r.count}× · avg ${formatCents(r.avgCents)}`}
              pct={(r.totalCents / maxGarmentRevenue) * 100}
            />
          ))}
        </BarListCard>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {/* Order value distribution is a price ladder (Under $25 -> $400+) — an ordinal
            sequence, not unrelated categories, so it gets the same graduated single-hue
            treatment as Overview's status breakdowns rather than a plain magnitude bar. */}
        <OrdinalBreakdownCard
          title="Order value distribution"
          subtitle="Every non-cancelled order, by its total ticket price."
          stages={stats.priceDistribution.map((b) => ({ key: b.label, label: b.label, count: b.count }))}
        />
        <CategoricalCompositionCard
          title="Revenue composition"
          valueLabel={formatCents(totalCompositionCents)}
          segments={[
            { key: "ALTERATION", label: "Standard alterations", value: stats.revenueBySource.ALTERATION ?? 0, valueLabel: formatCents(stats.revenueBySource.ALTERATION) },
            { key: "CUSTOM_INSTRUCTIONS", label: "Custom instructions", value: stats.revenueBySource.CUSTOM_INSTRUCTIONS ?? 0, valueLabel: formatCents(stats.revenueBySource.CUSTOM_INSTRUCTIONS) },
            { key: "FREEFORM", label: "Write-in charges", value: stats.revenueBySource.FREEFORM ?? 0, valueLabel: formatCents(stats.revenueBySource.FREEFORM) },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-linen bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Unpriced alterations, by order</p>
          <span className={`font-display text-2xl ${stats.totalPricingGaps > 0 ? "text-alert" : "text-ink"}`}>
            {stats.totalPricingGaps}
          </span>
        </div>
        {stats.needsPricing.length === 0 ? (
          <p className="text-sm text-charcoal/40">Every open ticket is fully priced.</p>
        ) : (
          <ul className="space-y-2.5">
            {stats.needsPricing.map((o) => (
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
          </ul>
        )}
      </div>
    </>
  );
}
