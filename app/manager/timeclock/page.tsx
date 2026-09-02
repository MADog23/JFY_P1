/**
 * Phase 2 — manager-facing daily-hours review for every active employee, this week by
 * default. Links through to a per-employee raw-punch review/correction page
 * (./[userId]). Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { DailyTotalsTable } from "@/components/DailyTotalsTable";
import { listDailyTotalsForRange } from "@/actions/punches";
import { startOfWeek, endOfWeek, toDateInputValue } from "@/lib/dates";

export default async function ManagerTimeclockPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const now = new Date();
  const defaultFrom = startOfWeek(now);
  const defaultTo = endOfWeek(now);
  const from = searchParams.from || toDateInputValue(defaultFrom);
  const to = searchParams.to || toDateInputValue(defaultTo);

  const rows = await listDailyTotalsForRange(from, to);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl text-ink">Timeclock</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Hours worked {from} – {to}. Review anything flagged before it goes anywhere — nothing here computes pay yet.
        </p>
        <DailyTotalsTable rows={rows} reviewHrefFor={(userId) => `/manager/timeclock/${userId}?from=${from}&to=${to}`} />
      </main>
    </>
  );
}
