"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Two throttles per attempt, keyed differently on purpose:
//  - per-IP: catches someone hammering many different accounts from one place.
//  - per-account (employeeId / email): catches a targeted brute force of ONE account
//    from many IPs, which per-IP limiting alone wouldn't stop. This matters especially
//    for employee PINs — the login screen's name picker publicly lists every employee's
//    id (it has to, to build the dropdown), so an attacker doesn't need to guess who to
//    target, only a short numeric PIN. The IP bucket is deliberately looser than the
//    account bucket: several legitimate employees can share one shop IP/tablet in a
//    normal day, but only one person should be legitimately entering a given PIN.
const LOGIN_IP_LIMIT = { maxAttempts: 20, windowMs: 10 * 60 * 1000 };
const LOGIN_ACCOUNT_LIMIT = { maxAttempts: 6, windowMs: 10 * 60 * 1000 };
const LOCKOUT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

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

  const ip = getClientIp();
  if (
    isRateLimited(`login-ip:${ip}`, LOGIN_IP_LIMIT) ||
    isRateLimited(`login-emp:${employeeId}`, LOGIN_ACCOUNT_LIMIT)
  ) {
    return { ok: false, error: LOCKOUT_MESSAGE };
  }

  const user = await db.user.findUnique({ where: { id: employeeId } });
  if (!user || user.role !== "EMPLOYEE" || !user.active || !user.pinHash) {
    return { ok: false, error: "That account isn't available. Ask a manager for help." };
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    // We only get here for a real, active employee id, so there's a valid FK target
    // for the audit row — this is what lets a manager actually see repeated failed PIN
    // attempts against one account, not just a generic "someone tried and failed".
    await logAudit({
      entityType: "EMPLOYEE",
      entityId: user.id,
      action: "LOGIN_FAILED",
      // IP no longer lives in the summary text (see AuditLog.ipAddress) — the audit
      // report hides/reveals it as its own field behind step-up re-auth instead of it
      // sitting here as unredactable plain text.
      summary: `Failed PIN attempt for "${user.name}".`,
      performedById: user.id,
      ipAddress: ip,
    });
    return { ok: false, error: "Incorrect PIN." };
  }

  // Logged same as a failed attempt (not just failures) — otherwise the audit trail
  // can show someone hammering a PIN but never shows whether they eventually got in,
  // which is the one thing you'd most want to know while reviewing it after the fact.
  await logAudit({
    entityType: "EMPLOYEE",
    entityId: user.id,
    action: "LOGIN_SUCCESS",
    summary: `"${user.name}" logged in.`,
    performedById: user.id,
    ipAddress: ip,
  });

  await createSession({ userId: user.id, name: user.name, role: "EMPLOYEE" });
  redirect("/employee");
}

export async function managerLogin(email: string, password: string): Promise<ActionResult> {
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  const normalizedEmail = email.toLowerCase().trim();
  const ip = getClientIp();
  if (
    isRateLimited(`login-ip:${ip}`, LOGIN_IP_LIMIT) ||
    isRateLimited(`login-mgr:${normalizedEmail}`, LOGIN_ACCOUNT_LIMIT)
  ) {
    return { ok: false, error: LOCKOUT_MESSAGE };
  }

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.role !== "MANAGER" || !user.active || !user.passwordHash) {
    return { ok: false, error: "Incorrect email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logAudit({
      entityType: "EMPLOYEE",
      entityId: user.id,
      action: "LOGIN_FAILED",
      summary: `Failed password attempt for "${user.name}".`,
      performedById: user.id,
      ipAddress: ip,
    });
    return { ok: false, error: "Incorrect email or password." };
  }

  // See the matching comment in employeeLogin above — successful logins are logged
  // right alongside failures so the audit trail shows the full picture, not just attempts.
  await logAudit({
    entityType: "EMPLOYEE",
    entityId: user.id,
    action: "LOGIN_SUCCESS",
    summary: `"${user.name}" logged in.`,
    performedById: user.id,
    ipAddress: ip,
  });

  await createSession({ userId: user.id, name: user.name, role: "MANAGER" });
  redirect("/manager");
}

export async function logout() {
  destroySession();
  redirect("/login");
}

const newPasswordSchema = z.string().min(8, "New password must be at least 8 characters.");

/**
 * MANAGER, SELF ONLY: rotates the signed-in manager's own password. There is
 * deliberately no "change someone else's password" action, and this one never takes a
 * target userId from the caller — the account to change is always session.userId, so
 * one manager can't use this to take over another manager's account. Closes the gap
 * where a seeded (prisma/seed.ts) or temporary (actions/employees.ts:createManager)
 * password could only ever be rotated by someone with direct database access.
 *
 * Not separately rate-limited: getting this far already requires a valid, active
 * session, which itself required a correct login (now throttled above) — an attacker
 * who already has that session has full manager access regardless of this action, so
 * there's nothing extra to gain by brute-forcing "current password" here.
 */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  const session = await requireManager();

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Enter your current and new password." };
  }
  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.role !== "MANAGER" || !user.passwordHash) {
    return { ok: false, error: "Account not found." };
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  if (currentPassword === newPassword) {
    return { ok: false, error: "New password must be different from your current password." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  await logAudit({
    entityType: "EMPLOYEE",
    entityId: user.id,
    action: "PASSWORD_CHANGED",
    summary: `"${user.name}" changed their own password.`,
    performedById: user.id,
  });

  return { ok: true };
}
