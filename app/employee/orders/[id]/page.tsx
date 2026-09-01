import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getOrderDetail } from "@/actions/orders";
import { listTaxonomy } from "@/actions/taxonomy";
import { getBaseUrl } from "@/lib/url";
import { TopNav } from "@/components/TopNav";
import OrderProfile from "@/components/OrderProfile";

export default async function EmployeeOrderPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const [order, { garmentTypes, alterationTypes }] = await Promise.all([
    getOrderDetail(params.id),
    listTaxonomy(),
  ]);
  if (!order) notFound();

  const trackingUrl = `${getBaseUrl()}/track/${order.clientToken}`;

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <OrderProfile
          order={JSON.parse(JSON.stringify(order))}
          role="EMPLOYEE"
          garmentTypes={garmentTypes.map((g) => g.label)}
          alterationTypes={alterationTypes.map((a) => a.label)}
          trackingUrl={trackingUrl}
          currentUserId={session.userId}
        />
      </main>
    </>
  );
}
