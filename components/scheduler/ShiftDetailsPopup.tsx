"use client";

/**
 * Click-a-shift-for-details modal, shared by every scheduler view (the daily Gantt's
 * bars AND the week/month roster's chips route through this same component) — one
 * consistent place to view, edit, publish, or delete a shift, so the interaction is
 * identical no matter which zoom level you clicked from. Every mutation here goes
 * through the same actions/shifts.ts functions the rest of the app already uses, so the
 * audit log keeps recording exactly as it does today — this component adds no logging
 * of its own, and shouldn't need to.
 */

import { useState, useTransition } from "react";
import { updateShift, publishShifts, cancelShift } from "@/actions/shifts";
import { formatMinutesOfDay } from "@/lib/scheduler";
import { formatShopDateTime } from "@/lib/dates";

export type PopupShift = {
  id: string;
  userId: string;
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  note: string | null;
  publishedAt: Date | string | null;
  user: { id: string; name: string };
};

function toTimeInputValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTimeInputValue(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function ShiftDetailsPopup({
  shift,
  dateKey,
  startMinutes,
  endMinutes,
  onClose,
  onChanged,
}: {
  shift: PopupShift;
  /** The calendar date (shop-local) this shift is being viewed/edited against — needed
   * to turn the time-only inputs below back into a full shopDateTimeLocalSchema string. */
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [startTime, setStartTime] = useState(toTimeInputValue(startMinutes));
  const [endTime, setEndTime] = useState(toTimeInputValue(endMinutes));
  const [role, setRole] = useState(shift.role ?? "");
  const [note, setNote] = useState(shift.note ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateShift(shift.id, {
        startAt: `${dateKey}T${startTime}`,
        endAt: `${dateKey}T${endTime}`,
        role: role || undefined,
        note: note || undefined,
      });
      if (r.ok) {
        onChanged();
        setEditing(false);
      } else setError(r.error || "Could not save.");
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      const r = await publishShifts([shift.id]);
      if (r.ok) onChanged();
      else setError(r.error || "Could not publish.");
    });
  }

  function remove() {
    if (!confirm(`Remove ${shift.user.name}'s shift? This is reversible — a manager can always add it back.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelShift(shift.id);
      if (r.ok) onChanged();
      else setError(r.error || "Could not remove.");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-linen bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg text-ink">{shift.user.name}</p>
            <p className="text-xs text-charcoal/50">
              {formatShopDateTime(shift.startAt, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          {!shift.publishedAt ? (
            <span className="shrink-0 rounded-full bg-brass/20 px-2 py-0.5 text-[11px] font-medium text-charcoal/70">draft</span>
          ) : (
            <span className="shrink-0 rounded-full bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-sage">published</span>
          )}
        </div>

        {error && <p className="mb-2 text-sm text-alert">{error}</p>}

        {!editing ? (
          <>
            <p className="mb-1 text-ink">
              {formatMinutesOfDay(startMinutes)} – {formatMinutesOfDay(endMinutes)}
            </p>
            {shift.role && <p className="mb-1 text-sm text-charcoal/60">{shift.role}</p>}
            {shift.note && <p className="mb-3 text-sm text-charcoal/50">{shift.note}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setEditing(true)}
                className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm text-charcoal/70 hover:bg-linen"
              >
                Edit
              </button>
              {!shift.publishedAt && (
                <button
                  disabled={isPending}
                  onClick={publish}
                  className="focus-ring rounded-lg border border-thread/40 bg-brass/10 px-3 py-1.5 text-sm text-thread hover:bg-brass/20"
                >
                  Publish
                </button>
              )}
              <button
                disabled={isPending}
                onClick={remove}
                className="focus-ring ml-auto rounded-lg border border-alert/40 px-3 py-1.5 text-sm text-alert hover:bg-alert/10"
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="focus-ring rounded-lg border border-linen bg-cream px-2 py-1.5 text-sm"
              />
              <span className="text-charcoal/40">–</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="focus-ring rounded-lg border border-linen bg-cream px-2 py-1.5 text-sm"
              />
            </div>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role (optional) — e.g. Front counter"
              className="focus-ring mb-2 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              rows={2}
              className="focus-ring mb-3 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={isPending}
                onClick={save}
                className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-40"
              >
                Save changes
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setStartTime(toTimeInputValue(startMinutes));
                  setEndTime(toTimeInputValue(endMinutes));
                  setRole(shift.role ?? "");
                  setNote(shift.note ?? "");
                  setError(null);
                }}
                className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm text-charcoal/60"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        <button
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute right-3 top-3 rounded-lg px-2 py-1 text-charcoal/40 hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
