"use client";

/**
 * The daily Gantt — one row per employee working this specific day, laid out against a
 * real hour axis so a gap in coverage is just visually empty space instead of something
 * you have to read a list to notice. Supports dragging directly on the timeline to
 * create, move, or resize a shift, on top of the QuickAddShiftForm's typed entry as a
 * secondary path. An employee CAN have more than one shift the same day (a split shift
 * around an appointment, say) — see lib/scheduler.ts's groupShiftsByEmployeeForDay —
 * each just renders as its own bar on that person's one row.
 *
 * Every drag/click ultimately calls the same createShift/updateShift/publishShifts
 * functions the rest of the app already uses (actions/shifts.ts), so the audit log
 * keeps recording every change exactly as it does today — this component adds no
 * logging of its own and shouldn't need to.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShift, updateShift, publishShifts } from "@/actions/shifts";
import {
  type ShiftLike,
  computeAxisBounds,
  minutesToPercent,
  groupShiftsByEmployeeForDay,
  computeCoverageGaps,
  snapMinutes,
  dayMinutesToShopDateTimeLocal,
  minutesFromDayStart,
  formatMinutesOfDay,
} from "@/lib/scheduler";
import { formatShopHoursForDateKey } from "@/lib/shop-hours";
import { ShiftDetailsPopup } from "./ShiftDetailsPopup";
import { QuickAddShiftForm } from "./QuickAddShiftForm";
import { DefaultShiftQuickAdd } from "./DefaultShiftQuickAdd";

type Employee = { id: string; name: string };

type DragKind = "create" | "move" | "resize-left" | "resize-right";
type DragState = {
  kind: DragKind;
  userId: string;
  shiftId?: string;
  role: string | null;
  note: string | null;
  trackWidthPx: number;
  originClientX: number;
  originStartMinutes: number;
  originEndMinutes: number;
  previewStartMinutes: number;
  previewEndMinutes: number;
};

const MIN_SHIFT_MINUTES = 15;
const CLICK_VS_DRAG_THRESHOLD_PX = 4;

export function DailyGanttView({
  dateKey,
  shifts,
  employees,
}: {
  dateKey: string;
  shifts: ShiftLike[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const axis = useMemo(() => computeAxisBounds(dateKey, shifts), [dateKey, shifts]);
  const axisRef = useRef(axis);
  axisRef.current = axis;

  // Mirrors `drag` for the window-level mousemove/mouseup listeners below. Those
  // listeners are attached/torn down only on the null <-> non-null transition (see the
  // effect's dep array), so they can't just close over `drag` — it'd be stale after the
  // first tick. Reading/writing this ref instead (rather than the previous approach of
  // reading it via setDrag's functional-updater form) also means onUp can call
  // commitDrag/setSelectedShiftId as plain statements in the handler body instead of
  // from inside a setState updater — updater functions must be pure (no startTransition,
  // no calling another component's setState), and violating that is exactly what used to
  // crash the page ("Cannot call startTransition while rendering").
  const dragRef = useRef<DragState | null>(null);

  const rows = useMemo(() => groupShiftsByEmployeeForDay(shifts), [shifts]);
  const gaps = useMemo(() => computeCoverageGaps(dateKey, shifts), [dateKey, shifts]);
  const draftIds = shifts.filter((s) => !s.publishedAt).map((s) => s.id);
  const unscheduledEmployees = useMemo(() => {
    const scheduledUserIds = new Set(rows.map((r) => r.userId));
    return employees.filter((e) => !scheduledUserIds.has(e.id));
  }, [employees, rows]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let m = axis.startMinutes; m <= axis.endMinutes; m += 60) ticks.push(m);
    return ticks;
  }, [axis]);

  function pct(minutes: number) {
    return minutesToPercent(minutes, axis.startMinutes, axis.endMinutes);
  }

  function refresh() {
    router.refresh();
  }

  function commitDrag(final: DragState) {
    if (final.previewEndMinutes - final.previewStartMinutes < MIN_SHIFT_MINUTES) return;
    const startAt = dayMinutesToShopDateTimeLocal(dateKey, final.previewStartMinutes);
    const endAt = dayMinutesToShopDateTimeLocal(dateKey, final.previewEndMinutes);
    startTransition(async () => {
      if (final.kind === "create") {
        await createShift({ userId: final.userId, startAt, endAt });
      } else if (final.shiftId) {
        await updateShift(final.shiftId, { startAt, endAt, role: final.role || undefined, note: final.note || undefined });
      }
      refresh();
    });
  }

  // Window-level listeners only while an interaction is in flight — attached/torn down
  // on the null <-> non-null transition, never on every intermediate preview update.
  // Both handlers read/write dragRef (never `drag` itself, which would be stale after
  // the first tick) and only ever call setDrag/setSelectedShiftId/commitDrag as plain
  // statements in the handler body — never from inside a setState updater.
  useEffect(() => {
    if (!drag) return;

    function onMove(e: MouseEvent) {
      const prev = dragRef.current;
      if (!prev) return;
      const { startMinutes: axisStart, endMinutes: axisEnd } = axisRef.current;
      const totalMinutes = axisEnd - axisStart;
      const deltaMinutes = ((e.clientX - prev.originClientX) / prev.trackWidthPx) * totalMinutes;

      let nextStart = prev.originStartMinutes;
      let nextEnd = prev.originEndMinutes;
      if (prev.kind === "create") {
        const anchor = prev.originStartMinutes;
        const current = snapMinutes(anchor + deltaMinutes);
        nextStart = Math.min(anchor, current);
        nextEnd = Math.max(anchor, current);
      } else if (prev.kind === "move") {
        const duration = prev.originEndMinutes - prev.originStartMinutes;
        nextStart = snapMinutes(prev.originStartMinutes + deltaMinutes);
        nextEnd = nextStart + duration;
      } else if (prev.kind === "resize-left") {
        nextStart = Math.min(snapMinutes(prev.originStartMinutes + deltaMinutes), prev.originEndMinutes - MIN_SHIFT_MINUTES);
      } else if (prev.kind === "resize-right") {
        nextEnd = Math.max(snapMinutes(prev.originEndMinutes + deltaMinutes), prev.originStartMinutes + MIN_SHIFT_MINUTES);
      }

      nextStart = Math.max(axisStart, nextStart);
      nextEnd = Math.min(axisEnd, nextEnd);
      const next = { ...prev, previewStartMinutes: nextStart, previewEndMinutes: nextEnd };
      dragRef.current = next;
      setDrag(next);
    }

    function onUp(e: MouseEvent) {
      const prev = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!prev) return;
      const movedPx = Math.abs(e.clientX - prev.originClientX);
      if (movedPx < CLICK_VS_DRAG_THRESHOLD_PX) {
        if (prev.kind === "move" && prev.shiftId) setSelectedShiftId(prev.shiftId);
        return;
      }
      commitDrag(prev);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  function startTrackDrag(e: React.MouseEvent<HTMLDivElement>, userId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const totalMinutes = axis.endMinutes - axis.startMinutes;
    const clickMinutes = axis.startMinutes + ((e.clientX - rect.left) / rect.width) * totalMinutes;
    const snapped = snapMinutes(clickMinutes);
    const next: DragState = {
      kind: "create",
      userId,
      role: null,
      note: null,
      trackWidthPx: rect.width,
      originClientX: e.clientX,
      originStartMinutes: snapped,
      originEndMinutes: snapped,
      previewStartMinutes: snapped,
      previewEndMinutes: snapped,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function startBarDrag(e: React.MouseEvent<HTMLDivElement>, shift: ShiftLike, kind: DragKind) {
    e.stopPropagation();
    const track = (e.currentTarget.closest("[data-track]") as HTMLElement) ?? e.currentTarget;
    const rect = track.getBoundingClientRect();
    const startMin = minutesFromDayStart(dateKey, shift.startAt);
    const endMin = minutesFromDayStart(dateKey, shift.endAt);
    const next: DragState = {
      kind,
      userId: shift.userId,
      shiftId: shift.id,
      role: shift.role,
      note: shift.note,
      trackWidthPx: rect.width,
      originClientX: e.clientX,
      originStartMinutes: startMin,
      originEndMinutes: endMin,
      previewStartMinutes: startMin,
      previewEndMinutes: endMin,
    };
    dragRef.current = next;
    setDrag(next);
  }

  const selected = selectedShiftId ? shifts.find((s) => s.id === selectedShiftId) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-charcoal/60">
          Shop hours: <span className="font-medium text-ink">{formatShopHoursForDateKey(dateKey)}</span>
          {gaps.length === 0 ? (
            <span className="ml-2 text-sage">— fully covered</span>
          ) : (
            <span className="ml-2 text-alert">
              — {gaps.length} coverage gap{gaps.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
        {draftIds.length > 0 && (
          <button
            onClick={() =>
              startTransition(async () => {
                await publishShifts(draftIds);
                refresh();
              })
            }
            className="focus-ring rounded-lg bg-ink px-3 py-1.5 text-xs text-cream"
          >
            Publish all {draftIds.length} draft{draftIds.length === 1 ? "" : "s"} today
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linen bg-white">
        <div className="relative min-w-[640px]">
          {/* Hour axis header */}
          <div className="relative flex h-8 border-b border-linen bg-cream text-[11px] text-charcoal/50">
            {hourTicks.map((m) => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: `${pct(m)}%`, top: "8px" }}>
                {formatMinutesOfDay(m)}
              </span>
            ))}
          </div>

          {/* Coverage strip */}
          <div className="relative h-3 border-b border-linen bg-sage/10">
            {gaps.map((g, i) => (
              <div
                key={i}
                className="absolute inset-y-0 bg-alert/25"
                style={{ left: `${pct(g.startMinutes)}%`, width: `${pct(g.endMinutes) - pct(g.startMinutes)}%` }}
                title="No one scheduled during shop hours"
              />
            ))}
          </div>

          {/* Vertical hour gridlines, spanning every row below */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-11">
            {hourTicks.map((m) => (
              <div key={m} className="absolute inset-y-0 w-px bg-linen/70" style={{ left: `${pct(m)}%` }} />
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-charcoal/40">Nobody's scheduled yet — quick add someone below.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.userId}
                data-track="true"
                onMouseDown={(e) => startTrackDrag(e, row.userId)}
                className="relative h-14 border-b border-linen/60 last:border-0"
              >
                <span className="absolute left-2 top-1 z-10 rounded-md border border-linen bg-white px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
                  {row.name}
                </span>
                {row.shifts.map((shift) => {
                  const isDraggingThis = drag?.shiftId === shift.id;
                  const startMin = isDraggingThis ? drag!.previewStartMinutes : minutesFromDayStart(dateKey, shift.startAt);
                  const endMin = isDraggingThis ? drag!.previewEndMinutes : minutesFromDayStart(dateKey, shift.endAt);
                  const left = pct(startMin);
                  const width = pct(endMin) - left;
                  const published = !!shift.publishedAt;
                  return (
                    <div
                      key={shift.id}
                      onMouseDown={(e) => startBarDrag(e, shift, "move")}
                      className={`absolute bottom-1.5 top-6 flex cursor-grab items-center justify-center overflow-hidden rounded-lg text-[11px] font-medium ${
                        published
                          ? "bg-thread text-cream"
                          : "border-2 border-dashed border-thread bg-brass/15 text-thread"
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      title={`${formatMinutesOfDay(startMin)} – ${formatMinutesOfDay(endMin)}${shift.role ? ` · ${shift.role}` : ""}`}
                    >
                      <div
                        onMouseDown={(e) => startBarDrag(e, shift, "resize-left")}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                      />
                      <span className="truncate px-2">
                        {formatMinutesOfDay(startMin)}–{formatMinutesOfDay(endMin)}
                      </span>
                      <div
                        onMouseDown={(e) => startBarDrag(e, shift, "resize-right")}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                      />
                    </div>
                  );
                })}
                {drag?.kind === "create" && drag.userId === row.userId && (
                  <div
                    className="absolute bottom-1.5 top-6 rounded-lg border-2 border-dashed border-thread bg-thread/20"
                    style={{
                      left: `${pct(drag.previewStartMinutes)}%`,
                      width: `${Math.max(pct(drag.previewEndMinutes) - pct(drag.previewStartMinutes), 1)}%`,
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-charcoal/40">
        Drag on an employee's row to add a shift, drag a shift's edges to resize it, drag its middle to move it, or click it
        for details. Dashed bars are drafts — invisible to staff until published.
      </p>

      <div className="flex flex-wrap items-start gap-2">
        <DefaultShiftQuickAdd dateKey={dateKey} employees={unscheduledEmployees} onAdded={refresh} />
        <QuickAddShiftForm dateKey={dateKey} employees={employees} onAdded={refresh} />
      </div>

      {selected && selected.user && (
        <ShiftDetailsPopup
          shift={selected as any}
          dateKey={dateKey}
          startMinutes={minutesFromDayStart(dateKey, selected.startAt)}
          endMinutes={minutesFromDayStart(dateKey, selected.endAt)}
          onClose={() => setSelectedShiftId(null)}
          onChanged={() => {
            setSelectedShiftId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
