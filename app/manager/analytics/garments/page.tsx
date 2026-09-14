/**
 * Garments analytics — narrows in on individual garment and alteration types rather
 * than money alone: volume, completion rate, and turnaround per garment type; how often
 * each alteration is actually selected vs. actually priced. See
 * actions/analytics.ts's getGarmentAnalytics for exactly what's excluded (soft-removed
 * items) and why.
 */

import { getGarmentAnalytics } from "@/actions/analytics";
import { formatCents } from "@/lib/money";
import { StatCard } from "@/components/analytics/StatCard";
import { BarRow, BarListCard } from "@/components/analytics/BarRow";
import { AnalyticsRangeFilters } from "@/components/analytics/AnalyticsRangeFilters";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default async function GarmentAnalyticsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : undefined;
  const hasRange = !!(from && to);
  const stats = await getGarmentAnalytics(from, to);

  const maxGarmentCount = Math.max(1, ...stats.garments.map((g) => g.itemCount));
  const maxAlterationCount = Math.max(1, ...stats.alterations.map((a) => a.timesSelected));
  const totalRevenueCents = stats.garments.reduce((sum, g) => sum + g.revenueCents, 0);
  const completedTotal = stats.garments.reduce((sum, g) => sum + g.completedCount, 0);

  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Garments</h2>
        <p className="text-xs text-charcoal/50">
          Volume, completion, and turnaround by garment type; how often each alteration is chosen and how consistently
          it gets priced.{hasRange ? ` Intake between ${from} and ${to}.` : ""}
        </p>
      </div>

      <AnalyticsRangeFilters from={from} to={to} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Garment types in use" value={stats.garments.length} />
        <StatCard label="Items tracked" value={stats.totalItems} sublabel="Not counting removed (mistake) items" />
        <StatCard
          label="Completed"
          value={stats.totalItems > 0 ? `${Math.round((completedTotal / stats.totalItems) * 100)}%` : "—"}
          sublabel={`${completedTotal}/${stats.totalItems} items`}
        />
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-linen bg-white">
        <div className="p-5 pb-3">
          <p className="text-sm font-medium text-ink">By garment type</p>
          <p className="text-[11px] text-charcoal/40">
            Turnaround is intake to completion, averaged over that garment's completed items only.
          </p>
        </div>
        {stats.garments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-charcoal/40">No garments tracked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-linen text-xs uppercase tracking-wide text-charcoal/50">
                  <th className="px-5 py-2">Garment</th>
                  <th className="px-5 py-2">Volume</th>
                  <th className="px-5 py-2">Share</th>
                  <th className="px-5 py-2">Completed</th>
                  <th className="px-5 py-2">Avg. turnaround</th>
                  <th className="px-5 py-2">Revenue</th>
                  <th className="px-5 py-2">Avg. price</th>
                </tr>
              </thead>
              <tbody>
                {stats.garments.map((g) => (
                  <tr key={g.label} className="border-b border-linen/60 last:border-0">
                    <td className="px-5 py-2 font-medium text-ink">{g.label}</td>
                    <td className="px-5 py-2 text-charcoal/70">{g.itemCount}</td>
                    <td className="px-5 py-2 text-charcoal/70">{g.shareOfVolumePct}%</td>
                    <td className="px-5 py-2 text-charcoal/70">{g.completedCount}</td>
                    <td className="px-5 py-2 text-charcoal/70">{g.avgTurnaroundDays !== null ? `${g.avgTurnaroundDays}d` : "—"}</td>
                    <td className="px-5 py-2 text-charcoal/70">{formatCents(g.revenueCents)}</td>
                    <td className="px-5 py-2 text-charcoal/70">{g.avgPriceCents !== null ? formatCents(g.avgPriceCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <BarListCard
          title="Garment volume mix"
          subtitle="Share of tracked items, by garment type."
          empty={stats.garments.length === 0 ? "No garments tracked yet." : undefined}
        >
          {stats.garments.map((g) => (
            <BarRow key={g.label} label={g.label} valueLabel={`${g.itemCount} (${g.shareOfVolumePct}%)`} pct={(g.itemCount / maxGarmentCount) * 100} />
          ))}
        </BarListCard>
        <BarListCard
          title="Garment revenue mix"
          subtitle={`Of ${formatCents(totalRevenueCents)} attributable to a specific garment.`}
          empty={stats.garments.length === 0 ? "No pricing entered yet." : undefined}
        >
          {[...stats.garments]
            .sort((a, b) => b.revenueCents - a.revenueCents)
            .map((g) => (
              <BarRow
                key={g.label}
                label={g.label}
                valueLabel={formatCents(g.revenueCents)}
                pct={totalRevenueCents > 0 ? (g.revenueCents / totalRevenueCents) * 100 : 0}
              />
            ))}
        </BarListCard>
      </div>

      <div className="overflow-hidden rounded-2xl border border-linen bg-white">
        <div className="p-5 pb-3">
          <p className="text-sm font-medium text-ink">By alteration type</p>
          <p className="text-[11px] text-charcoal/40">
            "Selected" counts every time an alteration was checked at intake, whether or not it was ever priced —
            "priced" only counts the ones that got a standard price line.
          </p>
        </div>
        {stats.alterations.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-charcoal/40">No alterations selected yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-linen text-xs uppercase tracking-wide text-charcoal/50">
                  <th className="px-5 py-2">Alteration</th>
                  <th className="px-5 py-2">Selected</th>
                  <th className="px-5 py-2">Priced</th>
                  <th className="px-5 py-2">Revenue</th>
                  <th className="px-5 py-2">Avg. price</th>
                </tr>
              </thead>
              <tbody>
                {stats.alterations.map((a) => (
                  <tr key={a.label} className="border-b border-linen/60 last:border-0">
                    <td className="px-5 py-2 font-medium text-ink">{a.label}</td>
                    <td className="px-5 py-2 text-charcoal/70">{a.timesSelected}</td>
                    <td className={`px-5 py-2 ${a.timesPriced < a.timesSelected ? "text-alert" : "text-charcoal/70"}`}>
                      {a.timesPriced}
                    </td>
                    <td className="px-5 py-2 text-charcoal/70">{formatCents(a.revenueCents)}</td>
                    <td className="px-5 py-2 text-charcoal/70">{a.avgPriceCents !== null ? formatCents(a.avgPriceCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6">
        <BarListCard
          title="Most requested alterations"
          empty={stats.alterations.length === 0 ? "No alterations selected yet." : undefined}
        >
          {stats.alterations.slice(0, 12).map((a) => (
            <BarRow key={a.label} label={a.label} valueLabel={`${a.timesSelected}×`} pct={(a.timesSelected / maxAlterationCount) * 100} />
          ))}
        </BarListCard>
      </div>
    </>
  );
}
