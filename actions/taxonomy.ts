"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./auth";

/** Any signed-in user needs these to fill out the intake form. */
export async function listTaxonomy() {
  await requireSession();
  const [garmentTypes, alterationTypes] = await Promise.all([
    db.garmentTypeOption.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.alterationTypeOption.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { garmentTypes, alterationTypes };
}

export async function listAllTaxonomy() {
  await requireManager();
  const [garmentTypes, alterationTypes] = await Promise.all([
    db.garmentTypeOption.findMany({ orderBy: { sortOrder: "asc" } }),
    db.alterationTypeOption.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return { garmentTypes, alterationTypes };
}

export async function addGarmentType(label: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!label.trim()) return { ok: false, error: "Label required." };
  const count = await db.garmentTypeOption.count();
  await db.$transaction(async (tx) => {
    await tx.garmentTypeOption.create({ data: { label: label.trim(), sortOrder: count } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: label.trim(),
        action: "GARMENT_TYPE_ADDED",
        summary: `Garment type "${label.trim()}" added by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function addAlterationType(label: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!label.trim()) return { ok: false, error: "Label required." };
  const count = await db.alterationTypeOption.count();
  await db.$transaction(async (tx) => {
    await tx.alterationTypeOption.create({ data: { label: label.trim(), sortOrder: count } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: label.trim(),
        action: "ALTERATION_TYPE_ADDED",
        summary: `Alteration type "${label.trim()}" added by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

/** MANAGER ONLY: fixes a typo in an existing garment type label — previously the only
 * recourse was deactivating the misspelled one and adding a fresh, correctly-spelled
 * option, leaving the typo sitting in the list forever. Existing items keep whatever
 * garmentType string they were created with either way (it's copied at intake time, not
 * a live reference to this row), so a rename here only affects future intake pickers. */
export async function renameGarmentType(id: string, label: string): Promise<ActionResult> {
  const session = await requireManager();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label required." };

  const existing = await db.garmentTypeOption.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Garment type not found." };
  if (trimmed === existing.label) return { ok: true };

  const conflict = await db.garmentTypeOption.findUnique({ where: { label: trimmed } });
  if (conflict) return { ok: false, error: "A garment type with that label already exists." };

  await db.$transaction(async (tx) => {
    await tx.garmentTypeOption.update({ where: { id }, data: { label: trimmed } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: id,
        action: "GARMENT_TYPE_RENAMED",
        summary: `Garment type "${existing.label}" renamed to "${trimmed}" by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

/** MANAGER ONLY: same as renameGarmentType, for the alteration type list. */
export async function renameAlterationType(id: string, label: string): Promise<ActionResult> {
  const session = await requireManager();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label required." };

  const existing = await db.alterationTypeOption.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Alteration type not found." };
  if (trimmed === existing.label) return { ok: true };

  const conflict = await db.alterationTypeOption.findUnique({ where: { label: trimmed } });
  if (conflict) return { ok: false, error: "An alteration type with that label already exists." };

  await db.$transaction(async (tx) => {
    await tx.alterationTypeOption.update({ where: { id }, data: { label: trimmed } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: id,
        action: "ALTERATION_TYPE_RENAMED",
        summary: `Alteration type "${existing.label}" renamed to "${trimmed}" by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function toggleGarmentType(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  await db.$transaction(async (tx) => {
    const opt = await tx.garmentTypeOption.update({ where: { id }, data: { active } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: id,
        action: "GARMENT_TYPE_TOGGLED",
        summary: `Garment type "${opt.label}" ${active ? "enabled" : "disabled"} by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function toggleAlterationType(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  await db.$transaction(async (tx) => {
    const opt = await tx.alterationTypeOption.update({ where: { id }, data: { active } });
    await logAudit(
      {
        entityType: "TAXONOMY",
        entityId: id,
        action: "ALTERATION_TYPE_TOGGLED",
        summary: `Alteration type "${opt.label}" ${active ? "enabled" : "disabled"} by ${session.name}.`,
        performedById: session.userId,
      },
      tx
    );
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}
