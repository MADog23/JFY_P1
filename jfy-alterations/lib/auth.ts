import "server-only";
import { redirect } from "next/navigation";
import { readSession, SessionPayload } from "./session";

/** Any signed-in user (employee or manager). Redirects to /login if not signed in. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

/** Signed in AND active manager. Redirects employees back to their dashboard. */
export async function requireManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "MANAGER") redirect("/employee");
  return session;
}

/** Just reads the session without redirecting — for pages that behave differently per role. */
export async function getOptionalSession(): Promise<SessionPayload | null> {
  return readSession();
}
