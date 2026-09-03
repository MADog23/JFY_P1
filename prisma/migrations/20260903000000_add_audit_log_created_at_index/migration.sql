-- Supports the manager audit report (actions/audit-report.ts). Every query there filters
-- by a date range first — the report defaults to the current week and a manager widens
-- it deliberately rather than ever querying the whole table unbounded — with category
-- (entityType) and/or the curated Security action list layered on top as optional
-- narrowing filters. A plain index on createdAt serves that leading date-range filter no
-- matter which optional filters are or aren't applied on top of it, which a composite
-- index led by entityType would not (the Security category and the "all categories" view
-- both skip entityType entirely). Purely additive and safe to run against a live
-- database: CREATE INDEX IF NOT EXISTS, no locks beyond a normal index build, nothing
-- here touches existing data or columns.

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
