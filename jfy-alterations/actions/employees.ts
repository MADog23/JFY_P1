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
