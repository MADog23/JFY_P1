import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "jfy_session";

async function getRole(req: NextRequest): Promise<"EMPLOYEE" | "MANAGER" | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "");
    const { payload } = await jwtVerify(token, secret);
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
