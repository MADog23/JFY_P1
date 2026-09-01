import { requireManager } from "@/lib/auth";
import { listAllTaxonomy } from "@/actions/taxonomy";
import { TopNav } from "@/components/TopNav";
import TaxonomyManager from "@/components/TaxonomyManager";

export default async function TaxonomyPage() {
  const session = await requireManager();
  const { garmentTypes, alterationTypes } = await listAllTaxonomy();

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">Garment &amp; alteration options</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          These populate the dropdowns on the intake form. Turning one off hides it from new
          tickets without touching past orders.
        </p>
        <TaxonomyManager garmentTypes={garmentTypes} alterationTypes={alterationTypes} />
      </main>
    </>
  );
}
