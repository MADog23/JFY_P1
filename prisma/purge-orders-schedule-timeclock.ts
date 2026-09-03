/**
 * FULL PURGE — Orders, Schedule (Shift), and Timeclock (Punch) data
 *
 * Wipes every Order (and everything hanging off it — items, notes, measurements,
 * images, pickups, price lines, all cascade-deleted per the schema's ON DELETE
 * CASCADE), every Shift, every Punch, and the AuditLog rows that go with them
 * (entityType ORDER / ORDER_ITEM / SHIFT / PUNCH — including the orphaned
 * orderId:null rows a plain order delete would otherwise leave behind, since
 * AuditLog.orderId is ON DELETE SET NULL, not CASCADE). Resets the order-number
 * counter back to 0 so a fresh seed restarts cleanly at JFY-000001.
 *
 * Deliberately untouched: every User (staff/manager) account, GarmentTypeOption,
 * AlterationTypeOption, and any AuditLog row for entityType EMPLOYEE or TAXONOMY —
 * this is a data purge, not an account reset.
 *
 * SAFETY: defaults to a dry run — it only prints what it would delete and changes
 * nothing in the database. Pass --confirm to actually run it:
 *
 *   npx tsx prisma/purge-orders-schedule-timeclock.ts            (dry run — prints counts only)
 *   npx tsx prisma/purge-orders-schedule-timeclock.ts --confirm  (actually deletes)
 *
 * (same DATABASE_URL setup as the other seed/clear scripts — run via `railway run`
 * to target the live database.)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PURGED_ENTITY_TYPES = ["ORDER", "ORDER_ITEM", "SHIFT", "PUNCH"] as const;

async function main() {
  const confirm = process.argv.includes("--confirm");

  const [orderCount, orderItemCount, shiftCount, punchCount, counter] = await Promise.all([
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.shift.count(),
    prisma.punch.count(),
    prisma.orderCounter.findUnique({ where: { id: 1 } }),
  ]);

  const auditCounts: Record<(typeof PURGED_ENTITY_TYPES)[number], number> = {
    ORDER: 0,
    ORDER_ITEM: 0,
    SHIFT: 0,
    PUNCH: 0,
  };
  for (const entityType of PURGED_ENTITY_TYPES) {
    auditCounts[entityType] = await prisma.auditLog.count({ where: { entityType } });
  }
  const totalAuditToDelete = Object.values(auditCounts).reduce((a, b) => a + b, 0);

  console.log("=== Purge plan ===");
  console.log(`Orders:                ${orderCount}  (cascades to ${orderItemCount} order item(s), plus their notes/measurements/images/pickups/price lines)`);
  console.log(`Shifts:                ${shiftCount}`);
  console.log(`Punches:               ${punchCount}`);
  console.log(`AuditLog — ORDER:      ${auditCounts.ORDER}`);
  console.log(`AuditLog — ORDER_ITEM: ${auditCounts.ORDER_ITEM}`);
  console.log(`AuditLog — SHIFT:      ${auditCounts.SHIFT}`);
  console.log(`AuditLog — PUNCH:      ${auditCounts.PUNCH}`);
  console.log(`  (${totalAuditToDelete} audit log row(s) total)`);
  console.log(`Order number counter:  ${counter?.lastNumber ?? 0} -> 0`);
  console.log("");
  console.log("Left untouched: all Staff accounts, Garment options, Alteration options, and any");
  console.log("AuditLog rows for EMPLOYEE or TAXONOMY changes.");
  console.log("");

  if (!confirm) {
    console.log("Dry run only — nothing was deleted. Re-run with --confirm to actually purge.");
    return;
  }

  console.log("--confirm passed. Purging now...\n");

  // AuditLog rows first — some reference orders that are about to be deleted, and we
  // want them gone outright rather than left behind with orderId nulled out (which is
  // what a plain order delete does, since AuditLog.orderId is ON DELETE SET NULL).
  const deletedAudit = await prisma.auditLog.deleteMany({ where: { entityType: { in: [...PURGED_ENTITY_TYPES] } } });
  console.log(`Deleted ${deletedAudit.count} AuditLog row(s).`);

  const deletedPunches = await prisma.punch.deleteMany({});
  console.log(`Deleted ${deletedPunches.count} punch(es).`);

  const deletedShifts = await prisma.shift.deleteMany({});
  console.log(`Deleted ${deletedShifts.count} shift(s).`);

  // Cascades to OrderItem -> ItemNote/ItemMeasurement/ItemImage/ItemPickup/PriceLine.
  const deletedOrders = await prisma.order.deleteMany({});
  console.log(`Deleted ${deletedOrders.count} order(s) (and everything under them).`);

  await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: { lastNumber: 0 },
    create: { id: 1, lastNumber: 0 },
  });
  console.log("Reset order number counter to 0 — the next order created will be JFY-000001.");

  console.log("\nDone. Staff accounts, garment options, and alteration options were left untouched.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
