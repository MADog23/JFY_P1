/**
 * Phase 2 — the actual timeclock correction surface: raw punches for one employee,
 * editable/voidable, plus a form to backfill a missed punch. Gated behind
 * PHASE2_ENABLED — see lib/feature-flags.ts.
 */

import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { PunchReviewList } from "@/components/PunchReviewList";
import { listRawPunches } from "@/actions/punches";
import { startOfWeek, endOfWeek, toDateInputValue } from "@/lib/dates";

export default async function ManagerTimeclockEmployeePage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const now = new Date();
  const from = searchParams.from || toDateInputValue(startOfWeek(now));
  const to = searchParams.to || toDateInputValue(endOfWeek(now));

  const employee = await db.user.findUnique({ where: { id: params.userId }, select: { id: true, name: true } });
  const punches = await listRawPunches(params.userId, from, to);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl text-ink">{employee?.name ?? "Employee"}'s punches</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          {from} – {to}. Edit corrects the record with a full audit trail; Void excludes a bad punch without deleting it.
        </p>
        <PunchReviewList userId={params.userId} punches={punches as any} />
      </main>
    </>
  );
}
