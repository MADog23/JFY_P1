import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort, in-memory brute-force throttle for endpoints that take a credential from
 * an unauthenticated caller — the order lookup (actions/track.ts) and both login paths
 * (actions/auth.ts). This is NOT real rate-limiting infrastructure: the counters live in
 * process memory, so they reset on every deploy or restart and don't coordinate across
 * multiple server instances if this app ever scales beyond one. For a single small shop's
 * traffic that's a fine tradeoff — it's a free speed bump against someone scripting
 * through PINs, passwords, or phone numbers, without adding a database table or an
 * external service for what is a low-value target. If this ever needs to be real (e.g.
 * multiple instances), swap the Map for a shared store (Redis, a DB table) behind the
 * same isRateLimited() call — every caller already goes through this one function.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_ATTEMPTS = 8;

/** Returns true if `key` has already made too many attempts within the current window. */
export function isRateLimited(
  key: string,
  opts?: { maxAttempts?: number; windowMs?: number }
): boolean {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > maxAttempts;
}

/**
 * Best-effort caller IP for rate-limit keys and audit-log context — NOT a security
 * boundary on its own, since any client-supplied header is spoofable in principle.
 * Preference order:
 *   1. `cf-connecting-ip` — this app sits behind Cloudflare (see README's custom domain
 *      setup), and Cloudflare overwrites this header at its edge rather than passing
 *      through whatever the client sent, so it's trustworthy as long as Cloudflare is
 *      actually in front of every request (true for the custom domain; NOT true if
 *      someone hits the raw *.up.railway.app URL directly, where this header is absent
 *      and we fall through below).
 *   2. The LAST hop of `x-forwarded-for` — a client can prepend arbitrary fake entries
 *      to this header, but can't remove or forge the entry Railway's own proxy appends
 *      as it forwards the request, so the last entry is the one hop we can trust.
 *   3. "unknown" — groups all such requests under one shared bucket, which is
 *      conservative (it can rate-limit unrelated callers together) rather than
 *      permissive (never letting a spoofed/missing header bypass the limiter entirely).
 */
export function getClientIp(): string {
  const h = headers();

  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  return "unknown";
}
