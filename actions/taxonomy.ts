"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, getOptionalSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./auth";

/** Any signed-in user needs these to fill out the intake form. */
export async function listTaxonomy() {
  await getOptionalSession();
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
  await db.garmentTypeOption.create({ data: { label: label.trim(), sortOrder: count } });
  await logAudit({
    entityType: "TAXONOMY",
    entityId: label.trim(),
    action: "GARMENT_TYPE_ADDED",
    summary: `Garment type "${label.trim()}" added by ${session.name}.`,
    performedById: session.userId,
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function addAlterationType(label: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!label.trim()) return { ok: false, error: "Label required." };
  const count = await db.alterationTypeOption.count();
  await db.alterationTypeOption.create({ data: { label: label.trim(), sortOrder: count } });
  await logAudit({
    entityType: "TAXONOMY",
    entityId: label.trim(),
    action: "ALTERATION_TYPE_ADDED",
    summary: `Alteration type "${label.trim()}" added by ${session.name}.`,
    performedById: session.userId,
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function toggleGarmentType(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  const opt = await db.garmentTypeOption.update({ where: { id }, data: { active } });
  await logAudit({
    entityType: "TAXONOMY",
    entityId: id,
    action: "GARMENT_TYPE_TOGGLED",
    summary: `Garment type "${opt.label}" ${active ? "enabled" : "disabled"} by ${session.name}.`,
    performedById: session.userId,
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}

export async function toggleAlterationType(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  const opt = await db.alterationTypeOption.update({ where: { id }, data: { active } });
  await logAudit({
    entityType: "TAXONOMY",
    entityId: id,
    action: "ALTERATION_TYPE_TOGGLED",
    summary: `Alteration type "${opt.label}" ${active ? "enabled" : "disabled"} by ${session.name}.`,
    performedById: session.userId,
  });
  revalidatePath("/manager/taxonomy");
  return { ok: true };
}
