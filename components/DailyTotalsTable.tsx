/**
 * Manager-facing daily hours review. Purely presentational (no interactivity of
 * its own); a manager clicks through to the raw punch list (PunchReviewList) to actually
 * fix anything. Flags are surfaced prominently rather than folded into the total — the
 * whole point of this view is "does this look right before it goes anywhere," and a
 * silently-wrong total defeats that.
 */

import Link from "next/link";
import type { DaySummary } from "@/lib/hours";
import { formatMinutesAsHours } from "@/lib/hours";

export function DailyTotalsTable({
  rows,
  reviewHrefFor,
}: {
  rows: { userId: string; name: string; days: DaySummary[] }[];
  reviewHrefFor: (userId: string) => string;
}) {
  if (rows.every((r) => r.days.length === 0)) {
    return <p className="rounded-xl border border-linen bg-white p-4 text-sm text-charcoal/60">No punches in this range yet.</p>;
  }

  return (
    <div className="space-y-6">
      {rows
        .filter((r) => r.days.length > 0)
        .map((row) => {
          const totalMinutes = row.days.reduce((sum, d) => sum + d.totalMinutes, 0);
          const flaggedDays = row.days.filter((d) => d.incompleteSessionCount > 0).length;
          return (
            <div key={row.userId} className="overflow-hidden rounded-xl border border-linen bg-white">
              <div className="flex items-center justify-between border-b border-linen bg-cream px-4 py-2.5">
                <div>
                  <span className="font-medium text-ink">{row.name}</span>
                  {flaggedDays > 0 && (
                    <span className="ml-2 rounded-full bg-alert/10 px-2 py-0.5 text-[11px] font-medium text-alert">
                      {flaggedDays} day{flaggedDays === 1 ? "" : "s"} need review
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-charcoal/70">{formatMinutesAsHours(totalMinutes)} total</span>
                  <Link href={reviewHrefFor(row.userId)} className="focus-ring text-xs text-thread hover:underline">
                    Review punches
                  </Link>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {row.days.map((day) => (
                    <tr key={day.date} className="border-b border-linen/60 last:border-0">
                      <td className="px-4 py-2 text-charcoal/70">{day.date}</td>
                      <td className="px-4 py-2 text-ink">{formatMinutesAsHours(day.totalMinutes)}</td>
                      <td className="px-4 py-2">
                        {day.incompleteSessionCount > 0 ? (
                          <span className="rounded-full bg-alert/10 px-2 py-0.5 text-[11px] font-medium text-alert">
                            {day.incompleteSessionCount} unresolved
                          </span>
                        ) : (
                          <span className="text-[11px] text-sage">clean</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
    </div>
  );
}
