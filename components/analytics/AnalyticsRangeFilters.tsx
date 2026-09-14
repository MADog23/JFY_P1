"use client";

/**
 * Shared, optional date-range control for all four analytics pages — URL-driven
 * (?from=&to=), same pattern as every other filter bar in this app (TimeOffFilters,
 * AuditReportFilters, the old per-page EmployeeRangeFilters this supersedes). Rendered
 * at the top of each analytics page (not the layout, since a layout can't read
 * searchParams) so AnalyticsTabs can carry the same from/to across tab switches and each
 * page can show its own effective range (including a page-specific default, like
 * Employees' month-to-date) even when the URL itself has no range set yet.
 *
 * Unlike the old EmployeeRangeFilters, a range here is genuinely optional — "All time"
 * clears both params rather than always pointing at some window — since Overview,
 * Pricing, and Garments all have a real, meaningful all-time default to fall back to.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toDateInputValue, addShopDays } from "@/lib/dates";

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
];

export function AnalyticsRangeFilters({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = toDateInputValue(new Date());
  const isAllTime = !from && !to;

  function apply(nextFrom: string | null, nextTo: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom && nextTo) {
      params.set("from", nextFrom);
      params.set("to", nextTo);
    } else {
      params.delete("from");
      params.delete("to");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-linen bg-white p-4">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-charcoal/50">Date range</p>
        <div className="flex flex-wrap gap-1 rounded-full border border-linen bg-cream p-1 text-sm">
          <button
            type="button"
            onClick={() => apply(null, null)}
            className={`rounded-full px-3 py-1 ${isAllTime ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
          >
            All time
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => apply(addShopDays(today, -p.days), today)}
              className="rounded-full px-3 py-1 text-charcoal/60 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="an-from" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          From
        </label>
        <input
          id="an-from"
          type="date"
          value={from ?? ""}
          onChange={(e) => apply(e.target.value || null, to || e.target.value || null)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="an-to" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          To
        </label>
        <input
          id="an-to"
          type="date"
          value={to ?? ""}
          onChange={(e) => apply(from || e.target.value || null, e.target.value || null)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      {!isAllTime && (
        <button type="button" onClick={() => apply(null, null)} className="text-xs text-charcoal/50 hover:text-ink">
          Clear
        </button>
      )}
    </div>
  );
}
