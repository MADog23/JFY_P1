/**
 * Pure punch → hours-worked calculation. No database access, no pay rate, no overtime
 * multiplier, no payroll-export shape — deliberately. Phase 2's scope is timeclock +
 * scheduling only until how payroll/accounting actually runs today is confirmed (see
 * phase2/PLAN.md's "Due diligence" section). This file answers "how many hours did
 * someone work," full stop — nothing here decides what that's worth or how it's paid.
 *
 * Design note: a Punch is a single timestamped event (CLOCK_IN / CLOCK_OUT /
 * BREAK_START / BREAK_END), not a stored "shift record" with a precomputed total. That
 * means correcting or voiding one bad punch (see actions/punches.ts) automatically
 * fixes every total derived from it — there's no separate cached number to go stale.
 */

import { toShopDateKey } from "./dates";

export type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

export type PunchLike = {
  id: string;
  type: PunchType;
  timestamp: Date;
};

export type BreakInterval = {
  start: Date;
  end: Date | null; // null = break never ended (open, or forced-closed — see flags)
};

export type WorkSession = {
  /** Punch ids that made up this session, in order — lets a UI link back to raw punches. */
  punchIds: string[];
  clockIn: Date;
  /** null = still clocked in (an open/in-progress session, e.g. "right now"). */
  clockOut: Date | null;
  breaks: BreakInterval[];
  /**
   * Minutes actually worked (clocked-in time minus completed breaks). Null while the
   * session is still open (no clock-out yet) or has an unresolved anomaly that makes
   * the number unreliable — see `flags`. A manager should review anything with flags
   * before treating the total as final.
   */
  workedMinutes: number | null;
  /** Human-readable anomalies worth a manager's attention — never silently dropped. */
  flags: string[];
};

/**
 * Turns a user's raw punches (any order) into a sequence of work sessions. Punches
 * that don't fit the expected CLOCK_IN → [BREAK_START → BREAK_END]* → CLOCK_OUT shape
 * (a missed clock-out, a double clock-in, a break with no matching end) are not
 * dropped — they're included with a `flags` entry explaining what looked wrong, so nothing
 * about a messy real-world day disappears silently. Void punches must be filtered out
 * by the caller before calling this (see actions/punches.ts) — this function has
 * no concept of "voided," it just processes whatever list it's given.
 */
export function pairPunchesIntoSessions(punches: PunchLike[]): WorkSession[] {
  const sorted = [...punches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const sessions: WorkSession[] = [];

  let current: WorkSession | null = null;
  let openBreak: BreakInterval | null = null;

  function closeCurrent() {
    if (!current) return;
    if (openBreak) {
      // Clocked out (or a new clock-in arrived) while still "on break" — close the break
      // at the same moment rather than leaving it dangling, but flag it: this means
      // someone forgot to tap "end break."
      openBreak.end = current.clockOut ?? openBreak.start;
      current.flags.push("Break was never explicitly ended — auto-closed at clock-out.");
      openBreak = null;
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
        current = { punchIds: [punch.id], clockIn: punch.timestamp, clockOut: null, breaks: [], workedMinutes: null, flags: [] };
        break;
      }
      case "CLOCK_OUT": {
        if (!current) {
          sessions.push({
            punchIds: [punch.id],
            clockIn: punch.timestamp,
            clockOut: punch.timestamp,
            breaks: [],
            workedMinutes: null,
            flags: ["Clock-out with no matching clock-in — needs a manager to add the missing punch."],
          });
          break;
        }
        current.punchIds.push(punch.id);
        current.clockOut = punch.timestamp;
        closeCurrent();
        break;
      }
      case "BREAK_START": {
        if (!current) {
          sessions.push({
            punchIds: [punch.id],
            clockIn: punch.timestamp,
            clockOut: null,
            breaks: [],
            workedMinutes: null,
            flags: ["Break started with no active clock-in — needs a manager to review."],
          });
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
  }
}

function computeWorkedMinutes(session: WorkSession): number | null {
  if (!session.clockOut) return null;
  if (session.breaks.some((b) => b.end === null)) return null;

  const totalMs = session.clockOut.getTime() - session.clockIn.getTime();
  const breakMs = session.breaks.reduce((sum, b) => sum + (b.end!.getTime() - b.start.getTime()), 0);
  const workedMs = totalMs - breakMs;

  if (workedMs < 0) {
    session.flags.push("Computed negative worked time (clock-out before clock-in, or breaks longer than the shift) — needs review.");
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
export type CurrentPunchState = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

export function currentPunchState(recentPunches: PunchLike[]): CurrentPunchState {
  const sessions = pairPunchesIntoSessions(recentPunches);
  const last = sessions[sessions.length - 1];
  if (!last || last.clockOut !== null) return "CLOCKED_OUT";
  const lastBreak = last.breaks[last.breaks.length - 1];
  if (lastBreak && lastBreak.end === null) return "ON_BREAK";
  return "CLOCKED_IN";
}
