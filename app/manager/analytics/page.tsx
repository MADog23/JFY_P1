import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { getAnalytics } from "@/actions/analytics";
import { formatCents } from "@/lib/money";
import { TopNav } from "@/components/TopNav";

export default async function AnalyticsPage() {
  const session = await requireManager();
  const stats = await getAnalytics();

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">Shop analytics</h1>
        <p className="mb-6 text-sm text-charcoal/60">A quick pulse on where the shop stands right now.</p>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total orders ever" value={stats.totalOrders} />
          <StatCard
            label="Overdue &amp; still in progress"
            value={stats.overdueActiveOrders}
            accent={stats.overdueActiveOrders > 0}
          />
          <StatCard
            label="Avg. turnaround"
            value={stats.avgTurnaroundDays !== null ? `${stats.avgTurnaroundDays} days` : "—"}
          />
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard label="Total revenue (priced orders)" value={formatCents(stats.totalRevenueCents)} />
          <StatCard label="Avg. order value" value={formatCents(stats.avgOrderValueCents)} />
        </div>
        <p className="mb-6 -mt-3 text-xs text-charcoal/40">
          Based on itemized pricing entered on each order. Orders with no pricing entered yet count as $0.
        </p>

        <div className="mb-3">
          <h2 className="font-display text-lg text-ink">Pricing insights</h2>
          <p className="text-xs text-charcoal/50">
            Built from the itemized price lines entered on each ticket — alteration and garment-type
            breakdowns only cover standard pricing, since write-in charges don't have a consistent label
            to group by.
          </p>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <RevenueByLabelCard title="Revenue by alteration" rows={stats.revenueByAlteration} />
          <RevenueByLabelCard title="Revenue by garment type" rows={stats.revenueByGarmentType} showAvg={false} />
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <MoneyBreakdownCard
            title="Revenue composition"
            data={stats.revenueBySource}
            labels={{
              ALTERATION: "Standard alterations",
              CUSTOM_INSTRUCTIONS: "Custom instructions",
              FREEFORM: "Write-in charges",
            }}
          />
          <NeedsPricingCard orders={stats.needsPricing} totalGaps={stats.totalPricingGaps} />
        </div>

        <div className="mb-3">
          <h2 className="font-display text-lg text-ink">Historical performance</h2>
          <p className="text-xs text-charcoal/50">
            Trends and operational metrics built from data the app was already recording on every ticket —
            nothing here needed a new field except the rush flag and the work-started timestamp.
          </p>
        </div>
        <div className="mb-6">
          <TrendCard months={stats.monthlyTrend} />
        </div>
        <div className="mb-2 grid gap-4 sm:grid-cols-3">
          <StatCard label="On-time completion" value={stats.onTime.rate !== null ? `${stats.onTime.rate}%` : "—"} />
          <StatCard
            label="Avg. pickup lag"
            value={stats.avgPickupLagDays !== null ? `${stats.avgPickupLagDays} days` : "—"}
          />
          <StatCard
            label="Reopen rate"
            value={stats.reopenRate.rate !== null ? `${stats.reopenRate.rate}%` : "—"}
            accent={!!stats.reopenRate.rate && stats.reopenRate.rate > 15}
          />
          <StatCard
            label="Avg. days to full payment"
            value={stats.avgDaysToFullPayment !== null ? `${stats.avgDaysToFullPayment} days` : "—"}
          />
          <StatCard label="Rush orders" value={stats.rushShare.rate !== null ? `${stats.rushShare.rate}%` : "—"} />
          <StatCard
            label="Avg. time to start work"
            value={stats.avgDaysToStart !== null ? `${stats.avgDaysToStart} days` : "—"}
          />
        </div>
        <p className="mb-6 text-xs text-charcoal/40">
          On-time completion: {stats.onTime.onTimeCount}/{stats.onTime.total} due-dated orders sealed by their
          due date. Reopen rate: {stats.reopenRate.reopenedCount}/{stats.reopenRate.total} once-completed items
          sent back for more work. Rush orders: {stats.rushShare.rushCount}/{stats.rushShare.total} orders
          flagged rush.
        </p>

        <div className="mb-6">
          <TeamActivityCard rows={stats.teamActivity} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <BreakdownCard
            title="Orders by status"
            data={stats.orderStatusCounts}
            labels={{ IN_PROGRESS: "In progress", SEALED: "Ready for pickup", PICKED_UP: "Fully picked up" }}
          />
          <BreakdownCard
            title="Items by status"
            data={stats.itemStatusCounts}
            labels={{
              PENDING: "Not started",
              IN_PROGRESS: "In progress",
              COMPLETED: "Completed",
              PICKED_UP: "Picked up",
            }}
          />
          <BreakdownCard
            title="Orders by payment status"
            data={stats.paymentCounts}
            labels={{ UNPAID: "Unpaid", DEPOSIT_PAID: "Deposit paid", PAID: "Paid" }}
          />
        </div>
      </main>
    </>
  );
}

