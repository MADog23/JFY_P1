/**
 * Removes every order this pricing-demo seed created (anything whose clientName
 * starts with "[DEMO]") — including a partial/broken one left behind by a seed run
 * that crashed partway through. Safe to run any time, including when there's
 * nothing to clean up. Does NOT touch the "Demo Employee" login or anything without
 * the "[DEMO]" prefix, so your real tickets are never in scope.
 *
 * Run it with:  npx tsx prisma/clear-pricing-demo.ts
 * (same DATABASE_URL setup as the seed scripts.)
 *
 * Deleting the Order rows cascades to their items, notes, measurements, price lines,
 * images and pickups automatically (the schema's ON DELETE CASCADE handles that at
 * the database level) — no need to delete those individually first. Any AuditLog
 * rows for a deleted order stick around with their orderId set to NULL rather than
 * being removed, same as it would for any other order.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const toDelete = await prisma.order.findMany({
    where: { clientName: { startsWith: "[DEMO]" } },
    select: { id: true, orderNumber: true, clientName: true, totalPriceCents: true },
  });

  if (toDelete.length === 0) {
    console.log("No [DEMO] orders found — nothing to clean up.");
    return;
  }

  for (const o of toDelete) {
    console.log(`Deleting ${o.orderNumber} — ${o.clientName} (total was $${(o.totalPriceCents / 100).toFixed(2)})`);
  }

  const result = await prisma.order.deleteMany({ where: { clientName: { startsWith: "[DEMO]" } } });
  console.log(`\nDeleted ${result.count} order(s). Run "npm run db:seed:pricing-demo" again for a clean set.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
