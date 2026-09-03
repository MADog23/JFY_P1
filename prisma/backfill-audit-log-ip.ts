/**
 * BACKFILL — extract plaintext IP addresses out of old AuditLog.summary text
 *
 * Before this feature, LOGIN_SUCCESS/LOGIN_FAILED rows embedded the caller's IP
 * directly in the summary string (e.g. `"Nina DeZemplen" logged in from ::1.`), which
 * meant it could never be hidden — the manager audit report's new "Show IP addresses"
 * re-authentication gate (actions/audit-report.ts, lib/audit-ip-reveal.ts) only
 * controls the dedicated AuditLog.ipAddress column, not free text inside summary.
 *
 * This script finds every LOGIN_SUCCESS/LOGIN_FAILED row that still has ipAddress ==
 * null, pulls the trailing "... from <ip>." out of its summary, and rewrites the row:
 *   summary   -> the same text with " from <ip>" removed (matches the new format
 *                these two actions have written since actions/auth.ts was updated)
 *   ipAddress -> the extracted value
 *
 * Only LOGIN_SUCCESS/LOGIN_FAILED are touched — those are the only two summary
 * templates that have ever embedded an IP anywhere in this app.
 *
 * SAFETY: defaults to a dry run — it only prints what it would change and touches
 * nothing in the database. Pass --confirm to actually apply it:
 *
 *   npx tsx prisma/backfill-audit-log-ip.ts            (dry run — prints matches only)
 *   npx tsx prisma/backfill-audit-log-ip.ts --confirm  (actually updates)
 *
 * Run this AFTER applying the ipAddress column migration
 * (prisma/migrations/20260903010000_add_audit_log_ip_address) — locally first, same as
 * every other script here, before ever pointing it at production via `railway run`.
 *
 * ENV: `prisma migrate deploy` has its own built-in .env loading, but a plain script
 * talking to PrismaClient directly can't always count on that (depends on the shell/
 * tsx version). loadDotEnvIfNeeded() below reads DATABASE_URL out of a .env file
 * yourself — checked in prisma/.env first (Prisma's own convention), then the project
 * root — but only if DATABASE_URL isn't already set in the environment, so `set
 * DATABASE_URL=...` (as used for the production runs) always still takes priority.
 */

import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function loadDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;

  for (const candidate of [join(__dirname, ".env"), join(__dirname, "..", ".env")]) {
    if (!existsSync(candidate)) continue;
    const lines = readFileSync(candidate, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    if (process.env.DATABASE_URL) return;
  }
}

loadDotEnvIfNeeded();

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set and no .env file with it was found in prisma/ or the project root.\n" +
      "Either add it to your .env file, or set it for this command the same way you did for the\n" +
      "production purge script, e.g.:\n" +
      "  set DATABASE_URL=postgresql://...   (then re-run this command in the same window)"
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// Matches "<anything> from <ip>." at the end of the summary — captures the prefix
// (everything before " from") and the IP itself separately. `.+` for the IP is
// deliberately permissive rather than a strict IPv4/IPv6 pattern, since the exact
// address format (see the IPv6 discussion this feature grew out of) doesn't matter
// here — whatever getClientIp() actually wrote is what should come back out.
const SUMMARY_WITH_IP = /^(.*) from (.+)\.$/;

async function main() {
  const confirm = process.argv.includes("--confirm");

  const rows = await prisma.auditLog.findMany({
    where: { action: { in: ["LOGIN_SUCCESS", "LOGIN_FAILED"] }, ipAddress: null },
    select: { id: true, action: true, summary: true },
  });

  const toUpdate: { id: string; newSummary: string; ip: string }[] = [];
  const unmatched: { id: string; summary: string }[] = [];

  for (const row of rows) {
    const match = SUMMARY_WITH_IP.exec(row.summary);
    if (!match) {
      unmatched.push({ id: row.id, summary: row.summary });
      continue;
    }
    const [, prefix, ip] = match;
    toUpdate.push({ id: row.id, newSummary: `${prefix}.`, ip });
  }

  console.log(`Found ${rows.length} login audit row(s) without a stored IP address.`);
  console.log(`${toUpdate.length} match the expected "... from <ip>." format and will be updated.`);

  if (unmatched.length > 0) {
    console.log(`${unmatched.length} did NOT match and will be left untouched:`);
    for (const u of unmatched) console.log(`  - ${u.id}: "${u.summary}"`);
  }

  if (toUpdate.length > 0) {
    console.log("\nSample of changes:");
    for (const u of toUpdate.slice(0, 5)) {
      console.log(`  - ${u.id}: ip="${u.ip}", summary -> "${u.newSummary}"`);
    }
  }

  if (!confirm) {
    console.log("\nDry run only — nothing changed. Re-run with --confirm to apply.");
    return;
  }

  for (const u of toUpdate) {
    await prisma.auditLog.update({
      where: { id: u.id },
      data: { ipAddress: u.ip, summary: u.newSummary },
    });
  }

  console.log(`\nUpdated ${toUpdate.length} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
