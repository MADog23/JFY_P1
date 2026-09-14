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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PricingAnalyticsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : undefined;
  const hasRange = !!(from && to);
  const stats = await getPricingAnalytics(from, to);

  const maxMonthlyRevenue = Math.max(1, ...stats.monthlyTrend.map((m) => m.revenueCents));
  const maxAlterationRevenue = Math.max(1, ...stats.revenueByAlteration.map((r) => r.totalCents));
  const maxGarmentRevenue = Math.max(1, ...stats.revenueByGarmentType.map((r) => r.totalCents));
  const maxBucketCount = Math.max(1, ...stats.priceDistribution.map((b) => b.count));
  const sourceTotal = Object.values(stats.revenueBySource).reduce((a, b) => a + b, 0) || 1;

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
        <BarListCard title="Revenue &amp; volume by month" subtitle="Grouped by when the ticket was created.">
          {stats.monthlyTrend.map((m) => (
            <BarRow
              key={m.month}
              label={m.label}
              valueLabel={`${formatCents(m.revenueCents)} · ${m.orderCount} order${m.orderCount === 1 ? "" : "s"} · avg ${formatCents(
                m.avgOrderValueCents
              )}`}
              pct={(m.revenueCents / maxMonthlyRevenue) * 100}
            />
          ))}
        </BarListCard>
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
        <BarListCard title="Order value distribution" subtitle="Every non-cancelled order, by its total ticket price.">
          {stats.priceDistribution.map((b) => (
            <BarRow key={b.label} label={b.label} valueLabel={`${b.count} order${b.count === 1 ? "" : "s"}`} pct={(b.count / maxBucketCount) * 100} />
          ))}
        </BarListCard>

        <div className="rounded-2xl border border-linen bg-white p-5">
          <p className="mb-3 text-sm font-medium text-ink">Revenue composition</p>
          <div className="space-y-2">
            {(
              [
                ["ALTERATION", "Standard alterations"],
                ["CUSTOM_INSTRUCTIONS", "Custom instructions"],
                ["FREEFORM", "Write-in charges"],
              ] as const
            ).map(([key, label]) => {
              const cents = stats.revenueBySource[key] || 0;
              const pct = Math.round((cents / sourceTotal) * 100);
              return <BarRow key={key} label={label} valueLabel={formatCents(cents)} pct={pct} />;
            })}
          </div>
        </div>
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
