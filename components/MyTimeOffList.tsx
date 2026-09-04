"use client";

/** Employee-facing list of their own time-off requests, with a Cancel button while
 * still PENDING (see cancelMyTimeOffRequest — refuses once a manager has decided it). */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyTimeOffRequest, type TimeOffStatus, type TimeOffType } from "@/actions/time-off";
import { formatShopDateTime } from "@/lib/dates";

export type MyTimeOffRow = {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  type: TimeOffType;
  reason: string | null;
  status: TimeOffStatus;
  decisionNote: string | null;
  decidedBy: { name: string } | null;
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

function Row({ request }: { request: MyTimeOffRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-b border-linen/60 px-4 py-3 text-sm last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-ink">
            {fmt(request.startDate)} – {fmt(request.endDate)}
          </span>
          <span className="ml-2 text-[11px] text-charcoal/50">{request.type === "PAID" ? "Paid" : "Unpaid"}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[request.status]}`}>
            {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
          </span>
        </div>
        {(request.status === "PENDING" || request.status === "APPROVED") && (
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await cancelMyTimeOffRequest(request.id);
                if (r.ok) router.refresh();
                else setError(r.error);
              })
            }
            className="focus-ring rounded-lg border border-linen px-3 py-1 text-xs text-charcoal/60 hover:border-alert/40 hover:text-alert"
          >
            {request.status === "APPROVED" ? "Withdraw (already approved)" : "Withdraw"}
          </button>
        )}
      </div>
      {request.reason && <p className="mt-1 text-[11px] text-charcoal/50">You wrote: {request.reason}</p>}
      {request.status !== "PENDING" && request.decidedBy && (
        <p className="mt-1 text-[11px] text-charcoal/50">
          {request.status === "CANCELLED" ? "Withdrawn" : `${request.status === "APPROVED" ? "Approved" : "Denied"} by ${request.decidedBy.name}`}
          {request.decisionNote && ` — "${request.decisionNote}"`}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-alert">{error}</p>}
    </div>
  );
}

export function MyTimeOffList({ requests }: { requests: MyTimeOffRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-linen bg-white">
      {requests.length === 0 ? (
        <p className="px-4 py-4 text-sm text-charcoal/60">You haven't requested any time off yet.</p>
      ) : (
        requests.map((r) => <Row key={r.id} request={r} />)
      )}
    </div>
  );
}
