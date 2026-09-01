import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders } from "@/actions/orders";
import { TopNav } from "@/components/TopNav";
import { OrderList } from "@/components/OrderList";

export default async function EmployeeDashboard({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const session = await requireSession();
  const filter = (searchParams.filter as any) || "ACTIVE";
  const orders = await listOrders(filter);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-ink">Orders</h1>
            <p className="text-sm text-charcoal/60">Create tickets and work the floor.</p>
          </div>
          <Link
            href="/employee/new"
            className="focus-ring rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-cream"
          >
            + New intake ticket
          </Link>
        </div>

        <div className="mb-4 flex gap-2 text-sm">
          {[
            ["ACTIVE", "In progress"],
            ["SEALED", "Ready for pickup"],
            ["PICKED_UP", "Picked up"],
            ["ALL", "All"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/employee?filter=${value}`}
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

        <OrderList orders={orders as any} basePath="/employee" />
      </main>
    </>
  );
}
