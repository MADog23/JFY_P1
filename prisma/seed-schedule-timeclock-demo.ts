/**
 * SCHEDULE + TIMECLOCK DEMO DATA
 *
 * Generates realistic Shift (schedule) and Punch (timeclock) rows for your real,
 * already-existing staff — same convention as prisma/seed-historical-demo.ts: no new
 * accounts are created, staff are looked up by exact name, and the script stops
 * (before writing anything) if a name doesn't match what's in Staff accounts.
 *
 * Shop pattern this models: open Mon–Sat, 9am–6pm, closed Sunday. Staff are typically
 * scheduled 8:30am–5:00pm, but in practice often clock out late — commonly running
 * over into the 5:30–6:00pm range. That's what's baked into the punch generation
 * below: CLOCK_IN lands close to the scheduled start (a little early or a little
 * late), CLOCK_OUT is weighted to land 10–80 minutes past the scheduled end, most
 * heavily in the 30–60 minute range.
 *
 * Coverage:
 *   - Every Monday–Saturday from the first Monday of April 2026 through today
 *     (whatever "today" is when you run this). Past days get a full punch record
 *     (clock in, sometimes a break and/or lunch, clock out).
 *   - Today gets shifts plus a CLOCK_IN only for whoever's working — no clock-out
 *     yet, so the Timeclock page shows a real "currently working" state instead of a
 *     flat historical demo.
 *   - The current week and one week beyond it get published shifts with no punches
 *     yet (the upcoming schedule). The furthest-out week is left as an unpublished
 *     DRAFT on purpose, so there's a real draft schedule sitting there ready to
 *     publish — a good "try it yourself" moment for the owners.
 *
 * A little manager-side realism is mixed in too: an occasional missed punch
 * backfilled by a manager, and an occasional accidental duplicate punch that gets
 * voided — both audit-logged the same way the real actions do.
 *
 * This script assumes the Shift/Punch tables are empty (e.g. right after running
 * prisma/purge-orders-schedule-timeclock.ts --confirm). Unlike the order-seed
 * scripts, it has no clientName-style field to tag its own rows with, so it can't
 * dedupe a re-run — it refuses to run (without --force) if it finds any existing
 * Shift or Punch rows, so you don't accidentally double up the data.
 *
 * Run it with:   npx tsx prisma/seed-schedule-timeclock-demo.ts
 * Clear it with: npx tsx prisma/purge-orders-schedule-timeclock.ts --confirm
 * (same DATABASE_URL setup as the other seed scripts — see README § "Running locally"
 * for the local case, or run it via `railway run` to target the live database.)
 */

import { PrismaClient } from "@prisma/client";
import { parseShopDateTimeLocal, toDateInputValue } from "../lib/dates";

const prisma = new PrismaClient();

const EMPLOYEE_NAMES = ["Nina DeZemplen", "Autumn Vrazel", "Janice Tucker", "Kamila Chorieva", "Emilse Salinas", "Valentina Forero"];
const MANAGER_NAMES = ["Emilse Salinas", "Valentina Forero"];

const SHIFT_ROLES = ["Front counter", "Alterations bench", "Fitting room", "Pressing station"];

// --- seeded RNG (deterministic) — same mulberry32 as seed-historical-demo.ts, its own seed ---
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260901);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function chance(p: number): boolean {
  return rng() < p;
}
function pickWeighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of pairs) {
    if (r < w) return item;
    r -= w;
  }
  return pairs[pairs.length - 1][0];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- calendar helpers ------------------------------------------------------------
