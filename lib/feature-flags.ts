import "server-only";

/**
 * Phase 2 (timeclock + scheduling) is wired into the codebase but gated behind this
 * flag, off by default. The Punch/Shift tables and the /employee|manager/timeclock
 * and /schedule pages all exist in the deployed build either way — enabling this only
 * controls whether staff can reach them (nav links) and whether the routes themselves
 * render instead of bouncing back to the normal dashboard. That split matters: it means
 * turning Phase 2 off again, if something about it doesn't work out, is a one-line env
 * var change and a redeploy — not a code revert, and not a data loss risk, since the
 * tables stay in place (and empty, if never used) either way.
 *
 * To enable: set PHASE2_ENABLED=true in Railway's environment variables (or .env.local
 * for local dev) and redeploy/restart. To roll back: remove it, or set it to anything
 * other than "true", and redeploy/restart — no code or schema changes needed either way.
 */
export function isPhase2Enabled(): boolean {
  return process.env.PHASE2_ENABLED === "true";
}
