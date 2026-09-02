import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSecret, JWT_ALGORITHMS, SESSION_COOKIE_NAME } from "./lib/jwt-config";

// This is a coarse first gate only — it decides whether to redirect to /login, nothing
// more. It used to re-derive the JWT secret itself with a silent `process.env.SESSION_SECRET
// || ""` fallback, which could drift out of sync with lib/session.ts's fail-loud version.
// Now it reuses that exact function: if SESSION_SECRET is ever missing/too short, this
// throws (fails loud, fails closed) instead of quietly verifying against an empty secret.
// The AUTHORITATIVE check is still requireSession()/requireManager() (lib/auth.ts), which
// every /manager and /employee page and every server action calls independently and which
// also re-checks the account is still active in the database — this can't be bypassed by
// skipping middleware alone (see CVE-2025-29927, which this app's pinned Next.js version
// is already patched against).
async function getRole(req: NextRequest): Promise<"EMPLOYEE" | "MANAGER" | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: JWT_ALGORITHMS });
    return (payload as any).role ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);

  if (pathname.startsWith("/manager")) {
    if (role !== "MANAGER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname.startsWith("/employee")) {
    if (role !== "EMPLOYEE" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/employee/:path*", "/manager/:path*"],
};
