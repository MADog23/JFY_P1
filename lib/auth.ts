import "server-only";
import { redirect } from "next/navigation";
import { readSession, destroySession, SessionPayload } from "./session";
import { db } from "./db";

/**
 * A valid session JWT alone isn't enough — it just proves someone signed in at some
 * point in the last 12 hours (see lib/session.ts's SESSION_DURATION_SECONDS). It doesn't
 * reflect anything that happened to the account since then, because nothing about the
 * account is encoded in it. Without this check, deactivating an employee or manager
 * (see actions/employees.ts:setEmployeeActive) would only stop *future* logins — anyone
 * already signed in would keep working, on that device, for up to the rest of their
 * 12-hour session. Re-checking here closes that gap: it costs one indexed lookup by
 * primary key on every guarded page load or server action, which is cheap enough at this
 * app's scale to be worth doing on every request rather than caching it.
 */
async function verifyStillActive(session: SessionPayload): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { active: true, role: true },
  });
  return !!user && user.active && user.role === session.role;
}

/** Any signed-in user (employee or manager). Redirects to /login if not signed in, or if
 * the account has since been deactivated (or, in principle, changed role). */
export async function requireSession(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect("/login");
  if (!(await verifyStillActive(session))) {
    destroySession();
    redirect("/login");
  }
  return session;
}

/** Signed in AND active manager. Redirects employees back to their dashboard. */
export async function requireManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "MANAGER") redirect("/employee");
  return session;
}

/** Just reads the session without redirecting — for pages that behave differently per
 * role. Same active/role re-check as requireSession(), just without the redirect. */
export async function getOptionalSession(): Promise<SessionPayload | null> {
  const session = await readSession();
  if (!session) return null;
  if (!(await verifyStillActive(session))) {
    destroySession();
    return null;
  }
  return session;
}
