"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./auth";

const pinSchema = z.string().min(4, "PIN must be at least 4 digits.").max(8).regex(/^\d+$/, "PIN must be numbers only.");

export async function listEmployees() {
  await requireManager();
  return db.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, name: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export async function listManagers() {
  await requireManager();
  return db.user.findMany({
    where: { role: "MANAGER" },
    select: { id: true, name: true, email: true, active: true },
    orderBy: { name: "asc" },
  });
}

/** MANAGER ONLY: active employees + managers, for the item-assignment picker. */
export async function listAssignableStaff() {
  await requireManager();
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function createEmployee(name: string, pin: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const pinCheck = pinSchema.safeParse(pin);
  if (!pinCheck.success) return { ok: false, error: pinCheck.error.issues[0].message };

  const user = await db.user.create({
    data: { name: name.trim(), role: "EMPLOYEE", pinHash: await bcrypt.hash(pin, 10), active: true },
  });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: user.id,
    action: "EMPLOYEE_CREATED",
    summary: `Employee "${user.name}" added by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

export async function resetEmployeePin(employeeId: string, newPin: string): Promise<ActionResult> {
  const session = await requireManager();
  const pinCheck = pinSchema.safeParse(newPin);
  if (!pinCheck.success) return { ok: false, error: pinCheck.error.issues[0].message };

  const employee = await db.user.findUnique({ where: { id: employeeId } });
  if (!employee || employee.role !== "EMPLOYEE") return { ok: false, error: "Employee not found." };

  await db.user.update({ where: { id: employeeId }, data: { pinHash: await bcrypt.hash(newPin, 10) } });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: employeeId,
    action: "EMPLOYEE_PIN_RESET",
    summary: `PIN reset for "${employee.name}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

/** MANAGER ONLY: renames an employee's PIN-login display name (e.g. a spelling fix or
 * a legal name change) — doesn't touch their PIN, active state, or any historical
 * audit-log text, which keeps the name as it was at the time of that entry. */
export async function renameEmployee(employeeId: string, newName: string): Promise<ActionResult> {
  const session = await requireManager();
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (trimmed.length > 100) return { ok: false, error: "Name is too long." };

  const employee = await db.user.findUnique({ where: { id: employeeId } });
  if (!employee || employee.role !== "EMPLOYEE") return { ok: false, error: "Employee not found." };

  if (trimmed === employee.name) return { ok: true };

  await db.user.update({ where: { id: employeeId }, data: { name: trimmed } });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: employeeId,
    action: "EMPLOYEE_RENAMED",
    summary: `"${employee.name}" renamed to "${trimmed}" by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

export async function setEmployeeActive(employeeId: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  const employee = await db.user.findUnique({ where: { id: employeeId } });
  if (!employee || employee.role !== "EMPLOYEE") return { ok: false, error: "Employee not found." };

  await db.user.update({ where: { id: employeeId }, data: { active } });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: employeeId,
    action: active ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED",
    summary: `"${employee.name}" ${active ? "reactivated" : "deactivated"} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

/**
 * MANAGER ONLY: fixes another manager's display name or login email — e.g. a typo made
 * while creating their account, which previously had no correction path at all short of
 * direct database access. Deliberately never touches password: that stays strictly
 * self-service (see actions/auth.ts:changeMyPassword) so one manager can never silently
 * take over another's account through this.
 */
const managerEditSchema = z.object({
  name: z.string().min(1, "Name is required."),
  email: z.string().email("Enter a valid email."),
});

export async function editManagerAccount(
  managerId: string,
  raw: z.infer<typeof managerEditSchema>
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = managerEditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const name = parsed.data.name.trim();
  const email = parsed.data.email.toLowerCase().trim();

  const manager = await db.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== "MANAGER") return { ok: false, error: "Manager not found." };

  if (email !== manager.email) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing && existing.id !== managerId) return { ok: false, error: "That email is already in use." };
  }

  if (name === manager.name && email === manager.email) return { ok: true };

  await db.user.update({ where: { id: managerId }, data: { name, email } });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: managerId,
    action: "MANAGER_EDITED",
    summary: `Manager account "${manager.name}" (${manager.email}) updated to "${name}" (${email}) by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

/**
 * MANAGER ONLY: deactivate/reactivate another manager's account — mirrors
 * setEmployeeActive, which explicitly refuses to touch a MANAGER row. Two safety
 * guards on deactivation, since getting this wrong locks EVERYONE out with no recovery
 * path except direct database access: can't deactivate your own account (that's what
 * would actually cause a self-lockout — reactivating requires an active manager to do
 * it), and can't deactivate the last remaining active manager account.
 */
export async function setManagerActive(managerId: string, active: boolean): Promise<ActionResult> {
  const session = await requireManager();
  const manager = await db.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== "MANAGER") return { ok: false, error: "Manager not found." };

  if (!active) {
    if (manager.id === session.userId) {
      return { ok: false, error: "You can't deactivate your own account." };
    }
    const activeManagerCount = await db.user.count({ where: { role: "MANAGER", active: true } });
    if (activeManagerCount <= 1) {
      return { ok: false, error: "Can't deactivate the last active manager account." };
    }
  }

  await db.user.update({ where: { id: managerId }, data: { active } });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: managerId,
    action: active ? "MANAGER_REACTIVATED" : "MANAGER_DEACTIVATED",
    summary: `Manager "${manager.name}" ${active ? "reactivated" : "deactivated"} by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}

const managerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function createManager(raw: z.infer<typeof managerSchema>): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = managerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) return { ok: false, error: "That email is already in use." };

  const user = await db.user.create({
    data: {
      name: parsed.data.name.trim(),
      role: "MANAGER",
      email: parsed.data.email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      active: true,
    },
  });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: user.id,
    action: "MANAGER_CREATED",
    summary: `Manager account "${user.name}" created by ${session.name}.`,
    performedById: session.userId,
  });

  revalidatePath("/manager/employees");
  return { ok: true };
}
