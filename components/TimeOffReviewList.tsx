"use client";

/**
 * Manager-facing time-off review: approve/deny pending requests, see the full history,
 * and log a request on an employee's behalf (e.g. a phone-call ask) — auto-approved
 * since the manager IS the decision-maker in that act (see createTimeOffOnBehalf).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideTimeOffRequest, cancelTimeOffRequest, createTimeOffOnBehalf, type TimeOffStatus, type TimeOffType } from "@/actions/time-off";
import { formatShopDateTime } from "@/lib/dates";

type Employee = { id: string; name: string };
type RequestRow = {
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

function LogOnBehalfForm({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TimeOffType>("PAID");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  return (
    <div className="rounded-xl border border-linen bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-ink">Log time off for an employee</h3>
      <p className="mb-3 text-[11px] text-charcoal/50">
        For a request that came in by phone or in person — this is recorded as already approved by you.
      </p>
      {error && <p className="mb-2 text-[11px] text-alert">{error}</p>}
      {added && <p className="mb-2 text-[11px] text-sage">Logged and approved.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Employee
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-charcoal/60">
          End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm" />
        </label>
        <div className="flex gap-1 rounded-full border border-linen bg-cream p-1 text-sm">
          <button type="button" onClick={() => setType("PAID")} className={`rounded-full px-3 py-1 ${type === "PAID" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}>
            Paid
          </button>
          <button type="button" onClick={() => setType("UNPAID")} className={`rounded-full px-3 py-1 ${type === "UNPAID" ? "bg-thread text-cream" : "text-charcoal/60 hover:text-ink"}`}>
            Unpaid
          </button>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Note (optional)"
          className="focus-ring min-w-[12rem] flex-1 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
        />
        <button
          disabled={isPending || !userId || !startDate || !endDate}
          onClick={() =>
            startTransition(async () => {
              setAdded(false);
              setError(null);
              const r = await createTimeOffOnBehalf(userId, { startDate, endDate, type, reason: reason || undefined });
              if (r.ok) {
                setAdded(true);
                setStartDate("");
                setEndDate("");
                setReason("");
                router.refresh();
              } else setError(r.error);
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-1.5 text-xs text-cream disabled:opacity-40"
        >
          Log & approve
        </button>
      </div>
    </div>
  );
}

function RequestRowItem({ request }: { request: RequestRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "APPROVED" | "DENIED") {
    const note = prompt(`Note for this ${decision === "APPROVED" ? "approval" : "denial"} (optional):`) ?? undefined;
    startTransition(async () => {
      setError(null);
      const r = await decideTimeOffRequest(request.id, decision, note);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  function cancel() {
    const note = prompt(`Reason for cancelling this ${request.status.toLowerCase()} request (optional):`) ?? undefined;
    startTransition(async () => {
      setError(null);
      const r = await cancelTimeOffRequest(request.id, note);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="border-b border-linen/60 px-4 py-3 text-sm last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-ink">{request.user.name}</span>
          <span className="ml-2 text-charcoal/70">
            {fmt(request.startDate)} – {fmt(request.endDate)}
          </span>
          <span className="ml-2 text-[11px] text-charcoal/50">{request.type === "PAID" ? "Paid" : "Unpaid"}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[request.status]}`}>
            {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
          </span>
          {request.createdBy.id !== request.user.id && (
            <span className="ml-2 text-[11px] text-charcoal/40">logged by {request.createdBy.name}</span>
          )}
        </div>
        {request.status === "PENDING" && (
          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-alert">{error}</span>}
            <button
              disabled={isPending}
              onClick={() => decide("APPROVED")}
              className="focus-ring rounded-lg border border-linen bg-white px-3 py-1 text-xs text-sage hover:border-sage/50"
            >
              Approve
            </button>
            <button
              disabled={isPending}
              onClick={() => decide("DENIED")}
              className="focus-ring rounded-lg border border-alert/40 px-3 py-1 text-xs text-alert hover:bg-alert/10"
            >
              Deny
            </button>
          </div>
        )}
        {(request.status === "APPROVED" || request.status === "DENIED") && (
          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-alert">{error}</span>}
            <button
              disabled={isPending}
              onClick={cancel}
              className="focus-ring rounded-lg border border-alert/40 px-3 py-1 text-xs text-alert hover:bg-alert/10"
            >
              Cancel request
            </button>
          </div>
        )}
      </div>
      {request.reason && <p className="mt-1 text-[11px] text-charcoal/50">Reason: {request.reason}</p>}
      {request.status !== "PENDING" && request.decidedBy && (
        <p className="mt-1 text-[11px] text-charcoal/50">
          {request.status === "CANCELLED" ? "Cancelled/withdrawn" : `${request.status === "APPROVED" ? "Approved" : "Denied"} by ${request.decidedBy.name}`}
          {request.decisionNote && ` — "${request.decisionNote}"`}
        </p>
      )}
    </div>
  );
}

export function TimeOffReviewList({ employees, requests }: { employees: Employee[]; requests: RequestRow[] }) {
  return (
    <div className="space-y-4">
      <LogOnBehalfForm employees={employees} />
      <div className="overflow-hidden rounded-xl border border-linen bg-white">
        {requests.length === 0 ? (
          <p className="px-4 py-4 text-sm text-charcoal/60">No requests match this filter.</p>
        ) : (
          requests.map((r) => <RequestRowItem key={r.id} request={r} />)
        )}
      </div>
    </div>
  );
}
