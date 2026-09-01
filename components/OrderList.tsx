import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

type OrderRow = {
  id: string;
  orderNumber: string;
  clientName: string;
  status: string;
  dueDate: Date | null;
  isRush?: boolean;
  items: { status: string }[];
};

function RushBadge() {
  return (
    <span className="rounded-full border border-alert/40 bg-alert/10 px-2 py-0.5 text-[11px] font-medium text-alert">
      Rush
    </span>
  );
}

export function OrderList({
  orders,
  basePath,
  emptyMessage = "No orders here yet.",
}: {
  orders: OrderRow[];
  basePath: string;
  emptyMessage?: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linen bg-white p-10 text-center text-sm text-charcoal/50">
        {emptyMessage}
      </div>
    );
  }

  const rows = orders.map((order) => ({
    ...order,
    done: order.items.filter((i) => i.status === "COMPLETED" || i.status === "PICKED_UP").length,
  }));

  return (
    <>
      {/* Mobile: stacked cards — a side-scrolling table is a bad fit on a phone */}
      <div className="space-y-3 md:hidden">
        {rows.map((order) => (
          <Link
            key={order.id}
            href={`${basePath}/orders/${order.id}`}
            className="focus-ring block rounded-2xl border border-linen bg-white p-4"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-thread">
                {order.orderNumber}
                {order.isRush && <RushBadge />}
              </span>
              <StatusBadge status={order.status} kind="order" />
            </div>
            <p className="mb-2 text-ink">{order.clientName}</p>
            <div className="flex items-center justify-between text-xs text-charcoal/60">
              <span>
                {order.done}/{order.items.length} items done
              </span>
              <span>{order.dueDate ? `Due ${new Date(order.dueDate).toLocaleDateString()}` : "No due date"}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop / tablet: full table */}
      <div className="hidden overflow-hidden rounded-2xl border border-linen bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linen bg-linen/40 text-left text-xs uppercase tracking-wide text-charcoal/50">
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} className="border-b border-linen last:border-0 hover:bg-cream">
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/orders/${order.id}`}
                    className="flex items-center gap-1.5 font-medium text-thread hover:underline"
                  >
                    {order.orderNumber}
                    {order.isRush && <RushBadge />}
                  </Link>
                </td>
                <td className="px-4 py-3">{order.clientName}</td>
                <td className="px-4 py-3 text-charcoal/60">
                  {order.done}/{order.items.length} done
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} kind="order" />
                </td>
                <td className="px-4 py-3 text-charcoal/60">
                  {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
