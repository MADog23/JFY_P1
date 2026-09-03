-- Adds a dedicated ipAddress column to AuditLog so the manager audit report
-- (actions/audit-report.ts) can hide/reveal it as one clean field behind the
-- step-up re-authentication flow (lib/audit-ip-reveal.ts), instead of the IP
-- living as unredactable plain text inside the `summary` string.
--
-- IF NOT EXISTS makes this safe to re-run (matches this repo's other hand-authored
-- migrations) — Postgres has supported ADD COLUMN IF NOT EXISTS since 9.6.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
