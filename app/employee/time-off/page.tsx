/**
 * Phase 2 — employee-facing vacation/time-off requests: submit a request, see your own
 * history filtered by status and/or date range. Gated behind PHASE2_ENABLED — see
 * lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { TimeOffRequestForm } from "@/components/TimeOffRequestForm";
import { MyTimeOffList } from "@/components/MyTimeOffList";
import { TimeOffFilters } from "@/components/TimeOffFilters";
import { listMyTimeOffRequests, type TimeOffStatus } from "@/actions/time-off";

export default async function EmployeeTimeOffPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/employee");
  const session = await requireSession();

  // Defaults to ALL, not PENDING — unlike the manager's review queue, this is someone
  // looking at their own history, where "everything I've asked for" is the more useful
  // starting view than only what's still awaiting a decision.
  const status = (searchParams.status as TimeOffStatus | "ALL" | undefined) ?? "ALL";
  const requests = await listMyTimeOffRequests({
    status: status === "ALL" ? undefined : status,
    from: searchParams.from,
    to: searchParams.to,
  });

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-display text-2xl text-ink">Time off</h1>
        <p className="mb-6 text-sm text-charcoal/60">Request vacation or unpaid time off, and track its status here.</p>

        <div className="space-y-6">
          <TimeOffRequestForm />
          <div>
            <h2 className="mb-2 text-sm font-medium text-ink">Your requests</h2>
            <TimeOffFilters defaultStatus="ALL" />
            <MyTimeOffList requests={requests as any} />
          </div>
        </div>
      </main>
    </>
  );
}
