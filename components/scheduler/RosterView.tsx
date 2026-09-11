"use client";

/**
 * Zoomed-out week/month view — a compact roster of who's working each day rather than
 * hour-level Gantt detail (trying to cram that into a 30-day view would just be
 * unreadable). This is the "who's on which day" / "how far out is the schedule actually
 * built" view. Clicking a day's header jumps into that day's Gantt (navigates to
 * `${basePath}?view=day&date=...`); clicking any individual shift chip opens the same ShiftDetailsPopup the daily Gantt
 * uses, with the same edit/publish/delete actions — this view is look-AND-touch, not
 * read-only, just via a popup instead of dragging.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMinutesOfDay, groupShiftsByEmployeeForDay, minutesFromDayStart, computeCoverageGaps, type ShiftLike } from "@/lib/scheduler";
import { toShopDateKey } from "@/lib/dates";
import { ShiftDetailsPopup } from "./ShiftDetailsPopup";

function dayHeaderLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RosterView({
  dateKeys,
  shifts,
  basePath,
}: {
  dateKeys: string[];
  shifts: ShiftLike[];
  /** e.g. "/manager/schedule" — clicking a day's header navigates here with
   * ?view=day&date=<that day>, dropping into its Gantt. */
  basePath: string;
}) {
  const router = useRouter();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const byDay = new Map<string, ShiftLike[]>();
  for (const s of shifts) {
    const key = toShopDateKey(s.startAt);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(s);
  }

  const selected = selectedShiftId ? shifts.find((s) => s.id === selectedShiftId) : null;
  const selectedDateKey = selected ? toShopDateKey(selected.startAt) : null;

  return (
    <div className="space-y-2">
      {dateKeys.map((dateKey) => {
        const dayShifts = byDay.get(dateKey) ?? [];
        const rows = groupShiftsByEmployeeForDay(dayShifts);
        const gaps = computeCoverageGaps(dateKey, dayShifts);
        return (
          <div key={dateKey} className="rounded-xl border border-linen bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => router.push(`${basePath}?view=day&date=${dateKey}`)}
                className="focus-ring rounded text-sm font-medium text-ink hover:text-thread"
              >
                {dayHeaderLabel(dateKey)}
              </button>
              {gaps.length > 0 && (
                <span className="rounded-full bg-alert/10 px-2 py-0.5 text-[11px] font-medium text-alert">
                  {gaps.length} gap{gaps.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rows.length === 0 ? (
                <span className="text-xs text-charcoal/40">Nothing scheduled</span>
              ) : (
                rows.flatMap((row) =>
                  row.shifts.map((shift) => {
                    const startMin = minutesFromDayStart(dateKey, shift.startAt);
                    const endMin = minutesFromDayStart(dateKey, shift.endAt);
                    const published = !!shift.publishedAt;
                    return (
                      <button
                        key={shift.id}
                        onClick={() => setSelectedShiftId(shift.id)}
                        className={`focus-ring rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          published ? "bg-thread text-cream" : "border border-dashed border-thread bg-brass/15 text-thread"
                        }`}
                        title={shift.role ?? undefined}
                      >
                        {row.name} · {formatMinutesOfDay(startMin)}–{formatMinutesOfDay(endMin)}
                      </button>
                    );
                  })
                )
              )}
            </div>
          </div>
        );
      })}

      {selected && selected.user && selectedDateKey && (
        <ShiftDetailsPopup
          shift={selected as any}
          dateKey={selectedDateKey}
          startMinutes={minutesFromDayStart(selectedDateKey, selected.startAt)}
          endMinutes={minutesFromDayStart(selectedDateKey, selected.endAt)}
          onClose={() => setSelectedShiftId(null)}
          onChanged={() => {
            setSelectedShiftId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
