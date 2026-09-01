import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { listOrders } from "@/actions/orders";
import { TopNav } from "@/components/TopNav";
import { OrderList } from "@/components/OrderList";
import { OrderSearchBar } from "@/components/OrderSearchBar";

export default async function ManagerDashboard({
  searchParams,
}: {
  searchParams: { filter?: string; search?: string; from?: string; to?: string };
}) {
  const session = await requireManager();
  const filter = (searchParams.filter as any) || "ACTIVE";
  const { search, from, to } = searchParams;
  const orders = await listOrders({ filter, search, from, to });
  const hasSearch = !!(search || from || to);

  function tabHref(value: string) {
    const params = new URLSearchParams();
    params.set("filter", value);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/manager?${params.toString()}`;
  }

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-ink">All orders</h1>
            <p className="text-sm text-charcoal/60">Full access to every intake and working profile.</p>
          </div>
          <Link
            href="/employee/new"
            className="focus-ring rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-cream"
          >
            + New intake ticket
          </Link>
        </div>

        <OrderSearchBar />

        <div className="mb-4 flex gap-2 text-sm">
          {[
            ["ACTIVE", "In progress"],
            ["SEALED", "Ready for pickup"],
            ["PICKED_UP", "Picked up"],
            ["ALL", "All"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={tabHref(value)}
              className={`rounded-full border px-3 py-1.5 ${
                filter === value
                  ? "border-thread bg-thread text-cream"
                  : "border-linen bg-white text-charcoal/60 hover:border-thread/50"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <OrderList
          orders={orders as any}
          basePath="/manager"
          emptyMessage={hasSearch ? "No orders match your search." : "No orders here yet."}
        />
      </main>
    </>
  );
}
