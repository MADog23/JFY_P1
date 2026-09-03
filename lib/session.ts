import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSecret, JWT_ALGORITHMS, SESSION_COOKIE_NAME } from "./jwt-config";
import { AUDIT_IP_REVEAL_COOKIE_NAME } from "./audit-ip-reveal";

const COOKIE_NAME = SESSION_COOKIE_NAME;
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hour shift-length session

export type SessionPayload = {
  userId: string;
  name: string;
  role: "EMPLOYEE" | "MANAGER";
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: JWT_ALGORITHMS });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function destroySession() {
  cookies().delete(COOKIE_NAME);
  // A reveal token (lib/audit-ip-reveal.ts) is scoped by userId, so it wouldn't leak
  // its unlock into a DIFFERENT account logging in next — but there's no reason it
  // should keep counting down after this session ends either, and clearing it here
  // (the one choke point every logout, forced or voluntary, already goes through)
  // means it never depends on the audit report page noticing on its own.
  // Must pass the same `path` it was set with (lib/audit-ip-reveal.ts's grantIpReveal
  // uses "/manager/audit", not "/") — browsers key a cookie by name+path together, so a
  // delete call with the default path "/" would silently no-op against this cookie.
  cookies().delete({ name: AUDIT_IP_REVEAL_COOKIE_NAME, path: "/manager/audit" });
}

export { SESSION_COOKIE_NAME };
