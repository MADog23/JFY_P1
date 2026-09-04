"use client";

/**
 * Employee-facing clock in/out/break/lunch control. Big, unambiguous buttons on
 * purpose: this is meant to work as well on a shared kiosk-style tablet at the front
 * counter as it does on someone's own phone, and Homebase's whole complaint was that
 * punches go missing or land wrong — this should never leave someone unsure whether
 * their tap registered.
 *
 * Break vs lunch is a real, deliberate distinction, not just two labels for the same
 * thing: a break is short and PAID (counts as worked time); lunch is unpaid and gets
 * subtracted. See lib/hours.ts's header for the full reasoning. The buttons themselves
 * are labeled by their expected real-world length ("Break (10 min)" / "Lunch (30
 * min)") rather than by the paid/unpaid distinction — that's still true underneath
 * (see the state banner below and lib/hours.ts), it's just not what a staff member at
 * the counter needs to see on the button itself.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut, startBreak, endBreak, startLunch, endLunch } from "@/actions/punches";
import { EXPECTED_BREAK_MINUTES, EXPECTED_LUNCH_MINUTES, type CurrentPunchState } from "@/lib/hours";
import { formatShopDateTime } from "@/lib/dates";

// Always shown in the shop's own timezone (see lib/dates.ts) so this confirmation always
// matches the timestamp a manager will later see on the punch itself, even if this
// device's own clock/timezone is set to something else.
function nowLabel() {
  return formatShopDateTime(new Date(), { hour: "numeric", minute: "2-digit" });
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Live countdown from the expected break/lunch length, ticking once a second. Counts
 * down to 0:00 and then keeps counting *up* past it in a warning color — the length
 * itself is a display-only expectation (see lib/hours.ts's EXPECTED_*_MINUTES), never
 * enforced, so running over never blocks anything — it's just visible. */
function BreakTimer({ startedAt, expectedMinutes }: { startedAt: Date; expectedMinutes: number }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedSeconds = (now.getTime() - startedAt.getTime()) / 1000;
  const remainingSeconds = expectedMinutes * 60 - elapsedSeconds;
  const over = remainingSeconds < 0;

  return (
    <p className={`mt-2 font-display text-2xl tabular-nums ${over ? "text-alert" : "text-ink"}`}>
      {over ? `+${formatClock(-remainingSeconds)} over` : formatClock(remainingSeconds)}
      <span className="ml-2 text-xs font-normal text-charcoal/50">{over ? "" : "remaining"}</span>
    </p>
  );
}

const STATE_LABEL: Record<CurrentPunchState, string> = {
  CLOCKED_OUT: "You're clocked out",
  CLOCKED_IN: "You're clocked in",
  ON_BREAK: "You're on a break (paid)",
  ON_LUNCH: "You're on lunch (unpaid)",
};

const STATE_COLOR: Record<CurrentPunchState, string> = {
  CLOCKED_OUT: "text-charcoal/60",
  CLOCKED_IN: "text-sage",
  ON_BREAK: "text-brass",
  ON_LUNCH: "text-brass",
};

export function ClockPad({
  initialState,
  initialStartedAt,
}: {
  initialState: CurrentPunchState;
  /** Start time of the current break/lunch, if any — powers the live timer below and
   * lets it show the right elapsed time even right after a page refresh. */
  initialStartedAt: Date | null;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [startedAt, setStartedAt] = useState(initialStartedAt);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    nextState: CurrentPunchState,
    confirmMessage: string,
    nextStartedAt: Date | null
  ) {
    startTransition(async () => {
      setError(null);
      const r = await action();
      if (r.ok) {
        setState(nextState);
        setStartedAt(nextStartedAt);
        setLastAction(confirmMessage);
        // The button state above updates immediately regardless, but this page also shows
        // a server-rendered "this week" totals list alongside the pad — without this it
        // would stay stale until a manual reload, same bug as the schedule/timeclock pages.
        router.refresh();
      } else {
        setError(r.error || "Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-linen bg-white p-6 text-center">
      <p className={`text-sm font-medium ${STATE_COLOR[state]}`}>{STATE_LABEL[state]}</p>
      {(state === "ON_BREAK" || state === "ON_LUNCH") && startedAt && (
        <BreakTimer startedAt={startedAt} expectedMinutes={state === "ON_BREAK" ? EXPECTED_BREAK_MINUTES : EXPECTED_LUNCH_MINUTES} />
      )}
      {lastAction && !error && <p className="mt-1 text-xs text-charcoal/50">{lastAction}</p>}
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {state === "CLOCKED_OUT" && (
          <button
            disabled={isPending}
            onClick={() => run(clockIn, "CLOCKED_IN", `Clocked in at ${nowLabel()}.`, null)}
            className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
          >
            Clock in
          </button>
        )}

        {state === "CLOCKED_IN" && (
          <>
            <button
              disabled={isPending}
              onClick={() => run(clockOut, "CLOCKED_OUT", `Clocked out at ${nowLabel()}.`, null)}
              className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
            >
              Clock out
            </button>
            <button
              disabled={isPending}
              onClick={() => run(startBreak, "ON_BREAK", `Break started at ${nowLabel()}.`, new Date())}
              className="focus-ring rounded-xl border border-linen bg-white px-6 py-3 text-sm font-medium text-charcoal/80 hover:border-thread/50 disabled:opacity-40"
            >
              Break (10 min)
            </button>
            <button
              disabled={isPending}
              onClick={() => run(startLunch, "ON_LUNCH", `Lunch started at ${nowLabel()}.`, new Date())}
              className="focus-ring rounded-xl border border-linen bg-white px-6 py-3 text-sm font-medium text-charcoal/80 hover:border-thread/50 disabled:opacity-40"
            >
              Lunch (30 min)
            </button>
          </>
        )}

        {state === "ON_BREAK" && (
          <button
            disabled={isPending}
            onClick={() => run(endBreak, "CLOCKED_IN", `Break ended at ${nowLabel()}.`, null)}
            className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
          >
            End break
          </button>
        )}

        {state === "ON_LUNCH" && (
          <button
            disabled={isPending}
            onClick={() => run(endLunch, "CLOCKED_IN", `Lunch ended at ${nowLabel()}.`, null)}
            className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
          >
            End lunch
          </button>
        )}
      </div>
    </div>
  );
}
