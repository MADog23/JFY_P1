-- Speeds up the free-text search box (actions/orders.ts:listOrders) which matches
-- clientName/clientPhone/clientEmail/pickupContactName/pickupContactPhone/orderNumber
-- with a case-insensitive substring match ({ contains, mode: "insensitive" }). A plain
-- btree index (e.g. the automatic one behind Order.orderNumber's @unique) can't serve a
-- "contains anywhere in the string" lookup, so without this every search does a full
-- table scan with ILIKE '%term%' — fine today, increasingly not as order history grows.
--
-- pg_trgm's GIN trigram indexes are exactly built for this: they index overlapping
-- 3-character fragments of each column, so ILIKE '%term%' (and Prisma's
-- contains/insensitive, which compiles to the same) can use the index instead of
-- scanning every row. This isn't expressed in schema.prisma — Prisma's DSL only gets
-- pg_trgm/GIN support behind the "postgresqlExtensions" preview feature, and enabling a
-- preview feature app-wide is a bigger, riskier change than this shop needs for one
-- search box — so this migration (raw SQL, applied via `prisma migrate deploy` like any
-- other) is the sole source of truth for these indexes. Purely additive and safe to run
-- against a live database: CREATE EXTENSION/INDEX IF NOT EXISTS, no locks beyond a
-- normal index build, nothing here touches existing data or columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Order_clientName_trgm_idx" ON "Order" USING GIN ("clientName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_clientPhone_trgm_idx" ON "Order" USING GIN ("clientPhone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_clientEmail_trgm_idx" ON "Order" USING GIN ("clientEmail" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_pickupContactName_trgm_idx" ON "Order" USING GIN ("pickupContactName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_pickupContactPhone_trgm_idx" ON "Order" USING GIN ("pickupContactPhone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_orderNumber_trgm_idx" ON "Order" USING GIN ("orderNumber" gin_trgm_ops);
