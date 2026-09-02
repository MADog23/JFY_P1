import "server-only";

// Deliberately has NO dependency on next/headers/cookies() or anything else — this file
// exists specifically so middleware.ts (which runs on the Edge runtime, bundled
// separately from the rest of the app) can import the exact same secret-lookup and
// algorithm pinning that lib/session.ts uses, without dragging next/headers or any
// Node-only APIs into that bundle. See lib/session.ts and middleware.ts for the two
// verify call sites that both import from here.

const COOKIE_NAME = "jfy_session";
export const SESSION_COOKIE_NAME = COOKIE_NAME;

// Pinned explicitly (rather than relying on jose's own default inference from the
// secret's type) so a future jose upgrade or refactor can't silently widen which
// algorithms a token is accepted under.
export const JWT_ALGORITHMS = ["HS256"];

export function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value in your environment."
    );
  }
  return new TextEncoder().encode(secret);
}
