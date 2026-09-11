"use client";

/**
 * Secondary, typed-entry way to add a shift on the daily Gantt — dragging on the
 * timeline is great for "I can see the gap and I'm filling it," but typing exact times
 * is sometimes just faster, especially on a trackpad. Always adds to the day currently
 * being viewed (see DailyGanttView) — to add a shift on a different day, navigate there
 * first, same as dragging would require.
 */

import { useState, useTransition } from "react";
import { createShift } from "@/actions/shifts";
import { formatShopHoursForDateKey } from "@/lib/shop-hours";

export function QuickAddShiftForm({
  dateKey,
  employees,
  onAdded,
}: {
  dateKey: string;
  employees: { id: string; name: string }[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [role, setRole] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={employees.length === 0}
        className="focus-ring rounded-lg border border-dashed border-linen bg-white px-3 py-1.5 text-sm text-charcoal/60 hover:border-thread/50 disabled:opacity-40"
      >
        + Add a custom shift
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-linen bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Add a custom shift — shop hours today: {formatShopHoursForDateKey(dateKey)}</p>
        <button onClick={() => setOpen(false)} className="text-xs text-charcoal/50 hover:text-ink">
          Close
        </button>
      </div>
      {error && <p className="mb-2 text-[11px] text-alert">{error}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Employee
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Starts
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Ends
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Role (optional)
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Front counter"
            className="focus-ring w-36 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <button
          disabled={isPending || !userId}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await createShift({
                userId,
                startAt: `${dateKey}T${startTime}`,
                endAt: `${dateKey}T${endTime}`,
                role: role || undefined,
              });
              if (r.ok) {
                setRole("");
                onAdded();
              } else setError(r.error || "Could not add shift.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-40"
        >
          Add draft shift
        </button>
      </div>
      <p className="mt-2 text-[11px] text-charcoal/40">
        Added as a draft, same as dragging on the timeline — nothing is visible to staff until you publish it.
      </p>
    </div>
  );
}
