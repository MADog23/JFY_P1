/**
 * Store hours — used ONLY by the manager scheduler's coverage-gap shading (see
 * lib/scheduler.ts). It's the window the shading asks "should someone be covered right
 * now" within. Staff can still be scheduled outside these hours (early setup, a
 * Saturday running long, whatever) — that's never blocked anywhere — this constant only
 * decides which hours get checked for a gap.
 *
 * Same "plain constant, easy to edit here and redeploy" pattern as SHOP_TIME_ZONE in
 * lib/dates.ts. Promote to a manager-editable setting later if these ever need to
 * change without a code change — not needed for v1.
 */

export type ShopHoursWindow = { openMinutes: number; closeMinutes: number } | null;

function hm(hour: number, minute: number): number {
  return hour * 60 + minute;
}

// Index 0 = Sunday … 6 = Saturday (matches Date.getUTCDay()/getDay()).
const SHOP_HOURS_BY_WEEKDAY: ShopHoursWindow[] = [
  null, // Sunday — closed
  { openMinutes: hm(9, 0), closeMinutes: hm(17, 0) }, // Monday    9:00a–5:00p
  { openMinutes: hm(9, 0), closeMinutes: hm(17, 0) }, // Tuesday   9:00a–5:00p
  { openMinutes: hm(9, 0), closeMinutes: hm(17, 0) }, // Wednesday 9:00a–5:00p
  { openMinutes: hm(9, 0), closeMinutes: hm(17, 0) }, // Thursday  9:00a–5:00p
  { openMinutes: hm(9, 0), closeMinutes: hm(17, 0) }, // Friday    9:00a–5:00p
  { openMinutes: hm(10, 0), closeMinutes: hm(14, 0) }, // Saturday 10:00a–2:00p
];

/**
 * The shop-hours window for a shop-local calendar date key ("YYYY-MM-DD"), or null if
 * the shop's closed that day (Sunday). Takes the date key rather than a Date/day-of-week
 * number directly so callers never have to worry about deriving "day of week" in the
 * wrong timezone — pair with lib/dates.ts's toShopDateKey to get the key for an instant.
 */
export function getShopHoursForDateKey(dateKey: string): ShopHoursWindow {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Pure calendar-date math, same technique as lib/dates.ts's addCalendarDays — this
  // UTC-anchored Date is only ever used to read back a day-of-week for the Y/M/D triple,
  // never treated as a real instant.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return SHOP_HOURS_BY_WEEKDAY[dow];
}

/** Human-readable label for a day's hours (or "Closed") — used in the scheduler's day
 * header so a manager always sees what window the shading below it is judging against. */
export function formatShopHoursForDateKey(dateKey: string): string {
  const window = getShopHoursForDateKey(dateKey);
  if (!window) return "Closed";
  const fmt = (mins: number) => {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h24 >= 12 ? "pm" : "am";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
  };
  return `${fmt(window.openMinutes)} – ${fmt(window.closeMinutes)}`;
}
