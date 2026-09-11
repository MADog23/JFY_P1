"use client";

/**
 * Single-day view of time off — the "who's off today" equivalent of the scheduler's
 * daily Gantt, just without an hour axis (a time-off request is a whole day, not a
 * span of hours). Filters the SAME already-filtered `requests` list the other views
 * get (see app/manager/time-off/page.tsx) down to whoever's request covers this one
 * day, and reuses the same TimeOffDetailsPopup as the month view for approve/deny/
 * cancel, so the interaction is identical no matter which view a request was opened
 * from.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toShopDateKey } from "@/lib/dates";
import { TimeOffDetailsPopup, type PopupTimeOffRequest } from "./TimeOffDetailsPopup";

const STATUS_PILL_STYLE: Record<PopupTimeOffRequest["status"], string> = {
  PENDING: "bg-brass/20 text-charcoal/70",
  APPROVED: "bg-sage/15 text-sage",
  DENIED: "bg-alert/10 text-alert",
  CANCELLED: "bg-linen text-charcoal/40",
};

export function TimeOffDayView({ dateKey, requests }: { dateKey: string; requests: PopupTimeOffRequest[] }) {
  const router = useRouter();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const dayRequests = requests
    .filter((r) => toShopDateKey(r.startDate) <= dateKey && dateKey <= toShopDateKey(r.endDate))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const selected = selectedRequestId ? dayRequests.find((r) => r.id === selectedRequestId) ?? null : null;

  return (
    <div className="rounded-2xl border border-linen bg-white p-3">
      {dayRequests.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-charcoal/40">Nobody has time off this day.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {dayRequests.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRequestId(r.id)}
              className="focus-ring flex items-center justify-between gap-2 rounded-xl border border-linen bg-white px-3 py-2 text-left text-sm hover:bg-cream"
            >
              <span className="text-ink">
                {r.user.name}
                <span className="ml-2 text-[11px] text-charcoal/50">{r.type === "PAID" ? "Paid" : "Unpaid"}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL_STYLE[r.status]}`}>
                {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <TimeOffDetailsPopup
          request={selected}
          onClose={() => setSelectedRequestId(null)}
          onChanged={() => {
            setSelectedRequestId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
