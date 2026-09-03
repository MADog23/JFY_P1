"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AUDIT_CATEGORY_OPTIONS } from "@/lib/audit-categories";

type StaffOption = { id: string; name: string; role: "EMPLOYEE" | "MANAGER"; active: boolean };

/**
 * Filter bar for the manager audit report — same URL-query-param-driven pattern as
 * OrderSearchBar/OrderSortSelect: every filter lives in the URL, so the report page
 * (a Server Component) just reads searchParams back out, and a filtered report is a
 * plain shareable/bookmarkable link.
 */
export function AuditReportFilters({
  staff,
  defaultFrom,
  defaultTo,
}: {
  staff: StaffOption[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;
  const category = searchParams.get("category") || "ALL";
  const performedById = searchParams.get("performedById") || "";

  function apply(overrides: { from?: string; to?: string; category?: string; performedById?: string }) {
    const next = { from, to, category, performedById, ...overrides };
    const params = new URLSearchParams(searchParams.toString());
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    if (next.category && next.category !== "ALL") params.set("category", next.category);
    else params.delete("category");
    if (next.performedById) params.set("performedById", next.performedById);
    else params.delete("performedById");
    // A new filter changes which rows match, so whatever page the report was on no
    // longer means anything — same as every other filtered/paginated list in this app.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-linen bg-white p-4">
      <div>
        <label htmlFor="audit-from" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          From
        </label>
        <input
          id="audit-from"
          type="date"
          defaultValue={from}
          onChange={(e) => apply({ from: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="audit-to" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          To
        </label>
        <input
          id="audit-to"
          type="date"
          defaultValue={to}
          onChange={(e) => apply({ to: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="audit-category" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Category
        </label>
        <select
          id="audit-category"
          value={category}
          onChange={(e) => apply({ category: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-white px-3 py-2 text-sm text-ink"
        >
          {AUDIT_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="audit-staff" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Performed by
        </label>
        <select
          id="audit-staff"
          value={performedById}
          onChange={(e) => apply({ performedById: e.target.value })}
          className="focus-ring rounded-lg border border-linen bg-white px-3 py-2 text-sm text-ink"
        >
          <option value="">Everyone</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {!s.active ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="w-full text-[11px] text-charcoal/40">
        Defaults to the current week — widen the date range for a longer lookback.
      </p>
    </div>
  );
}
