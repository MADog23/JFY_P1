/**
 * Phase 2 — manager-facing schedule builder: add draft shifts, publish them
 * (individually or in bulk), cancel mistakes. Employees only ever see the published
 * output (app/employee/schedule). Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { ScheduleBuilder } from "@/components/ScheduleBuilder";
import { listShiftsForRange } from "@/actions/shifts";
import { startOfWeek, endOfWeek, toDateInputValue } from "@/lib/dates";

export default async function ManagerSchedulePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const now = new Date();
  const from = searchParams.from || toDateInputValue(startOfWeek(now));
  const to = searchParams.to || toDateInputValue(endOfWeek(now));

  const [employees, shifts] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listShiftsForRange(from, to),
  ]);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl text-ink">Schedule</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Shifts {from} – {to}. Staff only see a shift once it's published.
        </p>
        <ScheduleBuilder employees={employees} shifts={shifts as any} />
      </main>
    </>
  );
}
