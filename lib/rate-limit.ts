import "server-only";

/**
 * Best-effort, in-memory brute-force throttle for public, unauthenticated endpoints —
 * currently just the order lookup in actions/track.ts. This is NOT real rate-limiting
 * infrastructure: the counters live in process memory, so they reset on every deploy or
 * restart and don't coordinate across multiple server instances if this app ever scales
 * beyond one. For a single small shop's traffic that's a fine tradeoff — it's a free
 * speed bump against someone scripting through phone numbers for a known order number,
 * without adding a database table or an external service for what is a low-value target.
 * If this ever needs to be real (e.g. multiple instances), swap the Map for a shared
 * store (Redis, a DB table) behind the same isRateLimited() call.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;

/** Returns true if `key` has already made too many attempts within the current window. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}
