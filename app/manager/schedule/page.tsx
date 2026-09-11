/**
 * Manager-facing scheduler — replaces the old form-and-list builder entirely. Two zoom
 * levels: a daily Gantt (drag to create/move/resize a shift, coverage-gap shading
 * against the shop's own hours) and a week/month roster (compact per-day list, click a
 * shift for the same details popup). View mode and the anchor date both live in the
 * URL (?view=&date=) — same URL-driven pattern as every other filter bar in this app —
 * so a given day/week/month is a plain shareable/bookmarkable link and the Prev/Today/
 * Next controls are just plain links, no client state needed for navigation itself.
 * Every create/edit/publish/cancel still routes through actions/shifts.ts, so the
 * audit log (see lib/audit.ts) keeps recording exactly as it did before this rebuild.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { isPhase2Enabled } from "@/lib/feature-flags";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { DailyGanttView } from "@/components/scheduler/DailyGanttView";
import { RosterView } from "@/components/scheduler/RosterView";
import { listShiftsForRange } from "@/actions/shifts";
import { toDateInputValue, startOfWeek, endOfWeek, addShopDays, listShopDateKeysInRange, shopDayStart, formatShopDateTime } from "@/lib/dates";

type ViewMode = "day" | "week" | "month";
const VALID_VIEWS: ViewMode[] = ["day", "week", "month"];
const BASE_PATH = "/manager/schedule";

export default async function ManagerSchedulePage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string };
}) {
  if (!isPhase2Enabled()) redirect("/manager");
  const session = await requireManager();

  const view: ViewMode = VALID_VIEWS.includes(searchParams.view as ViewMode) ? (searchParams.view as ViewMode) : "day";
  const anchor =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : toDateInputValue(new Date());

  let from: string;
  let to: string;
  let stepDays: number;
  if (view === "day") {
    from = anchor;
    to = anchor;
    stepDays = 1;
  } else if (view === "week") {
    from = toDateInputValue(startOfWeek(shopDayStart(anchor)));
    to = toDateInputValue(endOfWeek(shopDayStart(anchor)));
    stepDays = 7;
  } else {
    // "Month" is a rolling 4-week (28-day) look-ahead from the start of the anchor's
    // week, not a true calendar-month grid — simpler to build correctly and arguably
    // more useful for "how far out is the schedule built" than calendar-month
    // boundaries would be. Easy to revisit if a real month grid is wanted later.
    from = toDateInputValue(startOfWeek(shopDayStart(anchor)));
    to = addShopDays(from, 27);
    stepDays = 28;
  }

  const [employees, shifts] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listShiftsForRange(from, to),
  ]);

  function hrefFor(nextView: ViewMode, nextDate: string) {
    return `${BASE_PATH}?view=${nextView}&date=${nextDate}`;
  }
  const prevDate = addShopDays(anchor, -stepDays);
  const nextDate = addShopDays(anchor, stepDays);
  const todayKey = toDateInputValue(new Date());
  const rangeLabel =
    view === "day"
      ? formatShopDateTime(shopDayStart(anchor), { weekday: "long", month: "long", day: "numeric" })
      : `${formatShopDateTime(shopDayStart(from), { month: "short", day: "numeric" })} – ${formatShopDateTime(
          shopDayStart(to),
          { month: "short", day: "numeric" }
        )}`;

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-ink">Schedule</h1>
            <p className="text-sm text-charcoal/60">{rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-linen bg-white p-1 text-sm">
              {VALID_VIEWS.map((v) => (
                <Link
                  key={v}
                  href={hrefFor(v, anchor)}
                  className={`rounded-full px-3 py-1 capitalize ${
                    view === v ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"
                  }`}
                >
                  {v}
                </Link>
              ))}
            </div>
            <div className="flex gap-1">
              <Link href={hrefFor(view, prevDate)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream">
                ← Prev
              </Link>
              <Link href={hrefFor(view, todayKey)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream">
                Today
              </Link>
              <Link href={hrefFor(view, nextDate)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm hover:bg-cream">
                Next →
              </Link>
            </div>
          </div>
        </div>

        {view === "day" ? (
          <DailyGanttView dateKey={anchor} shifts={shifts as any} employees={employees} />
        ) : (
          <RosterView dateKeys={listShopDateKeysInRange(from, to)} shifts={shifts as any} basePath={BASE_PATH} />
        )}
      </main>
    </>
  );
}
