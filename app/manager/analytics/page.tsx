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
