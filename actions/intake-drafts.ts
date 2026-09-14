"use server";

/**
 * Autosaved intake drafts — see prisma/schema.prisma's IntakeDraft model comment for why
 * this is its own lightweight table instead of an Order in a "DRAFT" status. A draft is
 * visible to and resumable by any active employee/manager (not just whoever started it),
 * and only ever becomes a real order through createIntakeTicket's own, fully-validated
 * path in actions/orders.ts — which also deletes the draft, in the same transaction,
 * once the order is created.
 */

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { formatShopDateTime } from "@/lib/dates";

export type IntakeDraftSummary = {
  id: string;
  clientName: string;
  itemCount: number;
  isRush: boolean;
  createdByName: string;
  updatedByName: string | null;
  updatedAtLabel: string;
};

/** Only the handful of fields the drafts list needs to summarize a draft — formState
 * itself is stored schema-free (see IntakeDraft's comment), so this is read loosely and
 * defensively rather than assumed to match components/IntakeForm.tsx's state exactly. */
type DraftFormStateSummary = {
  clientName?: unknown;
  isRush?: unknown;
  items?: { garmentType?: unknown; description?: unknown }[];
};

/** EMPLOYEE OR MANAGER: every open intake draft, most recently saved first — the
 * "resume a draft" list on the new-intake page. Deliberately visible to all active
 * staff, not just whoever started it, so a draft isn't stranded if that person stepped
 * away, went home, or the "something weird" that happened was them losing access. */
export async function listIntakeDrafts(): Promise<IntakeDraftSummary[]> {
  await requireSession();

  const drafts = await db.intakeDraft.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      formState: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
  });

  return drafts.map((d) => {
    const state = (d.formState ?? {}) as DraftFormStateSummary;
    const items = Array.isArray(state.items) ? state.items : [];
    return {
      id: d.id,
      clientName: typeof state.clientName === "string" ? state.clientName.trim() : "",
      itemCount: items.filter((it) => (typeof it?.garmentType === "string" && it.garmentType) || (typeof it?.description === "string" && it.description.trim())).length,
      isRush: state.isRush === true,
      createdByName: d.createdBy.name,
      updatedByName: d.updatedBy?.name ?? null,
      updatedAtLabel: formatShopDateTime(d.updatedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    };
  });
}

/** EMPLOYEE OR MANAGER: the full saved state for one draft, to resume it. Returns null
 * if it's gone (already submitted or discarded, possibly by someone else) rather than
 * throwing, so the resume page can fall back to a blank form instead of erroring out. */
export async function getIntakeDraft(id: string): Promise<{ id: string; formState: unknown } | null> {
  await requireSession();
  return db.intakeDraft.findUnique({ where: { id }, select: { id: true, formState: true } });
}

/** EMPLOYEE OR MANAGER: autosave, called every few seconds from IntakeForm while
 * there's meaningful content. Creates the draft row on the first save (returning its
 * new id for the caller to remember) and updates it on every save after. `formState` is
 * stored as-is — see IntakeDraft.formState's schema comment on why nothing here
 * validates its shape beyond "an object": a malformed draft can only ever break loading
 * that one draft back into the form, never create bad pricing/order data, since
 * createIntakeTicket's own Zod schema is the only path that can do that. */
export async function saveIntakeDraft(
  id: string | null,
  formState: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireSession();
  if (typeof formState !== "object" || formState === null) {
    return { ok: false, error: "Invalid draft." };
  }

  if (id) {
    const updated = await db.intakeDraft.updateMany({
      where: { id },
      data: { formState: formState as object, updatedById: session.userId },
    });
    if (updated.count > 0) return { ok: true, id };
    // Fell through: the draft was discarded (by this person or someone else) since the
    // last successful save. Start a fresh one instead of failing on someone mid-form.
  }

  const created = await db.intakeDraft.create({
    data: { formState: formState as object, createdById: session.userId, updatedById: session.userId },
  });
  return { ok: true, id: created.id };
}

/** EMPLOYEE OR MANAGER: discards an open draft — used by the explicit "Discard" button
 * in the drafts list. (createIntakeTicket deletes a draft its own way, inline in its own
 * transaction, once it successfully becomes a real order — see actions/orders.ts.)
 * Idempotent: discarding an already-gone draft is not an error. */
export async function discardIntakeDraft(id: string): Promise<{ ok: true }> {
  await requireSession();
  await db.intakeDraft.deleteMany({ where: { id } });
  return { ok: true };
}
