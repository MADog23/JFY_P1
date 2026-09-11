"use client";

/**
 * One-click "default shift" add, sitting next to the full QuickAddShiftForm on the
 * daily Gantt. Most staff get a standard shift most days, so this skips typing any
 * times at all and only asks who — the fastest path for "this person just isn't on the
 * board yet." The default is always the shop's own hours for that day, padded 30
 * minutes on each side (e.g. Mon-Fri 9a-5p shop hours -> 8:30a-5:30p default; Sat
 * 10a-2p -> 9:30a-2:30p default) — see lib/shop-hours.ts's getShopHoursForDateKey.
 * Renders nothing on a day the shop's closed (Sunday) since there's no shop-hours
 * window to base a default on.
 *
 * Only lists employees NOT already scheduled this day (see DailyGanttView, which
 * filters the list it passes in): that's the exact case this is for, and anyone already
 * scheduled can still get a second/split shift via the full Quick Add form or by
 * dragging on the timeline. Always adds a draft, same as every other way of adding a
 * shift here — invisible to staff until published.
 */

import { useState, useTransition } from "react";
import { createShift } from "@/actions/shifts";
import { dayMinutesToShopDateTimeLocal, formatMinutesOfDay } from "@/lib/scheduler";
import { getShopHoursForDateKey } from "@/lib/shop-hours";

const PAD_MINUTES = 30;

export function DefaultShiftQuickAdd({
  dateKey,
  employees,
  onAdded,
}: {
  dateKey: string;
  /** Employees with nothing scheduled on this day yet — see the filter in DailyGanttView. */
  employees: { id: string; name: string }[];
  onAdded: () => void;
}) {
  const [userId, setUserId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shopWindow = getShopHoursForDateKey(dateKey);

  if (employees.length === 0 || !shopWindow) return null;

  const defaultStartMinutes = shopWindow.openMinutes - PAD_MINUTES;
  const defaultEndMinutes = shopWindow.closeMinutes + PAD_MINUTES;

  // Fall back to the first still-unscheduled employee if the previously-selected one
  // just got added (and so dropped out of the list on refresh) or was never set.
  const selectedUserId = employees.some((e) => e.id === userId) ? userId : employees[0].id;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-linen bg-white px-3 py-1.5">
      <span className="text-sm text-charcoal/60">
        Default shift ({formatMinutesOfDay(defaultStartMinutes)}–{formatMinutesOfDay(defaultEndMinutes)}) for
      </span>
      <select
        value={selectedUserId}
        onChange={(e) => setUserId(e.target.value)}
        className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-sm"
      >
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        disabled={isPending || !selectedUserId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await createShift({
              userId: selectedUserId,
              startAt: dayMinutesToShopDateTimeLocal(dateKey, defaultStartMinutes),
              endAt: dayMinutesToShopDateTimeLocal(dateKey, defaultEndMinutes),
            });
            if (r.ok) {
              setUserId("");
              onAdded();
            } else setError(r.error || "Could not add shift.");
          })
        }
        className="focus-ring rounded-lg bg-ink px-3 py-1 text-sm text-cream disabled:opacity-40"
      >
        Add
      </button>
      {error && <span className="text-[11px] text-alert">{error}</span>}
    </div>
  );
}
