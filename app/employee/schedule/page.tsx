/**
 * Phase 2 — employee-facing read-only "my schedule": published shifts only, this week
 * by default. Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { MyScheduleList } from "@/components/MyScheduleList";
import { listMyShiftsForRange } from "@/actions/shifts";
import { startOfWeek, endOfWeek, toDateInputValue } from "@/lib/dates";

export default async function EmployeeSchedulePage() {
  if (!isPhase2Enabled()) redirect("/employee");
  const session = await requireSession();

  const now = new Date();
  const from = startOfWeek(now);
  const to = endOfWeek(now);
  const shifts = await listMyShiftsForRange(toDateInputValue(from), toDateInputValue(to));

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-display text-2xl text-ink">My schedule</h1>
        <p className="mb-6 text-sm text-charcoal/60">This week's published shifts.</p>
        <MyScheduleList shifts={shifts} />
      </main>
    </>
  );
}
