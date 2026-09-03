import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSecret, JWT_ALGORITHMS } from "./jwt-config";

/**
 * A short-lived, separate-purpose token that unlocks IP address visibility on the
 * manager audit report (actions/audit-report.ts) after a manager re-enters their
 * password (see confirmRevealAuditIpAddresses). This is deliberately its own cookie
 * and its own JWT — not a flag added to the real session (lib/session.ts) — so it:
 *   - expires far sooner (15 minutes) than a normal 12-hour shift session,
 *   - carries a `purpose` claim so it can never be mistaken for / substituted as a
 *     real session token even if someone tried to replay one in place of the other,
 *   - is scoped to the /manager/audit path only.
 * Reuses the same secret + algorithm as the real session (lib/jwt-config.ts) rather
 * than inventing a second secret to manage — the `purpose` claim is what keeps the
 * two kinds of token from being interchangeable, not a different key.
 */

const COOKIE_NAME = "jfy_audit_ip_reveal";
// Exported so lib/session.ts's destroySession() can clear this cookie on every logout —
// belt-and-suspenders alongside the userId check below: a reveal token should never
// outlive the session that created it, regardless of which account logs in next on the
// same device.
export const AUDIT_IP_REVEAL_COOKIE_NAME = COOKIE_NAME;
const REVEAL_DURATION_SECONDS = 15 * 60; // ~15 minutes, per the confirmed design
const PURPOSE = "audit-ip-reveal" as const;

type RevealPayload = { userId: string; purpose: typeof PURPOSE; exp?: number };

/** Called only after confirmRevealAuditIpAddresses verifies the manager's password. */
export async function grantIpReveal(userId: string) {
  const token = await new SignJWT({ userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REVEAL_DURATION_SECONDS}s`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REVEAL_DURATION_SECONDS,
    path: "/manager/audit",
  });
}

/**
 * The authoritative check — always call this server-side (listAuditReport does) rather
 * than trusting anything the client claims about reveal state. Requires the token to
 * both verify (signed by this app, not expired) AND name the SAME userId as the
 * currently signed-in manager, so one manager's unlock can't leak into another
 * manager's session on a shared device.
 *
 * Returns `expiresAt` (ms epoch) whenever `active` is true, so the client can schedule
 * its own auto-refresh right at the moment this expires (see
 * components/RevealIpAddressesControl.tsx) instead of only re-checking on the next
 * full navigation/refresh.
 */
export async function getIpRevealStatus(userId: string): Promise<{ active: boolean; expiresAt: number | null }> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return { active: false, expiresAt: null };
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: JWT_ALGORITHMS });
    const p = payload as unknown as RevealPayload;
    const active = p.purpose === PURPOSE && p.userId === userId;
    return { active, expiresAt: active && p.exp ? p.exp * 1000 : null };
  } catch {
    return { active: false, expiresAt: null };
  }
}

/** Convenience wrapper over getIpRevealStatus for call sites that only need the boolean. */
export async function hasActiveIpReveal(userId: string): Promise<boolean> {
  return (await getIpRevealStatus(userId)).active;
}
