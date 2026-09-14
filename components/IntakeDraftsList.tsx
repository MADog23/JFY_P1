"use client";

/**
 * "Resume a draft" list on the new-intake page — every autosaved, not-yet-submitted
 * ticket (see IntakeDraft in schema.prisma / actions/intake-drafts.ts), visible to any
 * active employee/manager. Resuming is a plain link (?draft=<id> — the page re-fetches
 * that draft server-side and remounts IntakeForm with it, see app/employee/new/page.tsx);
 * discarding needs a client component for the confirm + pending state.
 */

import Link from "next/link";
import { useTransition } from "react";
import { discardIntakeDraft } from "@/actions/intake-drafts";
import type { IntakeDraftSummary } from "@/actions/intake-drafts";

export function IntakeDraftsList({ drafts, activeDraftId }: { drafts: IntakeDraftSummary[]; activeDraftId?: string }) {
  const [isPending, startTransition] = useTransition();

  if (drafts.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-linen bg-cream p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">
        Open drafts ({drafts.length})
      </p>
      <ul className="divide-y divide-linen/60">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              {/* block (not inline) so the tap target is the link's full line rather
                  than just the width of its text — on a phone, the old inline layout put
                  this close enough to the meta text and Discard button that it was hard
                  or impossible to tap accurately. */}
              <Link
                href={`/employee/new?draft=${d.id}`}
                className={`block py-1 font-medium hover:underline ${d.id === activeDraftId ? "text-ink" : "text-thread"}`}
              >
                {d.clientName || "Unnamed draft"}
              </Link>
              <span className="block text-xs text-charcoal/40">
                {d.itemCount} item{d.itemCount === 1 ? "" : "s"}
                {d.isRush ? " · rush" : ""} · started by {d.createdByName}
                {d.updatedByName && d.updatedByName !== d.createdByName ? `, last saved by ${d.updatedByName}` : ""} · {d.updatedAtLabel}
              </span>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!confirm("Discard this draft? This can't be undone.")) return;
                startTransition(async () => {
                  await discardIntakeDraft(d.id);
                  window.location.href = "/employee/new";
                });
              }}
              className="focus-ring self-start rounded px-2 py-1 text-xs text-alert hover:underline disabled:opacity-40 sm:shrink-0"
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
