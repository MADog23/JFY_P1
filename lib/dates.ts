/** Small date-range helpers shared by Phase 2's timeclock/schedule pages. Weeks
 * run Monday–Sunday, matching how shop scheduling is normally talked about ("this
 * week's schedule"), not the JS default of Sunday-start. */

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formats a Date for an `<input type="datetime-local">` value, in local time (not
 * UTC — toISOString() would shift the displayed time for anyone not in UTC). */
export function toDateTimeInputValue(d: Date | string): string {
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Resolves optional from/to searchParams (YYYY-MM-DD) into a Monday–Sunday range
 * covering today's week if neither is provided. */
export function resolveWeekRange(from?: string, to?: string): { from: Date; to: Date } {
  if (from && to) {
    return { from: new Date(`${from}T00:00:00`), to: new Date(`${to}T23:59:59`) };
  }
  const now = new Date();
  return { from: startOfWeek(now), to: endOfWeek(now) };
}
