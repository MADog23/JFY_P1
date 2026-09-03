"use client";

/**
 * Manager-facing schedule builder. Add-shift form plus a list of shifts in the
 * current range, each with Publish/Edit/Cancel. Drafts (unpublished) are visually
 * distinct from published ones — a manager should always be able to tell at a glance
 * what staff can actually see versus what's still being worked out.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShift, publishShifts, cancelShift, updateShift } from "@/actions/shifts";
import { toDateTimeInputValue, formatShopDateTime, toShopDateKey, listShopDateKeysInRange } from "@/lib/dates";

type Employee = { id: string; name: string };
type ShiftRow = {
  id: string;
  userId: string;
  user: { name: string };
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  publishedAt: Date | string | null;
};

function fmt(d: Date | string) {
  // Always shown in the shop's own timezone (see lib/dates.ts) — not whichever timezone
  // this browser happens to be set to — so this always matches what the employee sees.
  return formatShopDateTime(d, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dayHeaderLabel(dateKey: string) {
  // dateKey is a plain YYYY-MM-DD — format it as a shop-local date without going through
  // a UTC instant that could land on the wrong side of midnight for the reader.
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function AddShiftForm({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [role, setRole] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  return (
    <div className="rounded-xl border border-linen bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-ink">Add a shift</h3>
      {error && <p className="mb-2 text-[11px] text-alert">{error}</p>}
      {added && <p className="mb-2 text-[11px] text-sage">Added as a draft — remember to publish it.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Employee
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Starts
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Ends
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Role (optional)
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Front counter" className="focus-ring w-36 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm" />
        </label>
        <button
          disabled={isPending || !userId || !startAt || !endAt}
          onClick={() =>
            startTransition(async () => {
              setAdded(false);
              // Pass the raw datetime-local string through as-is — the server interprets it
              // as shop-local time (see actions/shifts.ts), not this browser's own timezone.
              const r = await createShift({ userId, startAt, endAt, role: role || undefined });
              if (r.ok) {
                setAdded(true);
                setStartAt("");
                setEndAt("");
                setRole("");
                router.refresh();
              } else setError(r.error || "Could not add shift.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-40"
        >
          Add draft shift
        </button>
      </div>
    </div>
  );
}

function ShiftRowItem({ shift }: { shift: ShiftRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [startAt, setStartAt] = useState(toDateTimeInputValue(shift.startAt));
  const [endAt, setEndAt] = useState(toDateTimeInputValue(shift.endAt));
  const [role, setRole] = useState(shift.role ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <div className="border-b border-linen/60 px-4 py-2.5 text-sm last:border-0">
        {error && <p className="mb-1 text-[11px] text-alert">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink">{shift.user.name}</span>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-sm" />
          <span className="text-charcoal/40">–</span>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-sm" />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="focus-ring w-32 rounded-lg border border-linen bg-white px-2 py-1 text-sm" />
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const r = await updateShift(shift.id, { startAt, endAt, role: role || undefined });
                if (r.ok) {
                  setEditing(false);
                  router.refresh();
                } else setError(r.error || "Could not save.");
              })
            }
            className="focus-ring rounded bg-ink px-3 py-1 text-xs text-cream"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setStartAt(toDateTimeInputValue(shift.startAt));
              setEndAt(toDateTimeInputValue(shift.endAt));
              setRole(shift.role ?? "");
              setError(null);
            }}
            className="focus-ring rounded border border-linen px-3 py-1 text-xs text-charcoal/60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linen/60 px-4 py-2.5 text-sm last:border-0">
      <div>
        <span className="text-ink">{shift.user.name}</span>
        <span className="ml-2 text-charcoal/60">
          {fmt(shift.startAt)} – {fmt(shift.endAt)}
        </span>
        {shift.role && <span className="ml-2 text-[11px] text-charcoal/40">{shift.role}</span>}
        {!shift.publishedAt ? (
          <span className="ml-2 rounded-full bg-brass/20 px-2 py-0.5 text-[11px] font-medium text-charcoal/70">draft</span>
        ) : (
          <span className="ml-2 rounded-full bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-sage">published</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-alert">{error}</span>}
        {!shift.publishedAt && (
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const r = await publishShifts([shift.id]);
                if (r.ok) router.refresh();
                else setError(r.error || "Could not publish.");
              })
            }
            className="focus-ring rounded-lg border border-linen bg-white px-3 py-1 text-xs text-thread hover:border-thread/50"
          >
            Publish
          </button>
        )}
        <button onClick={() => setEditing(true)} className="focus-ring rounded-lg border border-linen bg-white px-3 py-1 text-xs text-charcoal/70 hover:border-thread/50">
          Edit
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            const reason = prompt("Reason for cancelling this shift (optional):") ?? undefined;
            startTransition(async () => {
              const r = await cancelShift(shift.id, reason);
              if (r.ok) router.refresh();
              else setError(r.error || "Could not cancel.");
            });
          }}
          className="focus-ring rounded-lg border border-alert/40 px-3 py-1 text-xs text-alert hover:bg-alert/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ScheduleBuilder({
  employees,
  shifts,
  from,
  to,
}: {
  employees: Employee[];
  shifts: ShiftRow[];
  /** YYYY-MM-DD bounds of the range being shown — used only to lay out the calendar
   * view's day columns (so a day with zero shifts still gets a column). */
  from: string;
  to: string;
}) {
  const router = useRouter();
  const draftIds = shifts.filter((s) => !s.publishedAt).map((s) => s.id);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"list" | "calendar">("calendar");

  const byDay = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const key = toShopDateKey(s.startAt);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(s);
  }
  const dayKeys = listShopDateKeysInRange(from, to);

  return (
    <div className="space-y-4">
      <AddShiftForm employees={employees} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {draftIds.length > 0 ? (
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const r = await publishShifts(draftIds);
                if (r.ok) router.refresh();
              })
            }
            className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-40"
          >
            Publish all {draftIds.length} draft shift{draftIds.length === 1 ? "" : "s"} in this range
          </button>
        ) : (
          <span />
        )}

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
          {shifts.length === 0 ? (
            <p className="px-4 py-4 text-sm text-charcoal/60">No shifts scheduled in this range yet.</p>
          ) : (
            shifts.map((s) => <ShiftRowItem key={s.id} shift={s} />)
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
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
                  dayShifts.map((s) => <ShiftRowItem key={s.id} shift={s} />)
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