// Pure Y/M/D arithmetic, done in UTC so it's unaffected by whatever timezone this
// container happens to run in — these never represent a real instant, just a date.
// Real wall-clock instants (shift/punch times) are built separately below via
// parseShopDateTimeLocal, the same helper the app itself uses (lib/dates.ts).
type YMD = { year: number; month: number; day: number };
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymdKey(d: YMD): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}
function addDaysYMD(d: YMD, days: number): YMD {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}
function dayOfWeekYMD(d: YMD): number {
  // 0 = Sunday .. 6 = Saturday
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}
function mondayOnOrAfter(d: YMD): YMD {
  const dow = dayOfWeekYMD(d);
  const diff = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  return addDaysYMD(d, diff);
}
function parseKeyToYMD(key: string): YMD {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}
function shiftInstant(day: YMD, hhmm: string): Date {
  return parseShopDateTimeLocal(`${ymdKey(day)}T${hhmm}`);
}
function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

type StaffRef = { id: string; name: string };

async function logAudit(input: { entityType: "SHIFT" | "PUNCH"; entityId: string; action: string; summary: string; performedById: string }) {
  await prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: `${input.summary} (demo data).`,
      performedById: input.performedById,
    },
  });
}

function clockInDelayMinutes(): number {
  const [lo, hi] = pickWeighted<[number, number]>([
    [[-8, -1], 0.22], // a little early
    [[0, 0], 0.15], // right on time
    [[1, 10], 0.45], // a few minutes late — the common case
    [[11, 22], 0.18], // more late
  ]);
  return randInt(lo, hi);
}

function clockOutDelayMinutes(): number {
  const [lo, hi] = pickWeighted<[number, number]>([
    [[-5, 4], 0.13], // right around the scheduled end
    [[10, 29], 0.32], // a bit over
    [[30, 60], 0.4], // the common "5:30-6" runover the shop actually sees
    [[61, 80], 0.15], // a really long day
  ]);
  return randInt(lo, hi);
}

