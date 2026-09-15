/**
 * A small "vs. previous period" indicator for the top KPI cards — only meaningful once a
 * manager has actually picked a date range (see AnalyticsRangeFilters), since "previous
 * period" needs a defined window to compare against. Overview's all-time default view
 * shows no delta at all, same as before this existed.
 *
 * Color means "is this direction good," not "is this number up" — a rising avg.
 * turnaround is bad news even though the number went up, so `higherIsBetter` flips which
 * direction gets the sage/alert color.
 */
export function DeltaBadge({
  current,
  previous,
  higherIsBetter = true,
}: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
}) {
  // A zero (or missing) prior-period base makes a percent change meaningless (division
  // by zero, or an infinite-looking jump from "$0 last period") — say nothing rather
  // than show a misleading number.
  if (!previous) return null;

  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct === 0) {
    return <span className="text-[11px] text-charcoal/40">Flat vs. previous period</span>;
  }

  const up = pct > 0;
  const good = up === higherIsBetter;
  return (
    <span className={`text-[11px] font-medium ${good ? "text-sage" : "text-alert"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs. previous period
    </span>
  );
}
