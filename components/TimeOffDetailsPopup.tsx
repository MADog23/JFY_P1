"use client";

/**
 * Click-a-request-for-details modal — the time-off equivalent of the scheduler's
 * ShiftDetailsPopup. Used by TimeOffCalendarView so clicking a day's chip gets the same
 * approve/deny/cancel actions as a row in TimeOffReviewList's list view, just reached
 * from the calendar instead. Every mutation here goes through the same
 * actions/time-off.ts functions the list view uses, so the audit log keeps recording
 * exactly as it does today.
 */

import { useState, useTransition } from "react";
import { decideTimeOffRequest, cancelTimeOffRequest, type TimeOffStatus, type TimeOffType } from "@/actions/time-off";
import { formatShopDateTime } from "@/lib/dates";

export type PopupTimeOffRequest = {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  type: TimeOffType;
  reason: string | null;
  status: TimeOffStatus;
  decisionNote: string | null;
  user: { id: string; name: string };
  decidedBy: { name: string } | null;
  createdBy: { id: string; name: string };
};

const STATUS_STYLE: Record<TimeOffStatus, string> = {
  PENDING: "bg-brass/20 text-charcoal/70",
  APPROVED: "bg-sage/15 text-sage",
  DENIED: "bg-alert/10 text-alert",
  CANCELLED: "bg-linen text-charcoal/40",
};

function fmt(d: Date | string) {
  return formatShopDateTime(d, { month: "short", day: "numeric", year: "numeric" });
}

export function TimeOffDetailsPopup({
  request,
  onClose,
  onChanged,
}: {
  request: PopupTimeOffRequest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "APPROVED" | "DENIED") {
    const note = prompt(`Note for this ${decision === "APPROVED" ? "approval" : "denial"} (optional):`) ?? undefined;
    setError(null);
    startTransition(async () => {
      const r = await decideTimeOffRequest(request.id, decision, note);
      if (r.ok) onChanged();
      else setError(r.error);
    });
  }

  function cancel() {
    const note = prompt(`Reason for cancelling this ${request.status.toLowerCase()} request (optional):`) ?? undefined;
    setError(null);
    startTransition(async () => {
      const r = await cancelTimeOffRequest(request.id, note);
      if (r.ok) onChanged();
      else setError(r.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-linen bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg text-ink">{request.user.name}</p>
            <p className="text-xs text-charcoal/50">
              {fmt(request.startDate)} – {fmt(request.endDate)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[request.status]}`}>
            {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
          </span>
        </div>

        {error && <p className="mb-2 text-sm text-alert">{error}</p>}

        <p className="mb-1 text-sm text-charcoal/60">{request.type === "PAID" ? "Paid" : "Unpaid"}</p>
        {request.reason && <p className="mb-1 text-sm text-charcoal/50">Reason: {request.reason}</p>}
        {request.createdBy.id !== request.user.id && (
          <p className="mb-1 text-[11px] text-charcoal/40">Logged by {request.createdBy.name}</p>
        )}
        {request.status !== "PENDING" && request.decidedBy && (
          <p className="mb-1 text-[11px] text-charcoal/50">
            {request.status === "CANCELLED"
              ? "Cancelled/withdrawn"
              : `${request.status === "APPROVED" ? "Approved" : "Denied"} by ${request.decidedBy.name}`}
            {request.decisionNote && ` — "${request.decisionNote}"`}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {request.status === "PENDING" && (
            <>
              <button
                disabled={isPending}
                onClick={() => decide("APPROVED")}
                className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm text-sage hover:border-sage/50"
              >
                Approve
              </button>
              <button
                disabled={isPending}
                onClick={() => decide("DENIED")}
                className="focus-ring rounded-lg border border-alert/40 px-3 py-1.5 text-sm text-alert hover:bg-alert/10"
              >
                Deny
              </button>
            </>
          )}
          {(request.status === "APPROVED" || request.status === "DENIED") && (
            <button
              disabled={isPending}
              onClick={cancel}
              className="focus-ring ml-auto rounded-lg border border-alert/40 px-3 py-1.5 text-sm text-alert hover:bg-alert/10"
            >
              Cancel request
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute right-3 top-3 rounded-lg px-2 py-1 text-charcoal/40 hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
