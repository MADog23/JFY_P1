"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Returns the list of active employees for the PIN-pad name picker (no PINs exposed). */
export async function listActiveEmployeesForLogin() {
  return db.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function employeeLogin(employeeId: string, pin: string): Promise<ActionResult> {
  if (!employeeId || !pin) return { ok: false, error: "Choose your name and enter your PIN." };

  const user = await db.user.findUnique({ where: { id: employeeId } });
  if (!user || user.role !== "EMPLOYEE" || !user.active || !user.pinHash) {
    return { ok: false, error: "That account isn't available. Ask a manager for help." };
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) return { ok: false, error: "Incorrect PIN." };

  await createSession({ userId: user.id, name: user.name, role: "EMPLOYEE" });
  redirect("/employee");
}

export async function managerLogin(email: string, password: string): Promise<ActionResult> {
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.role !== "MANAGER" || !user.active || !user.passwordHash) {
    return { ok: false, error: "Incorrect email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Incorrect email or password." };

  await createSession({ userId: user.id, name: user.name, role: "MANAGER" });
  redirect("/manager");
}

export async function logout() {
  destroySession();
  redirect("/login");
}
