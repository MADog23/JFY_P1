/**
 * Employees analytics — a date-ranged roster table (scheduled vs. worked hours,
 * overtime, ticket/item/pickup activity) with an optional per-employee drill-down
 * (?employee=) for garment turnover and a week-by-week schedule-vs-actual breakdown.
 * Phase 2 data (shifts/punches/time off) — see actions/analytics.ts's header comment on
 * why this reads real data even if PHASE2_ENABLED is currently off for staff.
 */

import Link from "next/link";
import { getEmployeeAnalyticsOverview, getEmployeeAnalyticsDetail } from "@/actions/analytics";
import { formatMinutesAsHours } from "@/lib/hours";
import { toDateInputValue, startOfMonth } from "@/lib/dates";
import { StatCard } from "@/components/analytics/StatCard";
import { BarRow, BarListCard } from "@/components/analytics/BarRow";
import { AnalyticsRangeFilters } from "@/components/analytics/AnalyticsRangeFilters";
import { PairedComparisonLegend, PairedBarPair } from "@/components/analytics/PairedComparisonCard";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const BASE_PATH = "/manager/analytics/employees";

export default async function EmployeeAnalyticsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; employee?: string };
}) {
  const todayKey = toDateInputValue(new Date());
  const defaultFrom = toDateInputValue(startOfMonth(new Date()));
  const from = searchParams.from && DATE_ONLY.test(searchParams.from) ? searchParams.from : defaultFrom;
  const to = searchParams.to && DATE_ONLY.test(searchParams.to) ? searchParams.to : todayKey;

  const rows = await getEmployeeAnalyticsOverview(from, to);
  const selectedId = searchParams.employee && rows.some((r) => r.userId === searchParams.employee) ? searchParams.employee! : null;
  const detail = selectedId ? await getEmployeeAnalyticsDetail(selectedId, from, to) : null;

  function rowHref(userId: string) {
    const params = new URLSearchParams({ from, to, employee: userId });
    return `${BASE_PATH}?${params.toString()}`;
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg text-ink">Employees</h2>
        <p className="text-xs text-charcoal/50">
          Scheduled vs. actual hours, overtime, and workload for each active employee — click a row to see their full
          breakdown for this range.
        </p>
      </div>

      <AnalyticsRangeFilters from={from} to={to} />

      <div className="mb-6 overflow-hidden rounded-2xl border border-linen bg-white">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-charcoal/60">No active employees.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-linen text-xs uppercase tracking-wide text-charcoal/50">
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Scheduled</th>
                  <th className="px-4 py-2">Worked</th>
                  <th className="px-4 py-2">Overtime</th>
                  <th className="px-4 py-2">Tickets</th>
                  <th className="px-4 py-2">Items completed</th>
                  <th className="px-4 py-2">Pickups</th>
                  <th className="px-4 py-2">Assigned now</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.userId}
                    className={`border-b border-linen/60 last:border-0 ${r.userId === selectedId ? "bg-cream" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <Link href={rowHref(r.userId)} className="font-medium text-thread hover:underline">
                        {r.name}
                      </Link>
                      <span className="ml-1 text-[11px] text-charcoal/40">{r.role === "MANAGER" ? "Manager" : ""}</span>
                    </td>
                    <td className="px-4 py-2 text-charcoal/70">{formatMinutesAsHours(r.scheduledMinutes)}</td>
                    <td className="px-4 py-2 text-charcoal/70">{formatMinutesAsHours(r.workedMinutes)}</td>
                    <td className={`px-4 py-2 ${r.overtimeMinutes > 0 ? "text-alert" : "text-charcoal/70"}`}>
                      {r.overtimeMinutes > 0 ? formatMinutesAsHours(r.overtimeMinutes) : "—"}
                    </td>
                    <td className="px-4 py-2 text-charcoal/70">{r.ticketsCreated}</td>
                    <td className="px-4 py-2 text-charcoal/70">{r.itemsCompleted}</td>
                    <td className="px-4 py-2 text-charcoal/70">{r.pickupsAuthorized}</td>
                    <td className="px-4 py-2 text-charcoal/70">{r.currentlyAssigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mb-6 -mt-4 text-[11px] text-charcoal/40">
        Scheduled = published, non-cancelled shifts overlapping this range. Worked = clocked hours from punches (unpaid
        lunches subtracted, paid breaks not). Overtime = worked hours beyond 40 in any shop week (Mon–Sun) the range
        touches. "Assigned now" is a current snapshot, not scoped to the date range above.
      </p>

      {detail && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">{detail.name}</h2>
            <Link href={`${BASE_PATH}?from=${from}&to=${to}`} className="text-xs text-charcoal/50 hover:text-ink">
              ✕ Close
            </Link>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <StatCard label="Scheduled" value={formatMinutesAsHours(detail.scheduledMinutes)} />
            <StatCard label="Worked" value={formatMinutesAsHours(detail.workedMinutes)} />
            <StatCard
              label="Overtime"
              value={detail.overtimeMinutes > 0 ? formatMinutesAsHours(detail.overtimeMinutes) : "None"}
              accent={detail.overtimeMinutes > 0}
            />
            <StatCard
              label="Time off (approved)"
              value={`${detail.approvedTimeOffDays} day${detail.approvedTimeOffDays === 1 ? "" : "s"}`}
              sublabel={`${detail.approvedTimeOffCount} request${detail.approvedTimeOffCount === 1 ? "" : "s"} overlapping this range`}
            />
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <WeeklyBreakdownCard weeks={detail.weeklyBreakdown} />
            <BarListCard
              title="Garment turnover"
              subtitle={
                detail.itemsCompleted === 0
                  ? undefined
                  : `${detail.itemsCompleted} item${detail.itemsCompleted === 1 ? "" : "s"} completed in this range${
                      detail.avgItemTurnaroundDays !== null ? ` · avg ${detail.avgItemTurnaroundDays}d from intake to completion` : ""
                    }`
              }
              empty={detail.garmentBreakdown.length === 0 ? "No items completed by this person in this range." : undefined}
            >
              {detail.garmentBreakdown.map((g) => (
                <BarRow
                  key={g.label}
                  label={g.label}
                  valueLabel={`${g.count}×`}
                  pct={(g.count / detail.garmentBreakdown[0].count) * 100}
                />
              ))}
            </BarListCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Tickets created" value={detail.ticketsCreated} />
            <StatCard label="Pickups authorized" value={detail.pickupsAuthorized} />
            <StatCard label="Currently assigned" value={detail.currentlyAssigned} sublabel="Right now, not date-ranged" />
          </div>
        </div>
      )}
    </>
  );
}

function WeeklyBreakdownCard({
  weeks,
}: {
  weeks: { weekStart: string; scheduledMinutes: number; workedMinutes: number; overtimeMinutes: number }[];
}) {
  if (weeks.length === 0) {
    return <BarListCard title="Scheduled vs. worked, by week" empty="No shifts or punches fall in this range." />;
  }
  const maxMinutes = Math.max(1, ...weeks.map((w) => Math.max(w.scheduledMinutes, w.workedMinutes)));
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="text-sm font-medium text-ink">Scheduled vs. worked, by week</p>
      <p className="mb-3 text-[11px] text-charcoal/40">Shop weeks run Monday–Sunday.</p>
      {/* A genuine before/after comparison per week — two fixed colors with one legend
          for the whole card, instead of two same-colored bars a reader had to eyeball
          against each other (see PairedComparisonCard's header comment). */}
      <PairedComparisonLegend labelA="Scheduled" labelB="Worked" />
      <div className="space-y-3">
        {weeks.map((w) => (
          <PairedBarPair
            key={w.weekStart}
            groupLabel={`Week of ${w.weekStart}`}
            valueA={w.scheduledMinutes}
            valueB={w.workedMinutes}
            valueLabelA={formatMinutesAsHours(w.scheduledMinutes)}
            valueLabelB={formatMinutesAsHours(w.workedMinutes)}
            max={maxMinutes}
            note={w.overtimeMinutes > 0 ? <span className="text-alert">+{formatMinutesAsHours(w.overtimeMinutes)} OT</span> : undefined}
          />
        ))}
      </div>
    </div>
  );
}
