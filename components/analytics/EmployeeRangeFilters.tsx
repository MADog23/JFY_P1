"use client";

/**
 * Date-range control for the Employees analytics page — URL-driven (?from=&to=), same
 * pattern as every other filter bar in this app (TimeOffFilters, AuditReportFilters).
 * Scheduled/worked/overtime hours are the only metrics on that page that genuinely need
 * a caller-chosen window (garment/ticket/pickup counts are also range-scoped, but the
 * range itself lives here); Pricing/Garments don't have this control since those pages
 * are trend-over-time or all-time by design instead.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toDateInputValue, addShopDays } from "@/lib/dates";

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export function EmployeeRangeFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-linen bg-white p-4">
      <div className="flex flex-wrap gap-1 rounded-full border border-linen bg-cream p-1 text-sm">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => apply(addShopDays(toDateInputValue(new Date()), -p.days), toDateInputValue(new Date()))}
            className="rounded-full px-3 py-1 text-charcoal/60 hover:text-ink"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="emp-from" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          From
        </label>
        <input
          id="emp-from"
          type="date"
          defaultValue={from}
          onChange={(e) => apply(e.target.value, to)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="emp-to" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          To
        </label>
        <input
          id="emp-to"
          type="date"
          defaultValue={to}
          onChange={(e) => apply(from, e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
