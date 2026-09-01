/**
 * Removes every order prisma/seed-historical-demo.ts created (anything whose
 * clientName starts with "[DEMO-HIST]") — including a partial/broken one left behind
 * by a run that crashed partway through. Safe to run any time, including when there's
 * nothing to clean up. Does NOT touch your real staff accounts or any order without
 * the "[DEMO-HIST]" prefix — in particular it's a different tag from the
 * "[DEMO]" prefix prisma/seed-pricing-demo.ts uses, so running this never touches that
 * script's data (or vice versa).
 *
 * Run it with:  npx tsx prisma/clear-historical-demo.ts
 * (same DATABASE_URL setup as the seed scripts.)
 *
 * Deleting the Order rows cascades to their items, notes, measurements, price lines,
 * images and pickups automatically (ON DELETE CASCADE in the schema) — no need to
 * delete those individually first. AuditLog rows for a deleted order stick around
 * with their orderId set to NULL rather than being removed, same as any other order.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TAG = "[DEMO-HIST]";

async function main() {
  const toDelete = await prisma.order.findMany({
    where: { clientName: { startsWith: TAG } },
    select: { id: true, orderNumber: true, clientName: true, totalPriceCents: true },
  });

  if (toDelete.length === 0) {
    console.log("No [DEMO-HIST] orders found — nothing to clean up.");
    return;
  }

  for (const o of toDelete) {
    console.log(`Deleting ${o.orderNumber} — ${o.clientName} (total was $${(o.totalPriceCents / 100).toFixed(2)})`);
  }

  const result = await prisma.order.deleteMany({ where: { clientName: { startsWith: TAG } } });
  console.log(`\nDeleted ${result.count} order(s). Run "npx tsx prisma/seed-historical-demo.ts" again for a fresh set.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
