/**
 * Employee-facing "my schedule" view. Read-only by design: publishing/editing
 * lives entirely in ScheduleBuilder (manager-only). Purely presentational, so it can be
 * a server component — no client interactivity needed here.
 */

import { formatShopDateTime } from "@/lib/dates";

type ShiftRow = {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  note: string | null;
};

// Always shown in the shop's own timezone (see lib/dates.ts) — this is a server
// component, so without an explicit timeZone these would render in whatever timezone the
// server itself happens to be set to (Railway, most likely UTC), not the employee's.
function fmtDay(d: Date | string) {
  return formatShopDateTime(d, { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(d: Date | string) {
  return formatShopDateTime(d, { hour: "numeric", minute: "2-digit" });
}

export function MyScheduleList({ shifts }: { shifts: ShiftRow[] }) {
  if (shifts.length === 0) {
    return <p className="rounded-xl border border-linen bg-white p-4 text-sm text-charcoal/60">No published shifts in this range yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-linen bg-white">
      {shifts.map((shift) => (
        <div key={shift.id} className="flex items-center justify-between gap-2 border-b border-linen/60 px-4 py-3 text-sm last:border-0">
          <div>
            <p className="text-ink">{fmtDay(shift.startAt)}</p>
            <p className="text-charcoal/60">
              {fmtTime(shift.startAt)} – {fmtTime(shift.endAt)}
              {shift.role && ` · ${shift.role}`}
            </p>
            {shift.note && <p className="text-[11px] text-charcoal/40">{shift.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
