"use client";

/**
 * Filter bar for the time-off pages (both employee and manager) — status tabs plus a
 * date-range search, same URL-query-param-driven pattern as AuditReportFilters/
 * OrderSearchBar: every filter lives in the URL, so the page (a Server Component) just
 * reads searchParams back out, and a filtered view is a plain shareable/bookmarkable
 * link. Shared between both roles' pages since the controls themselves are identical —
 * only `basePath` and the sensible default status tab differ per page.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "DENIED", label: "Denied" },
  { value: "CANCELLED", label: "Withdrawn" },
  { value: "ALL", label: "All" },
];

export function TimeOffFilters({ defaultStatus }: { defaultStatus: "PENDING" | "ALL" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") || defaultStatus;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  function apply(overrides: { status?: string; from?: string; to?: string }) {
    const next = { status, from, to, ...overrides };
    const params = new URLSearchParams(searchParams.toString());
    if (next.status && next.status !== defaultStatus) params.set("status", next.status);
    else params.delete("status");
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-linen bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">Status</label>
        <div className="flex flex-wrap gap-1 rounded-full border border-linen bg-cream p-1 text-sm">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => apply({ status: tab.value })}
              className={`rounded-full px-3 py-1 ${status === tab.value ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="timeoff-from" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          From
        </label>
        <input
          id="timeoff-from"
          type="date"
          defaultValue={from}
          onChange={(e) => apply({ from: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="timeoff-to" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          To
        </label>
        <input
          id="timeoff-to"
          type="date"
          defaultValue={to}
          onChange={(e) => apply({ to: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={() => apply({ from: "", to: "" })}
          className="focus-ring rounded-lg border border-linen px-3 py-2 text-xs text-charcoal/60 hover:bg-cream"
        >
          Clear dates
        </button>
      )}
      <p className="w-full text-[11px] text-charcoal/40">
        The date range matches any request whose time off overlaps those dates — leave blank to see every date.
      </p>
    </div>
  );
}
