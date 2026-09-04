"use client";

/**
 * Employee-facing vacation/time-off request form. Submits as PENDING — a manager has
 * to approve or deny it (see components/TimeOffReviewList.tsx) before it's official.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestTimeOff, type TimeOffType } from "@/actions/time-off";

export function TimeOffRequestForm() {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TimeOffType>("PAID");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitted(false);
    startTransition(async () => {
      const r = await requestTimeOff({ startDate, endDate, type, reason: reason || undefined });
      if (r.ok) {
        setStartDate("");
        setEndDate("");
        setType("PAID");
        setReason("");
        setSubmitted(true);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-linen bg-white p-4">
      <h2 className="mb-3 text-sm font-medium text-ink">Request time off</h2>
      {error && <p className="mb-2 text-[11px] text-alert">{error}</p>}
      {submitted && <p className="mb-2 text-[11px] text-sage">Request submitted — a manager will review it.</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Start date
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          End date
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-charcoal/60">
          Type
          <div className="flex gap-1 rounded-full border border-linen bg-cream p-1 text-sm">
            <button
              type="button"
              onClick={() => setType("PAID")}
              className={`rounded-full px-3 py-1 ${type === "PAID" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setType("UNPAID")}
              className={`rounded-full px-3 py-1 ${type === "UNPAID" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}
            >
              Unpaid
            </button>
          </div>
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-xs text-charcoal/60">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Anything a manager should know"
          className="focus-ring w-full rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={isPending || !startDate || !endDate}
        className="focus-ring mt-3 rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-40"
      >
        {isPending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
