"use client";

/**
 * Month-grid calendar for time-off requests — same visual language as the manager
 * scheduler (rounded white day cards, colored pill chips, click-for-details popup) but
 * laid out as a real Monday-start month grid rather than a stacked day list, since a
 * time-off request is a run of whole days rather than an hour-level shift. Sits
 * alongside TimeOffReviewList as an alternate view of the SAME filtered `requests` (see
 * app/manager/time-off/page.tsx) — TimeOffFilters' status/date-range controls apply
 * here exactly as they do to the list view; this component only decides how to lay out
 * whatever it's handed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { listShopDateKeysInRange, toShopDateKey } from "@/lib/dates";
import { TimeOffDetailsPopup, type PopupTimeOffRequest } from "./TimeOffDetailsPopup";

const STATUS_CHIP_STYLE: Record<PopupTimeOffRequest["status"], string> = {
  PENDING: "border border-dashed border-thread bg-brass/15 text-thread",
  APPROVED: "bg-sage/70 text-cream",
  DENIED: "bg-alert/15 text-alert line-through",
  CANCELLED: "bg-linen text-charcoal/40 line-through",
};

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayOfMonth(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

export function TimeOffCalendarView({
  monthKey,
  dateKeys,
  requests,
}: {
  /** "YYYY-MM" of the month actually being viewed — days in `dateKeys` outside this
   * month (the lead/trail days that round the grid out to full weeks) render dimmed. */
  monthKey: string;
  /** Every day in the grid, Monday-start weeks, from before the 1st through after the
   * last day of `monthKey` as needed to fill whole weeks. */
  dateKeys: string[];
  requests: PopupTimeOffRequest[];
}) {
  const router = useRouter();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const byDay = new Map<string, PopupTimeOffRequest[]>();
  for (const r of requests) {
    for (const key of listShopDateKeysInRange(r.startDate, r.endDate)) {
      (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(r);
    }
  }

  const selected = selectedRequestId ? requests.find((r) => r.id === selectedRequestId) ?? null : null;
  const todayKey = toShopDateKey(new Date());

  return (
    <div className="rounded-2xl border border-linen bg-white p-3">
      {/* grid-template-columns/gap set inline rather than via grid-cols-7/gap-1.5 utility
          classes — those exact (unprefixed) combinations don't appear anywhere else in
          this codebase yet, and depending on Tailwind's JIT to have already picked up a
          brand-new utility string on a first render is exactly the kind of thing that
          quietly fails to compile in a dev server that hasn't been restarted since the
          file was added. Inline style has no such dependency. */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="px-1 text-center text-[11px] font-medium uppercase tracking-wide text-charcoal/40">
            {label}
          </div>
        ))}
        {dateKeys.map((dateKey) => {
          const inMonth = dateKey.slice(0, 7) === monthKey;
          const dayRequests = byDay.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          // A thicker border rather than a ring for "today" — border-2/border-thread is
          // already used elsewhere (DailyGanttView's draft-bar styling); the ring-*
          // utilities aren't used anywhere else yet, and this avoids leaning on a
          // never-before-compiled class the same way the grid layout above just was.
          const cellBorder = isToday ? "border-2 border-thread" : inMonth ? "border border-linen" : "border border-linen/50";
          const cellBg = inMonth ? "bg-white" : "bg-cream/40";
          return (
            <div key={dateKey} className={`min-h-[90px] rounded-lg p-1.5 ${cellBorder} ${cellBg}`}>
              <p className={`mb-1 text-xs ${inMonth ? "text-charcoal/60" : "text-charcoal/30"}`}>{dayOfMonth(dateKey)}</p>
              <div className="flex flex-col gap-1">
                {dayRequests.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRequestId(r.id)}
                    title={`${r.user.name} — ${r.type === "PAID" ? "Paid" : "Unpaid"}`}
                    className={`focus-ring truncate rounded-full px-1.5 py-0.5 text-left text-[10px] font-medium ${STATUS_CHIP_STYLE[r.status]}`}
                  >
                    {r.user.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