async function seedWorkDay(
  day: YMD,
  worker: StaffRef,
  managers: StaffRef[],
  isToday: boolean,
  weekPublishedAt: Date | null,
  shiftCreatedBy: StaffRef
) {
  const startHHMM = chance(0.85) ? "08:30" : "09:00";
  const endHHMM = chance(0.85) ? "17:00" : "17:30";
  const scheduledStart = shiftInstant(day, startHHMM);
  const scheduledEnd = shiftInstant(day, endHHMM);

  const role = chance(0.35) ? pick(SHIFT_ROLES) : null;
  const shift = await prisma.shift.create({
    data: {
      userId: worker.id,
      startAt: scheduledStart,
      endAt: scheduledEnd,
      role,
      createdById: shiftCreatedBy.id,
      publishedAt: weekPublishedAt,
      createdAt: weekPublishedAt ?? addMinutes(scheduledStart, -60 * 24 * 5),
    },
  });
  await logAudit({
    entityType: "SHIFT",
    entityId: shift.id,
    action: weekPublishedAt ? "SHIFT_PUBLISHED" : "SHIFT_CREATED",
    summary: weekPublishedAt
      ? `Published shift for "${worker.name}" ${scheduledStart.toISOString()} – ${scheduledEnd.toISOString()}`
      : `Scheduled "${worker.name}" ${scheduledStart.toISOString()} – ${scheduledEnd.toISOString()} (draft)`,
    performedById: shiftCreatedBy.id,
  });

  const isFuture = scheduledStart.getTime() > Date.now();
  if (isFuture && !isToday) {
    // A pure future day — schedule only, nothing has happened yet.
    return;
  }

  // --- clock in --------------------------------------------------------------
  const clockIn = addMinutes(scheduledStart, clockInDelayMinutes());
  const manuallyAdded = chance(0.05);
  const punchCreator = manuallyAdded ? pick(managers) : worker;
  const clockInRow = await prisma.punch.create({
    data: {
      userId: worker.id,
      type: "CLOCK_IN",
      timestamp: clockIn,
      createdById: punchCreator.id,
      note: manuallyAdded ? "Added by manager — missed punch" : null,
    },
  });
  await logAudit({
    entityType: "PUNCH",
    entityId: clockInRow.id,
    action: manuallyAdded ? "MANUAL_PUNCH_ADDED" : "CLOCK_IN",
    summary: manuallyAdded ? `Manually added a clock in for "${worker.name}"` : "clock in recorded",
    performedById: punchCreator.id,
  });

  // Occasional accidental duplicate clock-in, immediately voided — demonstrates the
  // "void a bad punch" feature without it ever counting toward hours.
  if (chance(0.05)) {
    const dupe = await prisma.punch.create({
      data: { userId: worker.id, type: "CLOCK_IN", timestamp: addMinutes(clockIn, randInt(1, 3)), createdById: worker.id },
    });
    const voider = pick(managers);
    await prisma.punch.update({
      where: { id: dupe.id },
      data: { voidedAt: addMinutes(clockIn, randInt(5, 30)), voidedById: voider.id, voidReason: "Duplicate tap" },
    });
    await logAudit({
      entityType: "PUNCH",
      entityId: dupe.id,
      action: "PUNCH_VOIDED",
      summary: `Voided a duplicate clock in for "${worker.name}": Duplicate tap`,
      performedById: voider.id,
    });
  }

  if (isToday) {
    // Still an open day — most people haven't clocked out yet. A little variety: some
    // are on lunch right now if enough time has actually passed since clock-in.
    if (chance(0.25)) {
      const lunchStart = addMinutes(clockIn, randInt(150, 240));
      if (lunchStart.getTime() < Date.now()) {
        const l = await prisma.punch.create({
          data: { userId: worker.id, type: "LUNCH_START", timestamp: lunchStart, createdById: worker.id },
        });
        await logAudit({ entityType: "PUNCH", entityId: l.id, action: "LUNCH_START", summary: "lunch start recorded", performedById: worker.id });
      }
    }
    return;
  }

  // --- a completed past day ---------------------------------------------------
  let cursor = clockIn;
  if (chance(0.35)) {
    const breakStart = addMinutes(cursor, randInt(90, 150));
    const breakEnd = addMinutes(breakStart, randInt(10, 15));
    const b1 = await prisma.punch.create({ data: { userId: worker.id, type: "BREAK_START", timestamp: breakStart, createdById: worker.id } });
    await logAudit({ entityType: "PUNCH", entityId: b1.id, action: "BREAK_START", summary: "break start recorded", performedById: worker.id });
    const b2 = await prisma.punch.create({ data: { userId: worker.id, type: "BREAK_END", timestamp: breakEnd, createdById: worker.id } });
    await logAudit({ entityType: "PUNCH", entityId: b2.id, action: "BREAK_END", summary: "break end recorded", performedById: worker.id });
    cursor = breakEnd;
  }
  if (chance(0.55)) {
    const lunchStart = addMinutes(scheduledStart, randInt(210, 270)); // roughly midday
    const lunchEnd = addMinutes(lunchStart, randInt(30, 45));
    if (lunchStart.getTime() > cursor.getTime()) {
      const l1 = await prisma.punch.create({ data: { userId: worker.id, type: "LUNCH_START", timestamp: lunchStart, createdById: worker.id } });
      await logAudit({ entityType: "PUNCH", entityId: l1.id, action: "LUNCH_START", summary: "lunch start recorded", performedById: worker.id });
      const l2 = await prisma.punch.create({ data: { userId: worker.id, type: "LUNCH_END", timestamp: lunchEnd, createdById: worker.id } });
      await logAudit({ entityType: "PUNCH", entityId: l2.id, action: "LUNCH_END", summary: "lunch end recorded", performedById: worker.id });
      cursor = lunchEnd;
    }
  }

  const clockOut = addMinutes(scheduledEnd, clockOutDelayMinutes());
  const clockOutFinal = clockOut.getTime() > cursor.getTime() ? clockOut : addMinutes(cursor, randInt(30, 90));
  const c = await prisma.punch.create({ data: { userId: worker.id, type: "CLOCK_OUT", timestamp: clockOutFinal, createdById: worker.id } });
  await logAudit({ entityType: "PUNCH", entityId: c.id, action: "CLOCK_OUT", summary: "clock out recorded", performedById: worker.id });
}

