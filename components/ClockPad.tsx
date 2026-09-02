"use client";

/**
 * Employee-facing clock in/out/break control. Big, unambiguous buttons on
 * purpose: this is meant to work as well on a shared kiosk-style tablet at the front
 * counter as it does on someone's own phone, and Homebase's whole complaint was that
 * punches go missing or land wrong — this should never leave someone unsure whether
 * their tap registered.
 */

import { useState, useTransition } from "react";
import { clockIn, clockOut, startBreak, endBreak } from "@/actions/punches";
import type { CurrentPunchState } from "@/lib/hours";

const STATE_LABEL: Record<CurrentPunchState, string> = {
  CLOCKED_OUT: "You're clocked out",
  CLOCKED_IN: "You're clocked in",
  ON_BREAK: "You're on a break",
};

const STATE_COLOR: Record<CurrentPunchState, string> = {
  CLOCKED_OUT: "text-charcoal/60",
  CLOCKED_IN: "text-sage",
  ON_BREAK: "text-brass",
};

export function ClockPad({ initialState }: { initialState: CurrentPunchState }) {
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, nextState: CurrentPunchState, confirmMessage: string) {
    startTransition(async () => {
      setError(null);
      const r = await action();
      if (r.ok) {
        setState(nextState);
        setLastAction(confirmMessage);
      } else {
        setError(r.error || "Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-linen bg-white p-6 text-center">
      <p className={`text-sm font-medium ${STATE_COLOR[state]}`}>{STATE_LABEL[state]}</p>
      {lastAction && !error && <p className="mt-1 text-xs text-charcoal/50">{lastAction}</p>}
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {state === "CLOCKED_OUT" && (
          <button
            disabled={isPending}
            onClick={() => run(clockIn, "CLOCKED_IN", `Clocked in at ${new Date().toLocaleTimeString()}.`)}
            className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
          >
            Clock in
          </button>
        )}

        {state === "CLOCKED_IN" && (
          <>
            <button
              disabled={isPending}
              onClick={() => run(clockOut, "CLOCKED_OUT", `Clocked out at ${new Date().toLocaleTimeString()}.`)}
              className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
            >
              Clock out
            </button>
            <button
              disabled={isPending}
              onClick={() => run(startBreak, "ON_BREAK", `Break started at ${new Date().toLocaleTimeString()}.`)}
              className="focus-ring rounded-xl border border-linen bg-white px-6 py-3 text-sm font-medium text-charcoal/80 hover:border-thread/50 disabled:opacity-40"
            >
              Start break
            </button>
          </>
        )}

        {state === "ON_BREAK" && (
          <button
            disabled={isPending}
            onClick={() => run(endBreak, "CLOCKED_IN", `Break ended at ${new Date().toLocaleTimeString()}.`)}
            className="focus-ring rounded-xl bg-ink px-6 py-4 text-lg font-medium text-cream disabled:opacity-40"
          >
            End break
          </button>
        )}
      </div>
    </div>
  );
}
