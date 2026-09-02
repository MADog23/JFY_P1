/**
 * Employee-facing "my schedule" view. Read-only by design: publishing/editing
 * lives entirely in ScheduleBuilder (manager-only). Purely presentational, so it can be
 * a server component — no client interactivity needed here.
 */

type ShiftRow = {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  note: string | null;
};

function fmtDay(d: Date | string) {
  return new Date(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
