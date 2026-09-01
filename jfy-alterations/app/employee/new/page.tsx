import { requireSession } from "@/lib/auth";
import { listTaxonomy } from "@/actions/taxonomy";
import { TopNav } from "@/components/TopNav";
import IntakeForm from "@/components/IntakeForm";

export default async function NewIntakePage() {
  const session = await requireSession();
  const { garmentTypes, alterationTypes } = await listTaxonomy();

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">New intake ticket</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Capture the client, pickup contact, and every item in this order.
        </p>
        <IntakeForm
          garmentTypes={garmentTypes.map((g) => g.label)}
          alterationTypes={alterationTypes.map((a) => a.label)}
        />
      </main>
    </>
  );
}
