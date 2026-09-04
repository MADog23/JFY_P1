/**
 * Pure punch → hours-worked calculation. No database access, no pay rate, no overtime
 * multiplier, no payroll-export shape — deliberately. Phase 2's scope is timeclock +
 * scheduling only until how payroll/accounting actually runs today is confirmed (see
 * phase2/PLAN.md's "Due diligence" section). This file answers "how many hours did
 * someone work," full stop — nothing here decides what that's worth or how it's paid.
 *
 * Break vs lunch: BREAK_START/BREAK_END is a short paid break — it counts as worked time
 * and is never subtracted. LUNCH_START/LUNCH_END is an unpaid meal period — it's
 * subtracted from worked time. That's the one thing this file *does* decide, because it's
 * a factual distinction (paid vs unpaid), not a pay-rate/overtime decision. It deliberately
 * doesn't enforce any particular break/lunch length or count (e.g. "two 15s and a 30 for
 * an 8-hour day") — the shop can vary that by policy or by how someone's hours change;
 * this just needs to know which kind of pause is which so a total is never quietly wrong.
 *
 * Design note: a Punch is a single timestamped event (CLOCK_IN / CLOCK_OUT / BREAK_START /
 * BREAK_END / LUNCH_START / LUNCH_END), not a stored "shift record" with a precomputed
 * total. That means correcting or voiding one bad punch (see actions/punches.ts)
 * automatically fixes every total derived from it — there's no separate cached number to
 * go stale.
 */

import { toShopDateKey } from "./dates";

export type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "LUNCH_START" | "LUNCH_END";

export type PunchLike = {
  id: string;
  type: PunchType;
  timestamp: Date;
};

export type BreakInterval = {
  start: Date;
  end: Date | null; // null = never ended (open, or forced-closed — see flags)
};

export type WorkSession = {
  /** Punch ids that made up this session, in order — lets a UI link back to raw punches. */
  punchIds: string[];
  clockIn: Date;
  /** null = still clocked in (an open/in-progress session, e.g. "right now"). */
  clockOut: Date | null;
  /** Paid short breaks — tracked for visibility, never subtracted from workedMinutes. */
  breaks: BreakInterval[];
  /** Unpaid meal periods — subtracted from workedMinutes. */
  lunches: BreakInterval[];
  /**
   * Minutes actually worked (clocked-in time minus completed lunches — paid breaks are
   * NOT subtracted). Null while the session is still open (no clock-out yet) or has an
   * unresolved anomaly that makes the number unreliable — see `flags`. A manager should
   * review anything with flags before treating the total as final.
   */
  workedMinutes: number | null;
  /** Human-readable anomalies worth a manager's attention — never silently dropped. */
  flags: string[];
};

/**
 * Turns a user's raw punches (any order) into a sequence of work sessions. Punches that
 * don't fit the expected CLOCK_IN → [BREAK_START → BREAK_END | LUNCH_START → LUNCH_END]* →
 * CLOCK_OUT shape (a missed clock-out, a double clock-in, a break/lunch with no matching
 * end, a break started while already on lunch) are not dropped — they're included with a
 * `flags` entry explaining what looked wrong, so nothing about a messy real-world day
 * disappears silently. Void punches must be filtered out by the caller before calling this
 * (see actions/punches.ts) — this function has no concept of "voided," it just processes
 * whatever list it's given.
 */
