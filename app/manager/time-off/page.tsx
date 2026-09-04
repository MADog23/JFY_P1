/**
 * Phase 2 — manager-facing vacation/time-off review: approve/deny pending requests,
 * browse the full history filtered by status and/or date range, and log a request on
 * an employee's behalf. Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { TimeOffReviewList } from "@/components/TimeOffReviewList";
import { TimeOffFilters } from "@/components/TimeOffFilters";
import { listTimeOffRequests, listStaffForTimeOff, type TimeOffStatus } from "@/actions/time-off";

const VALID_STATUSES: (TimeOffStatus | "ALL")[] = ["PENDING", "APPROVED", "DENIED", "CANCELLED", "ALL"];

export default async function ManagerTimeOffPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const status = (VALID_STATUSES.includes(searchParams.status as any) ? searchParams.status : "PENDING") as TimeOffStatus | "ALL";

  const [staff, requests] = await Promise.all([
    listStaffForTimeOff(),
    listTimeOffRequests({
      status: status === "ALL" ? undefined : status,
      from: searchParams.from,
      to: searchParams.to,
    }),
  ]);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl text-ink">Time off</h1>
        <p className="mb-6 text-sm text-charcoal/60">Review vacation/time-off requests, or log one for an employee yourself.</p>

        <TimeOffFilters defaultStatus="PENDING" />

        <TimeOffReviewList employees={staff} requests={requests as any} />
      </main>
    </>
  );
}
