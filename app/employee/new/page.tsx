import { requireSession } from "@/lib/auth";
import { listTaxonomy } from "@/actions/taxonomy";
import { listIntakeDrafts, getIntakeDraft } from "@/actions/intake-drafts";
import { TopNav } from "@/components/TopNav";
import IntakeForm from "@/components/IntakeForm";
import { IntakeDraftsList } from "@/components/IntakeDraftsList";

export default async function NewIntakePage({ searchParams }: { searchParams: { draft?: string } }) {
  const session = await requireSession();
  const [{ garmentTypes, alterationTypes }, drafts] = await Promise.all([listTaxonomy(), listIntakeDrafts()]);

  const draft = searchParams.draft ? await getIntakeDraft(searchParams.draft) : null;

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">New intake ticket</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Capture the client, pickup contact, and every item in this order. This is autosaved as you go —
          if you get interrupted, it'll be waiting in "Open drafts" below.
        </p>
        <IntakeDraftsList drafts={drafts} activeDraftId={draft?.id} />
        {/* key forces a fresh mount (and so fresh initial state) whenever which draft is
            loaded changes — switching from a blank form to a draft, or between two
            different drafts, via the ?draft= link above. */}
        <IntakeForm
          key={draft?.id ?? "new"}
          garmentTypes={garmentTypes.map((g) => g.label)}
          alterationTypes={alterationTypes.map((a) => a.label)}
          initialDraft={draft}
        />
      </main>
    </>
  );
}
