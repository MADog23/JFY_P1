import { notFound } from "next/navigation";
import { getPublicOrderView } from "@/lib/client-view";

// Public page, queried fresh per token — never prerender/cache this at build time.
export const dynamic = "force-dynamic";

const ITEM_LABELS: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Ready for pickup",
  PICKED_UP: "Picked up",
};

const ORDER_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SEALED: "Ready for pickup",
  PICKED_UP: "Fully picked up",
  CANCELLED: "Cancelled",
};

export default async function TrackPage({ params }: { params: { token: string } }) {
  const order = await getPublicOrderView(params.token);
  if (!order) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest text-thread">Mt Juliet, TN</p>
          <h1 className="mt-1 font-display text-2xl text-ink">Just For You Alterations</h1>
          <p className="mt-1 text-sm text-charcoal/60">Order status</p>
        </div>

        <div className="mb-6 rounded-2xl border border-linen bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-charcoal/50">{order.orderNumber}</p>
          <p className="mt-1 font-display text-xl text-ink">{ORDER_LABELS[order.status] ?? order.status}</p>
          {order.dueDate && (
            <p className="mt-1 text-sm text-charcoal/60">
              Promised by {new Date(order.dueDate).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-linen bg-white px-5 py-4"
            >
              <div>
                <p className="text-ink">{item.garmentType}</p>
                {item.description && <p className="text-xs text-charcoal/50">{item.description}</p>}
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-thread">
                  {ITEM_LABELS[item.status] ?? item.status}
                </span>
                {item.pickedUpAt && (
                  <p className="text-xs text-charcoal/40">
                    {new Date(item.pickedUpAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-charcoal/40">
          Questions about your order? Contact Just For You Alterations directly — this page
          doesn't accept messages.
        </p>
      </div>
    </main>
  );
}
