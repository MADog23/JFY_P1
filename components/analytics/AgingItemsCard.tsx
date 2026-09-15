/**
 * "What's finished and just sitting here" — items that reached COMPLETED but haven't
 * been picked up yet. avgPickupLagDays (in the main stat grid) gives the average; this
 * is the actionable version, a named list, same convention as NeedsPricingCard. Backed
 * by actions/analytics.ts's getAgingItems (a right-now snapshot, not date-ranged — see
 * that function's header comment).
 */
import Link from "next/link";
import type { AgingOrder } from "@/actions/analytics";

/** Orders with an item waiting this long or longer get the alert color instead of the
 * ordinary muted one — a garment finished a week+ ago and never picked up is worth a
 * manager's attention, not just a passive count. */
const FLAG_THRESHOLD_DAYS = 7;

export function AgingItemsCard({ orders }: { orders: AgingOrder[] }) {
  const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
  const flaggedCount = orders.filter((o) => o.maxDaysWaiting >= FLAG_THRESHOLD_DAYS).length;

  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Finished, not yet picked up</p>
        <span className={`font-display text-2xl ${flaggedCount > 0 ? "text-alert" : "text-ink"}`}>{totalItems}</span>
      </div>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Completed items waiting on pickup, longest-waiting first
        {flaggedCount > 0 ? ` — ${flaggedCount} order${flaggedCount === 1 ? "" : "s"} finished ${FLAG_THRESHOLD_DAYS}+ days ago.` : "."}
      </p>

      {orders.length === 0 ? (
        <p className="text-sm text-charcoal/40">Nothing finished is waiting on pickup right now.</p>
      ) : (
        <ul className="space-y-2.5">
          {orders.slice(0, 6).map((o) => {
            const flagged = o.maxDaysWaiting >= FLAG_THRESHOLD_DAYS;
            return (
              <li key={o.id}>
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/manager/orders/${o.id}`} className="text-sm text-thread hover:underline">
                    {o.orderNumber} — {o.clientName}
                  </Link>
                  <span className={`whitespace-nowrap text-xs ${flagged ? "text-alert" : "text-charcoal/50"}`}>
                    {o.maxDaysWaiting}d waiting
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-charcoal/50">
                  {o.items.map((item) => `${item.garmentType} (${item.daysWaiting}d)`).join(" · ")}
                </p>
              </li>
            );
          })}
          {orders.length > 6 && <li className="text-xs text-charcoal/40">+{orders.length - 6} more orders</li>}
        </ul>
      )}
    </div>
  );
}
