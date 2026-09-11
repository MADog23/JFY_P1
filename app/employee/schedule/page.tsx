/**
 * Employee-facing read-only "my schedule": published shifts only. Now takes an optional
 * ?from=&to= range (same URL-driven pattern as everywhere else in this app) with a
 * Prev/This week/Next week nav bar — previously hardcoded to only ever show the
 * current week with no way to look ahead or back. Gated behind PHASE2_ENABLED — see
 * lib/feature-flags.ts.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { MyScheduleList } from "@/components/MyScheduleList";
import { listMyShiftsForRange } from "@/actions/shifts";
import { startOfWeek, endOfWeek, toDateInputValue, addShopDays } from "@/lib/dates";

const BASE_PATH = "/employee/schedule";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default async function EmployeeSchedulePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  if (!isPhase2Enabled()) redirect("/employee");
  const session = await requireSession();

  const now = new Date();
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : toDateInputValue(startOfWeek(now));
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : toDateInputValue(endOfWeek(now));
  const shifts = await listMyShiftsForRange(from, to);

  function hrefFor(f: string, t: string) {
    return `${BASE_PATH}?from=${f}&to=${t}`;
  }
  const thisWeekFrom = toDateInputValue(startOfWeek(now));
  const thisWeekTo = toDateInputValue(endOfWeek(now));

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-ink">My schedule</h1>
            <p className="text-sm text-charcoal/60">
              Published shifts {from} – {to}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Link
              href={hrefFor(addShopDays(from, -7), addShopDays(to, -7))}
              className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
            >
              ← Prev week
            </Link>
            <Link
              href={hrefFor(thisWeekFrom, thisWeekTo)}
              className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
            >
              This week
            </Link>
            <Link
              href={hrefFor(addShopDays(from, 7), addShopDays(to, 7))}
              className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
            >
              Next week →
            </Link>
          </div>
        </div>
        <MyScheduleList shifts={shifts} from={from} to={to} />
      </main>
    </>
  );
}
