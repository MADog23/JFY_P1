"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "NEWEST", label: "Newest first" },
  { value: "OLDEST", label: "Oldest first" },
  { value: "ORDER_NUMBER", label: "Order number" },
  { value: "DUE_DATE", label: "Due date (soonest)" },
  { value: "CLIENT_NAME", label: "Client name (A–Z)" },
];

/**
 * Sort control for the Orders list — same pattern as OrderSearchBar (search/from/to):
 * a plain control that rewrites the URL's `sort` query param, so the list itself
 * (rendered server-side in app/employee|manager/page.tsx) just reads it back out of
 * searchParams. Shareable/bookmarkable like every other filter on this page.
 */
export function OrderSortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") || "NEWEST";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "NEWEST") params.delete("sort"); // NEWEST is the default — keep the URL clean
    else params.set("sort", value);
    // A new order can shuffle who's "next," so whatever page the list was on no longer
    // means anything — back to page 1, same as switching a status tab or searching does.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 whitespace-nowrap text-sm text-charcoal/60">
      Sort
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm text-ink"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
