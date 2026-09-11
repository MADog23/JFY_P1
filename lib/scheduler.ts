/**
 * Shared layout/math helpers for the manager scheduler (daily Gantt + week/month
 * roster). Deliberately framework-free (no "server-only", no DOM) — used from client
 * components to lay out bars on a time axis and compute coverage gaps, all in plain
 * shop-local minutes-of-day. Not itself a data-fetching layer — see actions/shifts.ts
 * for that; this only reshapes/positions whatever shifts it's handed.
 *
 * A day is represented throughout as a "dateKey" — a shop-local YYYY-MM-DD string, see
 * lib/dates.ts's toShopDateKey — and every timestamp is converted to "minutes since
 * shop-local midnight of that dateKey" via toDateTimeInputValue rather than touching a
 * Date object's own (browser- or server-ambient) timezone directly.
 */

import { toDateTimeInputValue, toShopDateKey } from "./dates";
import { getShopHoursForDateKey } from "./shop-hours";

export type ShiftLike = {
  id: string;
  userId: string;
  startAt: Date | string;
  endAt: Date | string;
  role: string | null;
  note: string | null;
  publishedAt: Date | string | null;
  cancelledAt?: Date | string | null;
  user?: { id: string; name: string };
};

export type Interval = { startMinutes: number; endMinutes: number };

const MINUTES_PER_DAY = 24 * 60;
// Fallback axis window when there's no shop-hours window to anchor to (shouldn't
// happen given shop hours cover every day but Sunday) or when shifts fall outside it —
// wide enough to comfortably show an early setup or a late cleanup without the axis
// constantly jumping around.
const DEFAULT_AXIS_START_MINUTES = 7 * 60; // 7:00a
const DEFAULT_AXIS_END_MINUTES = 21 * 60; // 9:00p

/** Minutes since shop-local midnight of `dateKey` for a given instant — negative if the
 * instant falls on the day BEFORE dateKey (a shift that started the previous evening and
 * is being viewed on the day it ends), or >= 1440 if it falls on the day after (a shift
 * that runs past midnight, viewed on the day it started). Assumes at most one day of
 * drift either direction, which covers every realistic shift length in this app. */
export function minutesFromDayStart(dateKey: string, instant: Date | string): number {
  const instantKey = toShopDateKey(instant);
  const [, timePart] = toDateTimeInputValue(instant).split("T");
  const [hh, mm] = timePart.split(":").map(Number);
  const minutes = hh * 60 + mm;
  if (instantKey === dateKey) return minutes;
  return instantKey > dateKey ? minutes + MINUTES_PER_DAY : minutes - MINUTES_PER_DAY;
}

/** Inverse of minutesFromDayStart — turns a minutes-since-midnight value (as produced by
 * a drag/resize interaction on the Gantt) back into the "YYYY-MM-DDTHH:mm" shop-local
 * string that createShift/updateShift (via lib/dates.ts's shopDateTimeLocalSchema)
 * expect. Clamped to a single calendar day — the UI is expected to keep a shift within
 * the day it was drawn on rather than silently rolling it onto a different date. */
export function dayMinutesToShopDateTimeLocal(dateKey: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateKey}T${pad(hh)}:${pad(mm)}`;
}

/** Rounds a minutes-of-day value to the nearest `step` (default 15) — used so a drag
 * interaction lands on a sane time instead of an odd number of minutes. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

/** The [start, end] minutes-of-day the daily Gantt's hour axis should span for a given
 * day — wide enough to hold the shop's own hours AND every shift actually scheduled that
 * day (an early setup or late cleanup shift never gets clipped off the edge), rounded
 * out to a whole hour on each end for a clean-looking ruler. */
export function computeAxisBounds(dateKey: string, shifts: ShiftLike[]): { startMinutes: number; endMinutes: number } {
  const shopWindow = getShopHoursForDateKey(dateKey);
  let start = DEFAULT_AXIS_START_MINUTES;
  let end = DEFAULT_AXIS_END_MINUTES;
  if (shopWindow) {
    start = Math.min(start, shopWindow.openMinutes);
    end = Math.max(end, shopWindow.closeMinutes);
  }
  for (const s of shifts) {
    start = Math.min(start, minutesFromDayStart(dateKey, s.startAt));
    end = Math.max(end, minutesFromDayStart(dateKey, s.endAt));
  }
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(MINUTES_PER_DAY, Math.ceil(end / 60) * 60);
  return { startMinutes: start, endMinutes: end };
}

/** Converts a minutes-of-day value to a 0–100 percentage position along [axisStart,
 * axisEnd] — for positioning/sizing a shift bar or gap band with a plain CSS
 * left/width percentage. */
export function minutesToPercent(minutes: number, axisStart: number, axisEnd: number): number {
  if (axisEnd <= axisStart) return 0;
  return ((minutes - axisStart) / (axisEnd - axisStart)) * 100;
}

/** "9:00a" / "1:30p" style label for a minutes-of-day value — used on Gantt bars and the
 * shift details popup, kept separate from lib/dates.ts's formatShopDateTime since this
 * operates on a plain minutes-of-day number (already shop-local by construction), not a
 * Date instant. */
export function formatMinutesOfDay(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h24 >= 12 ? "p" : "a";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export type EmployeeDayRow = { userId: string; name: string; shifts: ShiftLike[] };

/**
 * Groups a day's (non-cancelled) shifts by employee — one row per employee who has AT
 * LEAST ONE shift that day, each row carrying every shift they have (plural, on
 * purpose: an employee can have more than one shift the same day — e.g. a split shift
 * around a doctor's appointment — and the Gantt renders each as its own bar on that
 * employee's single row rather than needing a second row for them). Employees with
 * nothing scheduled that day simply don't appear — matches "only show who's actually
 * working" for the daily view.
 */
export function groupShiftsByEmployeeForDay(shifts: ShiftLike[]): EmployeeDayRow[] {
  const byUser = new Map<string, EmployeeDayRow>();
  for (const s of shifts) {
    if (!s.user) continue;
    const row = byUser.get(s.userId) ?? { userId: s.userId, name: s.user.name, shifts: [] };
    row.shifts.push(s);
    byUser.set(s.userId, row);
  }
  const rows = [...byUser.values()];
  for (const row of rows) {
    row.shifts.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/**
 * Coverage-gap intervals (in minutes-of-day) within the shop's own hours for this day —
 * a "gap" is defined as zero non-cancelled shifts (draft or published — this reflects
 * what's currently on the board as the manager plans, not only what's already
 * published) covering that stretch of time. Returns [] on a day the shop's closed
 * (nothing to be "gapped" against) or once every open minute is covered.
 */
export function computeCoverageGaps(dateKey: string, shifts: ShiftLike[]): Interval[] {
  const shopWindow = getShopHoursForDateKey(dateKey);
  if (!shopWindow) return [];

  const covered = shifts
    .map((s) => ({
      start: Math.max(shopWindow.openMinutes, minutesFromDayStart(dateKey, s.startAt)),
      end: Math.min(shopWindow.closeMinutes, minutesFromDayStart(dateKey, s.endAt)),
    }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const iv of covered) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }

  const gaps: Interval[] = [];
  let cursor = shopWindow.openMinutes;
  for (const iv of merged) {
    if (iv.start > cursor) gaps.push({ startMinutes: cursor, endMinutes: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < shopWindow.closeMinutes) gaps.push({ startMinutes: cursor, endMinutes: shopWindow.closeMinutes });
  return gaps;
}
