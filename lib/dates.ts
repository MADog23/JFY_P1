/** Date-range and shop-timezone helpers shared by Phase 2's timeclock/scheduling pages.
 * Weeks run Monday–Sunday, matching how shop scheduling is normally talked about ("this
 * week's schedule"), not the JS default of Sunday-start.
 *
 * Every shift/punch timestamp is entered and displayed in SHOP_TIME_ZONE, always — never
 * whatever timezone happens to be set on the device doing the entering, viewing, or
 * rendering. Without this, a server-rendered page (Railway, most likely UTC) and a
 * browser-rendered page (whatever the viewer's own device happens to be set to) show two
 * different times for the exact same shift — a manager could enter "7:06 PM" and an
 * employee would see "12:06 AM the next day." Every function below exists to make that
 * impossible: parsing always means "this wall-clock time in the shop's zone," and
 * formatting always means "show it as it reads in the shop's zone," full stop.
 */

import { z } from "zod";

export const SHOP_TIME_ZONE = "America/Chicago";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The wall-clock year/month/day/hour/minute/second `date` reads as in `timeZone` —
 * regardless of the machine's own timezone. */
function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Inverse of getZonedParts: given wall-clock components meant to be read in `timeZone`,
 * returns the UTC instant they correspond to. Handles DST correctly because the offset is
 * derived from the real IANA rules for that specific date, not a fixed number — it guesses
 * the instant is UTC, checks what that guess actually reads as in `timeZone`, and corrects
 * by the difference. */
function zonedWallClockToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  timeZone: string
): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
  const seenAsZoned = getZonedParts(new Date(guess), timeZone);
  const seenAsUtc = Date.UTC(seenAsZoned.year, seenAsZoned.month - 1, seenAsZoned.day, seenAsZoned.hour, seenAsZoned.minute, seenAsZoned.second);
  return new Date(guess - (seenAsUtc - guess));
}

/** Adds `days` calendar days to a Y/M/D triple — pure calendar arithmetic, unaffected by
 * DST (it never represents a real instant, just a date). */
function addCalendarDays(y: number, m: number, day: number, days: number) {
  const d = new Date(Date.UTC(y, m - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Parses a `datetime-local` input's value ("YYYY-MM-DDTHH:mm", optionally with seconds),
 * always treating it as a wall-clock time in SHOP_TIME_ZONE — regardless of which
 * device/browser entered it. This is what makes a shift entered as "7:06 PM" actually mean
 * 7:06 PM Central for everyone, not "7:06 PM in whatever timezone the entering computer
 * happens to be set to." Returns an Invalid Date if `value` isn't in the expected shape. */
export function parseShopDateTimeLocal(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return new Date(NaN);
  const [, year, month, day, hour, minute, second] = match;
  return zonedWallClockToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: second ? Number(second) : 0,
    },
    SHOP_TIME_ZONE
  );
}

/** Zod piece for any form field that's a `datetime-local` string meant to be interpreted
 * in the shop's timezone (shift start/end, a manually-added or corrected punch time). Use
 * this in place of z.coerce.date() anywhere a raw datetime-local value reaches a server
 * action — z.coerce.date() would parse it using the SERVER's own ambient timezone instead. */
export const shopDateTimeLocalSchema = z.string().transform((val, ctx) => {
  const parsed = parseShopDateTimeLocal(val);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid date/time." });
    return z.NEVER;
  }
  return parsed;
});

/** Start-of-day / end-of-day instant for a YYYY-MM-DD calendar date, in SHOP_TIME_ZONE —
 * for turning a plain date (from a date-range filter) into the correct UTC range
 * boundary. z.coerce.date() on a bare "YYYY-MM-DD" parses it as UTC midnight, which is
 * actually late evening the PREVIOUS day in Central time — these fix that. */
export function shopDayStart(dateOnly: string): Date {
  return parseShopDateTimeLocal(`${dateOnly}T00:00:00`);
}
export function shopDayEnd(dateOnly: string): Date {
  return parseShopDateTimeLocal(`${dateOnly}T23:59:59`);
}

