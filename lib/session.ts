import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSecret, JWT_ALGORITHMS, SESSION_COOKIE_NAME } from "./jwt-config";

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
}

export { SESSION_COOKIE_NAME };
