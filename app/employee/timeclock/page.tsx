/**
 * Phase 2 — employee-facing timeclock: clock in/out/break, plus their own recent daily
 * totals (no other employee's data is reachable from here — see listMyDailyTotals's
 * self-only guard). Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { ClockPad } from "@/components/ClockPad";
import { getMyPunchState, listMyDailyTotals } from "@/actions/punches";
import { formatMinutesAsHours } from "@/lib/hours";
import { startOfWeek, endOfWeek, toDateInputValue } from "@/lib/dates";

export default async function EmployeeTimeclockPage() {
  if (!isPhase2Enabled()) redirect("/employee");
  const session = await requireSession();
  const { state, startedAt } = await getMyPunchState();

  const now = new Date();
  const from = startOfWeek(now);
  const to = endOfWeek(now);
  const days = await listMyDailyTotals(toDateInputValue(from), toDateInputValue(to));
  const weekTotalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-display text-2xl text-ink">Timeclock</h1>
        <p className="mb-6 text-sm text-charcoal/60">Clock in and out here — this is what replaces Homebase's timeclock.</p>

        <ClockPad initialState={state} initialStartedAt={startedAt} />

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-ink">This week</h2>
          <div className="overflow-hidden rounded-xl border border-linen bg-white">
            {days.length === 0 ? (
              <p className="px-4 py-3 text-sm text-charcoal/60">No punches yet this week.</p>
            ) : (
              days.map((d) => (
                <div key={d.date} className="flex items-center justify-between border-b border-linen/60 px-4 py-2 text-sm last:border-0">
                  <span className="text-charcoal/70">{d.date}</span>
                  <span className="text-ink">{formatMinutesAsHours(d.totalMinutes)}</span>
                </div>
              ))
            )}
            <div className="flex items-center justify-between bg-cream px-4 py-2 text-sm font-medium">
              <span className="text-charcoal/70">Week total</span>
              <span className="text-ink">{formatMinutesAsHours(weekTotalMinutes)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-charcoal/40">
            Something look wrong? Let a manager know — they can review and correct any punch.
          </p>
        </div>
      </main>
    </>
  );
}