/** Zod piece for a "YYYY-MM-DD"-shaped from/to range param, anchored to shop-local
 * day boundaries instead of UTC midnight. */
export const shopDateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");

/** Formats a Date for an `<input type="datetime-local">` value, showing the wall-clock
 * time as it reads in SHOP_TIME_ZONE — regardless of which device is doing the rendering.
 * (Previously used the rendering machine's own local time, which made an edit form
 * pre-fill with the wrong time whenever the viewing device wasn't in the shop's zone —
 * including Railway's server, which runs server components like the employee schedule
 * view.) */
export function toDateTimeInputValue(d: Date | string): string {
  const p = getZonedParts(new Date(d), SHOP_TIME_ZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** YYYY-MM-DD, in SHOP_TIME_ZONE. */
export function toDateInputValue(d: Date): string {
  const p = getZonedParts(d, SHOP_TIME_ZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The YYYY-MM-DD calendar date `d` falls on in SHOP_TIME_ZONE — used to bucket punches
 * into the day someone would actually call "today," not whatever day UTC happens to be
 * (Central is 5-6 hours behind UTC, so anything after roughly 6-7pm was landing under
 * tomorrow's date before this fix). */
export function toShopDateKey(d: Date | string): string {
  return toDateInputValue(new Date(d));
}

/** Formats a shift/punch time for display — always in SHOP_TIME_ZONE, so the manager's
 * browser, an employee's browser, and the server (Railway, likely UTC) all show the exact
 * same wall-clock time for the same instant. Use this instead of a raw toLocaleString /
 * toLocaleDateString / toLocaleTimeString call anywhere a shift or punch timestamp (or
 * "right now," for a clock-in/out confirmation) is shown. */
export function formatShopDateTime(d: Date | string, options: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString([], { ...options, timeZone: SHOP_TIME_ZONE });
}

export function startOfWeek(d: Date): Date {
  const p = getZonedParts(d, SHOP_TIME_ZONE);
  const dowProbe = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sunday
  const diff = (dowProbe + 6) % 7; // days since Monday
  const start = addCalendarDays(p.year, p.month, p.day, -diff);
  return zonedWallClockToUtc({ ...start, hour: 0, minute: 0, second: 0 }, SHOP_TIME_ZONE);
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const p = getZonedParts(start, SHOP_TIME_ZONE);
  const end = addCalendarDays(p.year, p.month, p.day, 6);
  return zonedWallClockToUtc({ ...end, hour: 23, minute: 59, second: 59 }, SHOP_TIME_ZONE);
}

/** Resolves optional from/to searchParams (YYYY-MM-DD) into a Monday–Sunday range
 * covering today's week (in SHOP_TIME_ZONE) if neither is provided. */
export function resolveWeekRange(from?: string, to?: string): { from: Date; to: Date } {
  if (from && to) {
    return { from: shopDayStart(from), to: shopDayEnd(to) };
  }
  const now = new Date();
  return { from: startOfWeek(now), to: endOfWeek(now) };
}

/** Every YYYY-MM-DD (shop-zone) calendar date from `from` through `to`, inclusive — used
 * to lay out a calendar view's day columns, one per date, even for a day with no shifts.
 * Walks day-by-day using calendar arithmetic (not fixed-ms steps) so it's unaffected by
 * the one or two DST transitions a year can fall inside the range. Capped at ~13 months
 * as a safety net against a malformed range, not a real limit on how far this is used. */
export function listShopDateKeysInRange(from: Date | string, to: Date | string): string[] {
  const toKey = toDateInputValue(new Date(to));
  const keys: string[] = [toDateInputValue(new Date(from))];
  let cursor = shopDayStart(keys[0]);
  let guard = 0;
  while (keys[keys.length - 1] < toKey && guard < 400) {
    const p = getZonedParts(cursor, SHOP_TIME_ZONE);
    const next = addCalendarDays(p.year, p.month, p.day, 1);
    const nextKey = `${next.year}-${pad(next.month)}-${pad(next.day)}`;
    keys.push(nextKey);
    cursor = shopDayStart(nextKey);
    guard++;
  }
  return keys;
}
