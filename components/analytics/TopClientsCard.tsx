/**
 * "Do people come back, and who are our best clients" — a blind spot the analytics
 * pages didn't cover before: everything else tracks garments and staff, nothing tracked
 * the client relationship over time. Backed by actions/analytics.ts's getClientAnalytics
 * (clientPhone is the dedup key — see that function's header comment for the caveat on
 * phone formatting).
 */
import { formatCents } from "@/lib/money";
import type { TopClient } from "@/actions/analytics";

export function TopClientsCard({
  repeatClientRatePct,
  repeatClients,
  totalClients,
  topClients,
}: {
  repeatClientRatePct: number | null;
  repeatClients: number;
  totalClients: number;
  topClients: TopClient[];
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Client relationships</p>
        <span className="font-display text-2xl text-ink">{repeatClientRatePct !== null ? `${repeatClientRatePct}%` : "—"}</span>
      </div>
      <p className="mb-3 text-[11px] text-charcoal/40">
        {totalClients > 0
          ? `${repeatClients}/${totalClients} clients (all-time) have placed more than one order.`
          : "No clients yet."}
      </p>

      {topClients.length === 0 ? (
        <p className="text-sm text-charcoal/40">No priced orders yet.</p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-charcoal/40">
            Top clients by lifetime spend
          </p>
          <ul className="divide-y divide-linen">
            {topClients.map((c) => (
              <li key={c.clientPhone} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink">{c.clientName}</p>
                  <p className="text-[11px] text-charcoal/40">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="whitespace-nowrap font-display text-base text-ink">{formatCents(c.totalSpentCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
