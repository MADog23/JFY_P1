"use client";

/**
 * Employee-facing "my schedule" view. Read-only by design: publishing/editing lives
 * entirely in ScheduleBuilder (manager-only). A client component now only because of the
 * List/Calendar toggle below — the shift data itself still comes straight from the server
 * page as props, nothing is fetched here.
 */

import { useState } from "react";
import { formatShopDateTime, toShopDateKey, listShopDateKeysInRange } from "@/lib/dates";

type ShiftRow = {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  note: string | null;
};

// Always shown in the shop's own timezone (see lib/dates.ts) — this used to be a server
// component, so without an explicit timeZone these would have rendered in whatever
// timezone the server itself happens to be set to (Railway, most likely UTC), not the
// employee's.
function fmtDay(d: Date | string) {
  return formatShopDateTime(d, { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(d: Date | string) {
  return formatShopDateTime(d, { hour: "numeric", minute: "2-digit" });
}
function dayHeaderLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function ShiftDetails({ shift }: { shift: ShiftRow }) {
  return (
    <div>
      <p className="text-charcoal/60">
        {fmtTime(shift.startAt)} – {fmtTime(shift.endAt)}
        {shift.role && ` · ${shift.role}`}
      </p>
      {shift.note && <p className="text-[11px] text-charcoal/40">{shift.note}</p>}
    </div>
  );
}

export function MyScheduleList({ shifts, from, to }: { shifts: ShiftRow[]; from: string; to: string }) {
  const [view, setView] = useState<"list" | "calendar">("list");

  if (shifts.length === 0) {
    return <p className="rounded-xl border border-linen bg-white p-4 text-sm text-charcoal/60">No published shifts in this range yet.</p>;
  }

  const byDay = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const key = toShopDateKey(s.startAt);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(s);
  }
  const dayKeys = listShopDateKeysInRange(from, to);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-full border border-linen bg-white p-1 text-sm">
          <button
            onClick={() => setView("list")}
            className={`rounded-full px-3 py-1 ${view === "list" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
          >
            List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded-full px-3 py-1 ${view === "calendar" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
          >
            Calendar
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-linen bg-white">
          {shifts.map((shift) => (
            <div key={shift.id} className="flex items-center justify-between gap-2 border-b border-linen/60 px-4 py-3 text-sm last:border-0">
              <div>
                <p className="text-ink">{fmtDay(shift.startAt)}</p>
                <ShiftDetails shift={shift} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-7">
          {dayKeys.map((key) => {
            const dayShifts = byDay.get(key) ?? [];
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-linen bg-white">
                <div className="border-b border-linen bg-cream px-2 py-1.5 text-center text-xs font-medium text-charcoal/70">
                  {dayHeaderLabel(key)}
                </div>
                {dayShifts.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11px] text-charcoal/40">—</p>
                ) : (
                  dayShifts.map((shift) => (
                    <div key={shift.id} className="border-b border-linen/60 px-2 py-2 last:border-0">
                      <ShiftDetails shift={shift} />
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