export function pairPunchesIntoSessions(punches: PunchLike[]): WorkSession[] {
  const sorted = [...punches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const sessions: WorkSession[] = [];

  let current: WorkSession | null = null;
  let openBreak: BreakInterval | null = null;
  let openLunch: BreakInterval | null = null;

  function newSession(punchId: string, timestamp: Date, flags: string[] = []): WorkSession {
    return { punchIds: [punchId], clockIn: timestamp, clockOut: null, breaks: [], lunches: [], workedMinutes: null, flags };
  }

  function closeCurrent() {
    if (!current) return;
    if (openBreak) {
      // Clocked out (or a new clock-in arrived) while still "on break" — close it at the
      // same moment rather than leaving it dangling, but flag it: this means someone
      // forgot to tap "end break."
      openBreak.end = current.clockOut ?? openBreak.start;
      current.flags.push("Break was never explicitly ended — auto-closed at clock-out.");
      openBreak = null;
    }
    if (openLunch) {
      openLunch.end = current.clockOut ?? openLunch.start;
      current.flags.push("Lunch was never explicitly ended — auto-closed at clock-out.");
      openLunch = null;
    }
    current.workedMinutes = computeWorkedMinutes(current);
    sessions.push(current);
    current = null;
  }

  for (const punch of sorted) {
    switch (punch.type) {
      case "CLOCK_IN": {
        if (current) {
          // Two clock-ins with no clock-out in between — a real data problem (double
          // tap, or a genuinely missed clock-out from the prior session). Close the
          // stale one as open/unresolved rather than silently merging or dropping it.
          current.flags.push("Clocked in again before a matching clock-out — previous session left open.");
          closeCurrentAsOpen();
        }
        current = newSession(punch.id, punch.timestamp);
        break;
      }
      case "CLOCK_OUT": {
        if (!current) {
          sessions.push(newSession(punch.id, punch.timestamp, ["Clock-out with no matching clock-in — needs a manager to add the missing punch."]));
          sessions[sessions.length - 1].clockOut = punch.timestamp;
          break;
        }
        current.punchIds.push(punch.id);
        current.clockOut = punch.timestamp;
        closeCurrent();
        break;
      }
      case "BREAK_START": {
        if (!current) {
          sessions.push(newSession(punch.id, punch.timestamp, ["Break started with no active clock-in — needs a manager to review."]));
          break;
        }
        if (openLunch) {
          current.flags.push("Break started while already on lunch — ignored.");
          break;
        }
        if (openBreak) {
          current.flags.push("Break started again while already on break — ignored the extra start.");
          break;
        }
        current.punchIds.push(punch.id);
        openBreak = { start: punch.timestamp, end: null };
        current.breaks.push(openBreak);
        break;
      }
      case "BREAK_END": {
        if (!current || !openBreak) {
          const target = current ?? sessions[sessions.length - 1];
          target?.flags.push("Break ended with no matching break-start — ignored.");
          break;
        }
        current.punchIds.push(punch.id);
        openBreak.end = punch.timestamp;
        openBreak = null;
        break;
      }
      case "LUNCH_START": {
        if (!current) {
          sessions.push(newSession(punch.id, punch.timestamp, ["Lunch started with no active clock-in — needs a manager to review."]));
          break;
        }
        if (openBreak) {
          current.flags.push("Lunch started while already on a break — ignored.");
          break;
        }
        if (openLunch) {
          current.flags.push("Lunch started again while already on lunch — ignored the extra start.");
          break;
        }
        current.punchIds.push(punch.id);
        openLunch = { start: punch.timestamp, end: null };
        current.lunches.push(openLunch);
        break;
      }
      case "LUNCH_END": {
        if (!current || !openLunch) {
          const target = current ?? sessions[sessions.length - 1];
          target?.flags.push("Lunch ended with no matching lunch-start — ignored.");
          break;
        }
        current.punchIds.push(punch.id);
        openLunch.end = punch.timestamp;
        openLunch = null;
        break;
      }
    }
  }

  // Whatever's left open at the end of the list is genuinely in progress right now
  // (or, if it's from a past day, a missed clock-out worth flagging) — surface it either
  // way rather than silently dropping the tail.
  if (current) {
    current.workedMinutes = null;
    sessions.push(current);
  }

  return sessions;

  function closeCurrentAsOpen() {
    if (!current) return;
    current.workedMinutes = null;
    sessions.push(current);
    current = null;
    openBreak = null;
    openLunch = null;
  }
}

function computeWorkedMinutes(session: WorkSession): number | null {
  if (!session.clockOut) return null;
  if (session.lunches.some((l) => l.end === null)) return null;

  const totalMs = session.clockOut.getTime() - session.clockIn.getTime();
  // Paid breaks are intentionally excluded from this subtraction — only unpaid lunches
  // reduce worked time.
  const lunchMs = session.lunches.reduce((sum, l) => sum + (l.end!.getTime() - l.start.getTime()), 0);
  const workedMs = totalMs - lunchMs;

  if (workedMs < 0) {
    session.flags.push("Computed negative worked time (clock-out before clock-in, or lunches longer than the shift) — needs review.");
    return null;
  }

  return Math.round(workedMs / 60000);
}

export type DaySummary = {
  /** Calendar date the session's clock-in fell on, as YYYY-MM-DD in the shop's own
   *  timezone (see lib/dates.ts's SHOP_TIME_ZONE) — not UTC, which would put a lot of
   *  evening sessions under the wrong (next) day. A session that crosses midnight is
   *  attributed to the day it *started*, not split. */
  date: string;
  totalMinutes: number;
  /** Sessions still missing a total (open, or flagged) are excluded from totalMinutes,
   * not silently counted as zero — this count says how many exist so a manager knows the
   * total is incomplete rather than assuming a slow day. */
  incompleteSessionCount: number;
  sessions: WorkSession[];
};

function toDateKey(d: Date): string {
  return toShopDateKey(d);
}

/** Groups a set of sessions (already produced by pairPunchesIntoSessions) into one
 * summary per calendar day. */
export function summarizeSessionsByDay(sessions: WorkSession[]): DaySummary[] {
  const byDate = new Map<string, DaySummary>();

  for (const session of sessions) {
    const key = toDateKey(session.clockIn);
    let day = byDate.get(key);
    if (!day) {
      day = { date: key, totalMinutes: 0, incompleteSessionCount: 0, sessions: [] };
      byDate.set(key, day);
    }
    day.sessions.push(session);
    if (session.workedMinutes === null || session.flags.length > 0) {
      day.incompleteSessionCount += 1;
    }
    if (session.workedMinutes !== null) {
      day.totalMinutes += session.workedMinutes;
    }
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Convenience: raw punches straight to per-day summaries in one call. */
export function summarizePunchesByDay(punches: PunchLike[]): DaySummary[] {
  return summarizeSessionsByDay(pairPunchesIntoSessions(punches));
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(2)} hrs`;
}

/** What to show on a "clock in / out" button right now, derived from a user's most
 * recent punches (today plus a little lookback for an overnight shift in progress). */
export type CurrentPunchState = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK" | "ON_LUNCH";

/**
 * Display-only expected durations for the "Break"/"Lunch" buttons (see ClockPad) — NOT
 * enforced anywhere in the hours math above (that file-header comment still holds: this
 * app deliberately doesn't enforce any particular break/lunch length or count). These
 * only drive the button copy and the on-screen timer's countdown target; a break or
 * lunch that runs long is still fully counted/subtracted exactly as before, just shown
 * in a warning color past this point.
 */
export const EXPECTED_BREAK_MINUTES = 10;
export const EXPECTED_LUNCH_MINUTES = 30;

export type CurrentPunchDetail = {
  state: CurrentPunchState;
  /** When the current break/lunch started — null unless state is ON_BREAK/ON_LUNCH.
   * Lets a client-side timer show real elapsed time (and survive a page refresh)
   * instead of only knowing "you're on break" with no start point. */
  startedAt: Date | null;
};

export function currentPunchDetail(recentPunches: PunchLike[]): CurrentPunchDetail {
  const sessions = pairPunchesIntoSessions(recentPunches);
  const last = sessions[sessions.length - 1];
  if (!last || last.clockOut !== null) return { state: "CLOCKED_OUT", startedAt: null };
  const lastBreak = last.breaks[last.breaks.length - 1];
  if (lastBreak && lastBreak.end === null) return { state: "ON_BREAK", startedAt: lastBreak.start };
  const lastLunch = last.lunches[last.lunches.length - 1];
  if (lastLunch && lastLunch.end === null) return { state: "ON_LUNCH", startedAt: lastLunch.start };
  return { state: "CLOCKED_IN", startedAt: null };
}

/** Thin wrapper over currentPunchDetail for call sites that only need the state. */
export function currentPunchState(recentPunches: PunchLike[]): CurrentPunchState {
  return currentPunchDetail(recentPunches).state;
}
