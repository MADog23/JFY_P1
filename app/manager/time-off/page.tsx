/**
 * Phase 2 — manager-facing vacation/time-off review: approve/deny pending requests,
 * browse the full history filtered by status and/or date range, and log a request on
 * an employee's behalf. Gated behind PHASE2_ENABLED — see lib/feature-flags.ts.
 *
 * Three views of the same filtered request list (List | Day | Month), same pattern as
 * the manager scheduler's own view switcher — TimeOffFilters' status/date-range
 * controls stay visible and apply to all three; only how the results are laid out
 * differs. Day and Month each have their own anchor (?date= / ?month=), separate URL
 * params from the filters' date range — same relationship the scheduler has between
 * its view/date and (nonexistent, there) filters; the two just don't have to move
 * together.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { TopNav } from "@/components/TopNav";
import { TimeOffReviewList } from "@/components/TimeOffReviewList";
import { TimeOffDayView } from "@/components/TimeOffDayView";
import { TimeOffCalendarView } from "@/components/TimeOffCalendarView";
import { TimeOffFilters } from "@/components/TimeOffFilters";
import { listTimeOffRequests, listStaffForTimeOff, type TimeOffStatus } from "@/actions/time-off";
import {
  shopDayStart,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  listShopDateKeysInRange,
  toDateInputValue,
  toMonthInputValue,
  addShopDays,
  addMonths,
  formatShopDateTime,
} from "@/lib/dates";

const VALID_STATUSES: (TimeOffStatus | "ALL")[] = ["PENDING", "APPROVED", "DENIED", "CANCELLED", "ALL"];
type ViewMode = "list" | "day" | "month";
const VALID_VIEWS: ViewMode[] = ["list", "day", "month"];
const BASE_PATH = "/manager/time-off";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;

export default async function ManagerTimeOffPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string; view?: string; date?: string; month?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const status = (VALID_STATUSES.includes(searchParams.status as any) ? searchParams.status : "PENDING") as TimeOffStatus | "ALL";
  const view: ViewMode = VALID_VIEWS.includes(searchParams.view as ViewMode) ? (searchParams.view as ViewMode) : "list";
  const currentDateKey = toDateInputValue(new Date());
  const currentMonthKey = toMonthInputValue(new Date());
  const dateKey = searchParams.date && DATE_ONLY.test(searchParams.date) ? searchParams.date : currentDateKey;
  const monthKey = searchParams.month && MONTH_ONLY.test(searchParams.month) ? searchParams.month : currentMonthKey;

  const [staff, requests] = await Promise.all([
    listStaffForTimeOff(),
    listTimeOffRequests({
      status: status === "ALL" ? undefined : status,
      from: searchParams.from,
      to: searchParams.to,
    }),
  ]);

  // Carries the current status/from/to filters (via searchParams, untouched) forward
  // into a link that only changes view and/or its anchor — so switching views or
  // paging through days/months never resets whatever the manager has filtered down to.
  function hrefFor(overrides: { view?: ViewMode; date?: string; month?: string }) {
    const params = new URLSearchParams();
    if (status !== "PENDING") params.set("status", status);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    const nextView = overrides.view ?? view;
    if (nextView !== "list") params.set("view", nextView);
    const nextDate = overrides.date ?? dateKey;
    if (nextView === "day" && nextDate !== currentDateKey) params.set("date", nextDate);
    const nextMonth = overrides.month ?? monthKey;
    if (nextView === "month" && nextMonth !== currentMonthKey) params.set("month", nextMonth);
    const qs = params.toString();
    return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
  }

  let gridDateKeys: string[] = [];
  if (view === "month") {
    const anchor = shopDayStart(`${monthKey}-01`);
    gridDateKeys = listShopDateKeysInRange(startOfWeek(startOfMonth(anchor)), endOfWeek(endOfMonth(anchor)));
  }

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl text-ink">Time off</h1>
          <div className="flex gap-1 rounded-full border border-linen bg-white p-1 text-sm">
            {VALID_VIEWS.map((v) => (
              <Link
                key={v}
                href={hrefFor({ view: v })}
                className={`rounded-full px-3 py-1 capitalize ${
                  view === v ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
        <p className="mb-6 text-sm text-charcoal/60">Review vacation/time-off requests, or log one for an employee yourself.</p>

        <TimeOffFilters defaultStatus="PENDING" />

        {view === "day" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {formatShopDateTime(shopDayStart(dateKey), { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className="flex gap-1">
                <Link
                  href={hrefFor({ date: addShopDays(dateKey, -1) })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  ← Prev
                </Link>
                <Link
                  href={hrefFor({ date: currentDateKey })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  Today
                </Link>
                <Link
                  href={hrefFor({ date: addShopDays(dateKey, 1) })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  Next →
                </Link>
              </div>
            </div>
            <TimeOffDayView dateKey={dateKey} requests={requests as any} />
          </>
        )}

        {view === "month" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {formatShopDateTime(shopDayStart(`${monthKey}-01`), { month: "long", year: "numeric" })}
              </p>
              <div className="flex gap-1">
                <Link
                  href={hrefFor({ month: addMonths(monthKey, -1) })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  ← Prev
                </Link>
                <Link
                  href={hrefFor({ month: currentMonthKey })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  Today
                </Link>
                <Link
                  href={hrefFor({ month: addMonths(monthKey, 1) })}
                  className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream"
                >
                  Next →
                </Link>
              </div>
            </div>
            <TimeOffCalendarView monthKey={monthKey} dateKeys={gridDateKeys} requests={requests as any} />
          </>
        )}

        {view === "list" && <TimeOffReviewList employees={staff} requests={requests as any} />}
      </main>
    </>
  );
}
