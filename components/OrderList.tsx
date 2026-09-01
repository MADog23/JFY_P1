import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

type OrderRow = {
  id: string;
  orderNumber: string;
  clientName: string;
  status: string;
  dueDate: Date | null;
  items: { status: string }[];
};

export function OrderList({ orders, basePath }: { orders: OrderRow[]; basePath: string }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linen bg-white p-10 text-center text-sm text-charcoal/50">
        No orders here yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-linen bg-white">
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
          {orders.map((order) => {
            const done = order.items.filter((i) => i.status === "COMPLETED" || i.status === "PICKED_UP").length;
            return (
              <tr key={order.id} className="border-b border-linen last:border-0 hover:bg-cream">
                <td className="px-4 py-3">
                  <Link href={`${basePath}/orders/${order.id}`} className="font-medium text-thread hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">{order.clientName}</td>
                <td className="px-4 py-3 text-charcoal/60">
                  {done}/{order.items.length} done
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} kind="order" />
                </td>
                <td className="px-4 py-3 text-charcoal/60">
                  {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