async function main() {
  const [existingShifts, existingPunches] = await Promise.all([prisma.shift.count(), prisma.punch.count()]);
  if ((existingShifts > 0 || existingPunches > 0) && !process.argv.includes("--force")) {
    throw new Error(
      `Found ${existingShifts} existing shift(s) and ${existingPunches} existing punch(es). This script doesn't ` +
        `tag or dedupe its rows, so running it on top of existing data would double it up. Run ` +
        `"npx tsx prisma/purge-orders-schedule-timeclock.ts --confirm" first, or re-run this with --force if you ` +
        `really mean to add on top anyway.`
    );
  }

  const employees: StaffRef[] = [];
  for (const name of EMPLOYEE_NAMES) {
    const u = await prisma.user.findFirst({ where: { name, role: "EMPLOYEE", active: true } });
    if (!u) {
      throw new Error(
        `Could not find an active EMPLOYEE account named "${name}" in Staff accounts. Check the exact ` +
          `spelling/capitalization there (or edit EMPLOYEE_NAMES in this script) and re-run.`
      );
    }
    employees.push({ id: u.id, name: u.name });
  }
  const managers: StaffRef[] = [];
  for (const name of MANAGER_NAMES) {
    const u = await prisma.user.findFirst({ where: { name, role: "MANAGER", active: true } });
    if (!u) {
      throw new Error(
        `Could not find an active MANAGER account named "${name}" in Staff accounts. Check the exact ` +
          `spelling/capitalization there (or edit MANAGER_NAMES in this script) and re-run.`
      );
    }
    managers.push({ id: u.id, name: u.name });
  }
  console.log(`Found ${employees.length} employee account(s) and ${managers.length} manager account(s). Seeding schedule + timeclock data...\n`);

  const todayKey = toDateInputValue(new Date());
  const today = parseKeyToYMD(todayKey);

  const historyStart = mondayOnOrAfter({ year: 2026, month: 4, day: 1 });
  const currentWeekStart = mondayOnOrAfter(addDaysYMD(today, -6)); // Monday of the week containing today
  const publishedThroughWeekStart = addDaysYMD(currentWeekStart, 7); // one more week of published schedule
  const draftWeekStart = addDaysYMD(currentWeekStart, 14); // furthest-out week — left as a draft

  const weeks: YMD[] = [];
  for (let w = historyStart; ymdKey(w) <= ymdKey(draftWeekStart); w = addDaysYMD(w, 7)) {
    weeks.push(w);
  }

  let shiftsCreated = 0;
  for (const weekStart of weeks) {
    const isDraftWeek = ymdKey(weekStart) === ymdKey(draftWeekStart);
    const weekPublishedAt = isDraftWeek ? null : shiftInstant(addDaysYMD(weekStart, -4), "10:00"); // published the Thursday before

    for (let offset = 0; offset < 6; offset++) {
      // Monday(0)..Saturday(5) — Sunday (offset 6) is skipped entirely, the shop's closed.
      const day = addDaysYMD(weekStart, offset);
      const dayKey = ymdKey(day);
      const isToday = dayKey === todayKey;

      const workers = shuffle(employees).slice(0, randInt(4, employees.length));
      for (const worker of workers) {
        const manager = pick(managers);
        await seedWorkDay(day, worker, managers, isToday, weekPublishedAt, manager);
        shiftsCreated++;
      }
    }
  }

  console.log(
    `\nDone. Created ${shiftsCreated} shift(s) (with matching punches for past/current days) across ${weeks.length} week(s), ` +
      `covering ${ymdKey(historyStart)} through ${ymdKey(addDaysYMD(draftWeekStart, 5))}.`
  );
  console.log(`The week of ${ymdKey(draftWeekStart)} was left unpublished as a draft schedule, ready to publish in the app.`);
  console.log(`(${ymdKey(publishedThroughWeekStart)} and every earlier week were published.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