function RevenueByLabelCard({
  title,
  rows,
  showAvg = true,
}: {
  title: string;
  rows: { label: string; totalCents: number; count: number; avgCents?: number }[];
  showAvg?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-3 text-sm font-medium text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-charcoal/40">No pricing entered yet.</p>
      ) : (
        <div className="divide-y divide-linen">
          {rows.slice(0, 8).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="text-ink">{row.label}</p>
                <p className="text-[11px] text-charcoal/40">
                  {row.count}× charged{showAvg && row.avgCents !== undefined ? ` · avg ${formatCents(row.avgCents)}` : ""}
                </p>
              </div>
              <span className="font-display text-base text-ink">{formatCents(row.totalCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoneyBreakdownCard({
  title,
  data,
  labels,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-3 text-sm font-medium text-ink">{title}</p>
      <div className="space-y-2">
        {Object.entries(labels).map(([key, label]) => {
          const cents = data[key] || 0;
          const pct = Math.round((cents / total) * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs text-charcoal/60">
                <span>{label}</span>
                <span>{formatCents(cents)}</span>
              </div>
              <div className="h-2 rounded-full bg-linen">
                <div className="h-2 rounded-full bg-thread" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NeedsPricingCard({
  orders,
  totalGaps,
}: {
  orders: { id: string; orderNumber: string; clientName: string; gaps: number }[];
  totalGaps: number;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Unpriced alterations</p>
        <span className={`font-display text-2xl ${totalGaps > 0 ? "text-alert" : "text-ink"}`}>{totalGaps}</span>
      </div>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Checked alterations on open tickets with no price entered yet.
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-charcoal/40">Every open ticket is fully priced.</p>
      ) : (
        <ul className="space-y-1.5">
          {orders.slice(0, 6).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3">
              <Link href={`/manager/orders/${o.id}`} className="text-sm text-thread hover:underline">
                {o.orderNumber} — {o.clientName}
              </Link>
              <span className="whitespace-nowrap text-xs text-charcoal/50">
                {o.gaps} unpriced
              </span>
            </li>
          ))}
          {orders.length > 6 && <li className="text-xs text-charcoal/40">+{orders.length - 6} more orders</li>}
        </ul>
      )}
    </div>
  );
}

function TrendCard({
  months,
}: {
  months: { month: string; label: string; revenueCents: number; orderCount: number; avgTurnaroundDays: number | null }[];
}) {
  const maxRevenue = Math.max(1, ...months.map((m) => m.revenueCents));
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-1 text-sm font-medium text-ink">Revenue, volume &amp; turnaround by month</p>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Revenue and order count are grouped by when the ticket was created; turnaround is grouped by when the
        order was sealed (finished) — the two dates aren't always the same month for a given order.
      </p>
      <div className="space-y-3">
        {months.map((m) => (
          <div key={m.month}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-charcoal/60">
              <span className="font-medium text-ink">{m.label}</span>
              <span>
                {formatCents(m.revenueCents)} · {m.orderCount} order{m.orderCount === 1 ? "" : "s"}
                {m.avgTurnaroundDays !== null ? ` · ${m.avgTurnaroundDays}d avg turnaround` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-linen">
              <div
                className="h-2 rounded-full bg-thread"
                style={{ width: `${Math.round((m.revenueCents / maxRevenue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamActivityCard({
  rows,
}: {
  rows: {
    userId: string;
    name: string;
    role: string | null;
    ticketsCreated: number;
    itemsCompleted: number;
    pickupsAuthorized: number;
    itemsAssigned: number;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-1 text-sm font-medium text-ink">Team activity</p>
      <p className="mb-3 text-[11px] text-charcoal/40">
        Current-state snapshot, not full history — e.g. "items completed" credits whoever most recently
        completed an item, not necessarily who completed it first if it was later reopened. "Currently
        assigned" is how many items each person has claimed or been assigned right now.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-charcoal/40">No activity recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-charcoal/50">
                <th className="py-1.5 pr-3">Staff</th>
                <th className="py-1.5 pr-3">Tickets created</th>
                <th className="py-1.5 pr-3">Items completed</th>
                <th className="py-1.5 pr-3">Pickups authorized</th>
                <th className="py-1.5">Currently assigned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t border-linen">
                  <td className="py-1.5 pr-3 text-ink">{r.name}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.ticketsCreated}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.itemsCompleted}</td>
                  <td className="py-1.5 pr-3 text-charcoal/70">{r.pickupsAuthorized}</td>
                  <td className="py-1.5 text-charcoal/70">{r.itemsAssigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-charcoal/50">{label}</p>
      <p className={`mt-1 font-display text-3xl ${accent ? "text-alert" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  data,
  labels,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="mb-3 text-sm font-medium text-ink">{title}</p>
      <div className="space-y-2">
        {Object.entries(labels).map(([key, label]) => {
          const count = data[key] || 0;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs text-charcoal/60">
                <span>{label}</span>
                <span>{count}</span>
              </div>
              <div className="h-2 rounded-full bg-linen">
                <div className="h-2 rounded-full bg-thread" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
