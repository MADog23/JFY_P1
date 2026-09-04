/**
 * Shared category labels for the manager audit report. Kept separate from
 * actions/audit-report.ts since a "use server" file can only export async functions,
 * not plain constants, and this needs to be importable from both the client-side
 * filter dropdown (components/AuditReportFilters.tsx) and the server-rendered results
 * table (app/manager/audit/page.tsx).
 */
import type { AuditCategory } from "@/actions/audit-report";

export const AUDIT_CATEGORY_OPTIONS: { value: AuditCategory; label: string }[] = [
  { value: "ALL", label: "All categories" },
  { value: "ORDER", label: "Orders" },
  { value: "ORDER_ITEM", label: "Order items" },
  { value: "EMPLOYEE", label: "Staff" },
  { value: "TAXONOMY", label: "Garment options" },
  { value: "PUNCH", label: "Timeclock" },
  { value: "SHIFT", label: "Schedule" },
  { value: "TIME_OFF", label: "Time off" },
  { value: "SECURITY", label: "Security" },
];

/** Friendly label for a row's actual entityType. "Security" is a filter grouping, not
 * a real entityType a row ever carries (see actions/audit-report.ts), so it never shows
 * up here — a row that matched the Security filter still displays its real category
 * (almost always "Staff", since logins/account changes are tagged EMPLOYEE). Falls back
 * to the raw value for anything unrecognized rather than hiding it. */
export function entityTypeLabel(entityType: string): string {
  const match = AUDIT_CATEGORY_OPTIONS.find((opt) => opt.value === entityType);
  return match ? match.label : entityType;
}
