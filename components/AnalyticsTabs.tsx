"use client";

/**
 * Tab bar for the four analytics pages (Overview/Employees/Pricing/Garments) — these
 * are real routes (app/manager/analytics/{,employees,pricing,garments}/page.tsx), not a
 * query-param view switch like the scheduler's, so highlighting the active tab needs
 * the current pathname rather than a searchParams read in the (Server Component) layout
 * that renders this. Same pill styling as every other view-switcher in this app.
 *
 * Carries the shared ?from=&to= date-range filter (see AnalyticsRangeFilters) along when
 * switching tabs, so picking a range on one tab doesn't get silently dropped by clicking
 * to another — the destination page reads the same params and applies its own default
 * when they're absent, exactly as it does on a fresh page load with a range already in
 * the URL. Any other, page-specific param (e.g. Employees' ?employee=) is deliberately
 * NOT carried over, since it wouldn't mean anything on a different tab.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/manager/analytics", label: "Overview" },
  { href: "/manager/analytics/employees", label: "Employees" },
  { href: "/manager/analytics/pricing", label: "Pricing" },
  { href: "/manager/analytics/garments", label: "Garments" },
];

export function AnalyticsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rangeQs = (() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    return params.toString();
  })();

  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-linen bg-white p-1 text-sm">
      {TABS.map((tab) => {
        // Exact match for Overview (otherwise it'd stay "active" on every sub-page,
        // since every sub-page's path starts with the same prefix); prefix match for
        // the rest, since none of them have sub-routes of their own.
        const active = tab.href === "/manager/analytics" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={rangeQs ? `${tab.href}?${rangeQs}` : tab.href}
            className={`rounded-full px-3 py-1 ${active ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
