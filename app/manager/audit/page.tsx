import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { listAuditReport, listStaffForAuditFilter, type AuditCategory } from "@/actions/audit-report";
import { TopNav } from "@/components/TopNav";
import { AuditReportFilters } from "@/components/AuditReportFilters";
import { RevealIpAddressesControl } from "@/components/RevealIpAddressesControl";
import { entityTypeLabel } from "@/lib/audit-categories";
import { formatShopDateTime } from "@/lib/dates";

export default async function AuditReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; category?: string; performedById?: string; page?: string };
}) {
  const session = await requireManager();
  const category = (searchParams.category as AuditCategory) || "ALL";
  const performedById = searchParams.performedById || undefined;
  const page = Math.max(parseInt(searchParams.page ?? "1", 10) || 1, 1);

  const [{ rows, total, pageSize, hasMore, from, to, ipRevealed, ipRevealExpiresAt }, staff] = await Promise.all([
    listAuditReport({ from: searchParams.from, to: searchParams.to, category, performedById, page }),
    listStaffForAuditFilter(),
  ]);

  // IP addresses are only ever relevant (and only ever shown) while filtered to the
  // Security category — that's the one place logins/failed attempts live, and it keeps
  // the reveal control from showing up on every other view of this report.
  const showIpColumn = category === "SECURITY";
  // Only LOGIN_SUCCESS/LOGIN_FAILED rows ever have an IP captured at all (see
  // actions/auth.ts) — other Security rows like PASSWORD_CHANGED never did, so those
  // should read as "—" even while unrevealed rather than "Hidden", which would wrongly
  // imply there's something there to unlock.
  const IP_CAPTURING_ACTIONS = new Set(["LOGIN_SUCCESS", "LOGIN_FAILED"]);

  // Rebuilds the *resolved* from/to (not raw searchParams) so paging never silently
  // drops back to the default week when the manager hasn't touched the date inputs.
  function pageHref(value: number) {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    if (category !== "ALL") params.set("category", category);
    if (performedById) params.set("performedById", performedById);
    params.set("page", String(value));
    return `/manager/audit?${params.toString()}`;
  }

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-ink">Audit report</h1>
          <p className="text-sm text-charcoal/60">Every recorded change, filtered by timeframe and category.</p>
        </div>

        <AuditReportFilters staff={staff} defaultFrom={from} defaultTo={to} />

        {showIpColumn && <RevealIpAddressesControl revealed={ipRevealed} expiresAt={ipRevealExpiresAt} />}

        <div className="overflow-x-auto rounded-2xl border border-linen bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-linen text-xs uppercase tracking-wide text-charcoal/50">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Performed by</th>
                {showIpColumn && <th className="px-4 py-3 font-medium">IP address</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-linen last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-charcoal/70">
                    {formatShopDateTime(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-charcoal/70">{entityTypeLabel(row.entityType)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-charcoal/70">{row.action}</td>
                  <td className="px-4 py-3 text-ink">
                    {row.summary}
                    {row.order && (
                      <>
                        {" "}
                        <Link href={`/manager/orders/${row.order.id}`} className="text-thread hover:underline">
                          ({row.order.orderNumber})
                        </Link>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-charcoal/70">{row.performedBy.name}</td>
                  {showIpColumn && (
                    <td className="whitespace-nowrap px-4 py-3 text-charcoal/70">
                      {row.ipAddress ?? (!ipRevealed && IP_CAPTURING_ACTIONS.has(row.action) ? "Hidden" : "—")}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showIpColumn ? 6 : 5} className="px-4 py-8 text-center text-charcoal/50">
                    No activity in this range matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (total > pageSize || page > 1) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-charcoal/60">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5">
                  Previous
                </Link>
              ) : (
                <span className="rounded-lg border border-linen px-3 py-1.5 text-charcoal/30">Previous</span>
              )}
              {hasMore ? (
                <Link href={pageHref(page + 1)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5">
                  Next
                </Link>
              ) : (
                <span className="rounded-lg border border-linen px-3 py-1.5 text-charcoal/30">Next</span>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
