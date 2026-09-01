/**
 * DUMMY DATA for testing the itemized-pricing workflow (see README.md § "Itemized
 * pricing"). Separate from prisma/seed.ts on purpose — seed.ts is the one-time,
 * safe-to-rerun setup (first manager login + default taxonomy) you run once per
 * environment; this script adds throwaway test *orders* on top of that, meant to be
 * run against a dev database (or a scratch/staging one) whenever you want fresh
 * scenarios to click through.
 *
 * Every order this script creates has a clientName prefixed "[DEMO] " so it's
 * unmistakable in the order list, and the script is idempotent per client name — if
 * you rerun it, orders it already created are skipped rather than duplicated.
 *
 * Run it with:  npx tsx prisma/seed-pricing-demo.ts
 * (needs DATABASE_URL set the same way `npm run db:seed` does — see README §
 * "Running locally" / § "Deployment reality-check notes" for the Railway tunnel
 * trick if you're pointing this at the live database instead of a local one.)
 *
 * To remove all of this data later:
 *   DELETE FROM "Order" WHERE "clientName" LIKE '[DEMO]%';
 * Cascading deletes clean up the items/notes/measurements/priceLines/pickups that
 * hang off those orders. AuditLog rows for them lose their orderId (SET NULL on
 * delete) but aren't removed — harmless, and matches how the app treats any other
 * order's audit trail if the order itself were ever deleted.
 *
 * What each order is built to exercise:
 *   1. [DEMO] Priya Shah    — full pricing entered at intake, one alteration row left
 *                             blank on purpose, a custom-instructions row, an
 *                             order-wide freeform charge (rush fee).
 *   2. [DEMO] Marcus Webb   — intake pricing left mostly blank, then "a manager"
 *                             fills in the gaps and corrects one price afterward —
 *                             exercises the post-intake manager-only add/edit path
 *                             and the "edited by <manager>" attribution.
 *   3. [DEMO] Sophia Nguyen — zero pricing entered at all, for testing the empty
 *                             state and adding pricing from scratch on an existing
 *                             order.
 *   4. [DEMO] Daniel Brooks — fully priced, fully completed, PAID, with one item
 *                             partially picked up — feeds analytics (revenue, avg
 *                             order value, avg turnaround) with a real number.
 *   5. [DEMO] Angela Torres — fully priced but overdue and still in progress — feeds
 *                             the "Overdue & still in progress" analytics stat.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function clientToken(): string {
  return randomBytes(24).toString("base64url");
}

function daysFrom(base: Date, deltaDays: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + deltaDays);
  return d;
}

async function nextOrderNumber(): Promise<string> {
  const counter = await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: { lastNumber: { increment: 1 } },
    create: { id: 1, lastNumber: 1 },
  });
  return `JFY-${String(counter.lastNumber).padStart(6, "0")}`;
}

/** Mirrors lib/pricing.ts:recomputeOrderTotal — reimplemented locally so this script
 * doesn't import anything under the "server-only" guard (see lib/db.ts vs. this file's
 * standalone PrismaClient — same reason prisma/seed.ts doesn't import lib/db.ts). */
async function recomputeOrderTotal(orderId: string) {
  const result = await prisma.priceLine.aggregate({ where: { orderId }, _sum: { amountCents: true } });
  await prisma.order.update({ where: { id: orderId }, data: { totalPriceCents: result._sum.amountCents ?? 0 } });
}

/** Mirrors lib/order-status.ts:recomputeOrderStatus. */
async function recomputeOrderStatus(orderId: string) {
  const items = await prisma.orderItem.findMany({ where: { orderId }, select: { status: true } });
  if (items.length === 0) return;
  const allPickedUp = items.every((i) => i.status === "PICKED_UP");
  const allDone = items.every((i) => i.status === "COMPLETED" || i.status === "PICKED_UP");
  if (allPickedUp) {
    await prisma.order.update({ where: { id: orderId }, data: { status: "PICKED_UP" } });
  } else if (allDone) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { sealedAt: true } });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "SEALED", sealedAt: order?.sealedAt ?? new Date() },
    });
  } else {
    await prisma.order.update({ where: { id: orderId }, data: { status: "IN_PROGRESS", sealedAt: null, sealedById: null } });
  }
}

async function logAudit(input: {
  orderId: string;
  entityType: "ORDER" | "ORDER_ITEM";
  entityId: string;
  action: string;
  summary: string;
  performedById: string;
}) {
  await prisma.auditLog.create({ data: input });
}

type PriceLineSpec = { description: string; amountCents: number; source: "ALTERATION" | "CUSTOM_INSTRUCTIONS" | "FREEFORM" };
type ItemSpec = {
  garmentType: string;
  description: string;
  alterations: string[];
  alterationsCustom?: string;
  priceLines: PriceLineSpec[]; // rows to persist NOW (i.e. what was priced at intake) — leave [] to mean "priced nothing"
};

async function seedOrder(opts: {
  clientName: string; // will be prefixed "[DEMO] " automatically
  clientPhone: string;
  clientEmail?: string;
  dueDate?: Date;
  createdAt?: Date; // backdate for realistic analytics (turnaround, overdue)
  createdById: string;
  paymentStatus?: "UNPAID" | "DEPOSIT_PAID" | "PAID";
  items: ItemSpec[];
  orderPriceLines?: PriceLineSpec[]; // order-wide freeform charges entered at intake
}): Promise<string> {
  const clientName = `[DEMO] ${opts.clientName}`;

  const existing = await prisma.order.findFirst({ where: { clientName } });
  if (existing) {
    console.log(`Skipping "${clientName}" — already seeded (order ${existing.orderNumber}).`);
    return existing.id;
  }

  const orderNumber = await nextOrderNumber();
  const order = await prisma.order.create({
    data: {
      orderNumber,
      clientName,
      clientPhone: opts.clientPhone,
      clientEmail: opts.clientEmail ?? null,
      dueDate: opts.dueDate ?? null,
      clientToken: clientToken(),
      createdById: opts.createdById,
      paymentStatus: opts.paymentStatus ?? "UNPAID",
      ...(opts.createdAt ? { createdAt: opts.createdAt, updatedAt: opts.createdAt } : {}),
      items: {
        create: opts.items.map((item) => ({
          garmentType: item.garmentType,
          description: item.description,
          alterations: item.alterations,
          alterationsCustom: item.alterationsCustom ?? null,
          ...(opts.createdAt ? { createdAt: opts.createdAt, updatedAt: opts.createdAt } : {}),
        })),
      },
    },
    include: { items: true },
  });

  await logAudit({
    orderId: order.id,
    entityType: "ORDER",
    entityId: order.id,
    action: "INTAKE_CREATED",
    summary: `Intake ticket ${order.orderNumber} created for ${order.clientName} with ${order.items.length} item(s) (demo data).`,
    performedById: opts.createdById,
  });

  const priceLineRows: Prisma.PriceLineCreateManyInput[] = [];
  opts.items.forEach((item, i) => {
    const orderItemId = order.items[i].id;
    item.priceLines.forEach((pl) => {
      priceLineRows.push({
        orderId: order.id,
        orderItemId,
        description: pl.description,
        amountCents: pl.amountCents,
        source: pl.source,
        createdById: opts.createdById,
      });
    });
  });
  (opts.orderPriceLines ?? []).forEach((pl) => {
    priceLineRows.push({
      orderId: order.id,
      orderItemId: null,
      description: pl.description,
      amountCents: pl.amountCents,
      source: "FREEFORM",
      createdById: opts.createdById,
    });
  });

  if (priceLineRows.length > 0) {
    await prisma.priceLine.createMany({ data: priceLineRows });
    await recomputeOrderTotal(order.id);
    await logAudit({
      orderId: order.id,
      entityType: "ORDER",
      entityId: order.id,
      action: "PRICING_SET_AT_INTAKE",
      summary: `${priceLineRows.length} price line(s) entered at intake for ${order.orderNumber} (demo data).`,
      performedById: opts.createdById,
    });
  }

  console.log(`Created ${order.orderNumber} — ${clientName}`);
  return order.id;
}

async function main() {
  const manager = await prisma.user.findFirst({ where: { role: "MANAGER", active: true }, orderBy: { createdAt: "asc" } });
  if (!manager) {
    throw new Error(
      'No manager account found. Run "npm run db:seed" first (it creates the first manager login), then re-run this script.'
    );
  }

  let employee = await prisma.user.findFirst({ where: { role: "EMPLOYEE", name: "Demo Employee" } });
  if (!employee) {
    employee = await prisma.user.create({
      data: { name: "Demo Employee", role: "EMPLOYEE", pinHash: await bcrypt.hash("1234", 10), active: true },
    });
    console.log('Created employee "Demo Employee" — PIN 1234 — for logging in as staff while testing.');
  } else {
    console.log('Using existing "Demo Employee" account.');
  }

  const today = new Date();

  // 1. Fully priced at intake, one row deliberately left blank, custom-instructions
  //    row, and an order-wide rush fee.
  await seedOrder({
    clientName: "Priya Shah",
    clientPhone: "615-555-0142",
    clientEmail: "priya.shah@example.com",
    dueDate: daysFrom(today, 10),
    createdById: employee.id,
    paymentStatus: "DEPOSIT_PAID",
    items: [
      {
        garmentType: "Wedding Gown",
        description: "Ivory lace, cathedral train",
        alterations: ["Hem", "Bustle", "Take In Bodice"],
        alterationsCustom: "Reduce cathedral train to floor length; keep the back buttons as-is.",
        priceLines: [
          { description: "Hem", amountCents: 8500, source: "ALTERATION" },
          { description: "Bustle", amountCents: 12000, source: "ALTERATION" },
          // "Take In Bodice" intentionally left unpriced — tests the optional/skippable row.
          {
            description: "Custom: Reduce cathedral train to floor length; keep the back buttons as-i…",
            amountCents: 4500,
            source: "CUSTOM_INSTRUCTIONS",
          },
        ],
      },
      {
        garmentType: "Flower Girl Dress",
        description: "Ivory, size 6",
        alterations: ["Hem"],
        priceLines: [{ description: "Hem", amountCents: 2500, source: "ALTERATION" }],
      },
    ],
    orderPriceLines: [{ description: "Rush service (2-week turnaround)", amountCents: 5000, source: "FREEFORM" }],
  });

  // 2. Mostly unpriced at intake — a manager fills gaps and corrects one price after
  //    the fact, so the "edited by <manager>" attribution shows up in the UI.
  const marcusOrderId = await seedOrder({
    clientName: "Marcus Webb",
    clientPhone: "615-555-0198",
    dueDate: daysFrom(today, 14),
    createdById: employee.id,
    items: [
      {
        garmentType: "Tuxedo Jacket",
        description: "Black, peak lapel",
        alterations: ["Shorten Sleeves", "Waist Adjustment"],
        priceLines: [{ description: "Shorten Sleeves", amountCents: 3000, source: "ALTERATION" }],
        // "Waist Adjustment" left blank at intake.
      },
      {
        garmentType: "Tuxedo Pants",
        description: "Black, matching",
        alterations: ["Taper Pants", "Cuff Adjustment"],
        priceLines: [], // nothing priced at intake for this item at all
      },
    ],
  });
  {
    // Simulate a manager visiting after intake: fills in what was left blank, and
    // corrects the one price the employee did enter.
    const jacketItem = await prisma.orderItem.findFirst({ where: { orderId: marcusOrderId, garmentType: "Tuxedo Jacket" } });
    const pantsItem = await prisma.orderItem.findFirst({ where: { orderId: marcusOrderId, garmentType: "Tuxedo Pants" } });
    const shortenSleevesLine = await prisma.priceLine.findFirst({
      where: { orderItemId: jacketItem!.id, description: "Shorten Sleeves" },
    });

    await prisma.priceLine.create({
      data: {
        orderId: marcusOrderId,
        orderItemId: jacketItem!.id,
        description: "Waist Adjustment",
        amountCents: 2500,
        source: "FREEFORM", // matches actions/pricing.ts:addPriceLine, which always writes FREEFORM post-intake
        createdById: manager.id,
      },
    });
    await prisma.priceLine.createMany({
      data: [
        { orderId: marcusOrderId, orderItemId: pantsItem!.id, description: "Taper Pants", amountCents: 2000, source: "FREEFORM", createdById: manager.id },
        { orderId: marcusOrderId, orderItemId: pantsItem!.id, description: "Cuff Adjustment", amountCents: 1500, source: "FREEFORM", createdById: manager.id },
      ],
    });
    if (shortenSleevesLine) {
      await prisma.priceLine.update({
        where: { id: shortenSleevesLine.id },
        data: { amountCents: 3500, updatedById: manager.id },
      });
    }
    await recomputeOrderTotal(marcusOrderId);
    await logAudit({
      orderId: marcusOrderId,
      entityType: "ORDER",
      entityId: marcusOrderId,
      action: "PRICE_LINE_ADDED",
      summary: `Manager filled in missing pricing and corrected Shorten Sleeves on ${(await prisma.order.findUnique({ where: { id: marcusOrderId } }))!.orderNumber} (demo data).`,
      performedById: manager.id,
    });
  }

  // 3. Zero pricing entered at all — tests the empty state and adding pricing from
  //    scratch on an already-existing order.
  await seedOrder({
    clientName: "Sophia Nguyen",
    clientPhone: "615-555-0173",
    clientEmail: "sophia.nguyen@example.com",
    dueDate: daysFrom(today, 21),
    createdById: employee.id,
    items: [
      {
        garmentType: "Bridesmaid Dress",
        description: "Dusty blue, size 8",
        alterations: ["Hem", "Adjust Straps"],
        priceLines: [],
      },
    ],
  });

  // 4. Fully priced, fully completed, PAID, one item partially picked up — gives
  //    analytics (revenue, avg order value, avg turnaround) a real number to show.
  const danielCreatedAt = daysFrom(today, -9);
  const danielOrderId = await seedOrder({
    clientName: "Daniel Brooks",
    clientPhone: "615-555-0111",
    dueDate: daysFrom(today, -2),
    createdAt: danielCreatedAt,
    createdById: employee.id,
    paymentStatus: "PAID",
    items: [
      {
        garmentType: "Suit Jacket",
        description: "Navy, 2-button",
        alterations: ["Take In", "Shorten Sleeves"],
        priceLines: [
          { description: "Take In", amountCents: 2800, source: "ALTERATION" },
          { description: "Shorten Sleeves", amountCents: 3200, source: "ALTERATION" },
        ],
      },
      {
        garmentType: "Suit Pants",
        description: "Navy, matching",
        alterations: ["Taper Pants", "Cuff Adjustment"],
        priceLines: [
          { description: "Taper Pants", amountCents: 2200, source: "ALTERATION" },
          { description: "Cuff Adjustment", amountCents: 1800, source: "ALTERATION" },
        ],
      },
    ],
    orderPriceLines: [{ description: "Same-day pickup surcharge", amountCents: 4000, source: "FREEFORM" }],
  });
  {
    const items = await prisma.orderItem.findMany({ where: { orderId: danielOrderId } });
    const completedAt = daysFrom(danielCreatedAt, 6);
    for (const item of items) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { status: "COMPLETED", completedAt, completedById: employee.id },
      });
    }
    await recomputeOrderStatus(danielOrderId); // -> SEALED
    // Backdate sealedAt to line up with completedAt above, so the analytics page's
    // avg-turnaround-days stat reflects the intended ~6 day story rather than "now".
    await prisma.order.update({ where: { id: danielOrderId }, data: { sealedAt: completedAt } });
    // Manager authorizes pickup of just the jacket (partial pickup), pants stay ready-for-pickup.
    const jacket = items.find((i) => i.garmentType === "Suit Jacket")!;
    await prisma.itemPickup.create({
      data: {
        orderItemId: jacket.id,
        pickedUpByName: "Daniel Brooks",
        pickedUpByPhone: "615-555-0111",
        authorizedById: manager.id,
        pickedUpAt: daysFrom(danielCreatedAt, 7),
      },
    });
    await prisma.orderItem.update({ where: { id: jacket.id }, data: { status: "PICKED_UP" } });
    await recomputeOrderStatus(danielOrderId); // stays SEALED (pants item still just COMPLETED)
    await logAudit({
      orderId: danielOrderId,
      entityType: "ORDER_ITEM",
      entityId: jacket.id,
      action: "PICKUP_AUTHORIZED",
      summary: `"Navy, 2-button" picked up by Daniel Brooks, authorized by ${manager.name} (demo data).`,
      performedById: manager.id,
    });
  }

  // 5. Fully priced but overdue and still in progress — feeds the "Overdue & still in
  //    progress" analytics stat.
  await seedOrder({
    clientName: "Angela Torres",
    clientPhone: "615-555-0164",
    dueDate: daysFrom(today, -3),
    createdAt: daysFrom(today, -12),
    createdById: employee.id,
    paymentStatus: "UNPAID",
    items: [
      {
        garmentType: "Evening Gown / Formal Dress",
        description: "Emerald green, size 10",
        alterations: ["Hem", "Bead/Lace Repair"],
        priceLines: [
          { description: "Hem", amountCents: 4000, source: "ALTERATION" },
          { description: "Bead/Lace Repair", amountCents: 6000, source: "ALTERATION" },
        ],
      },
    ],
  });

  console.log("\nDemo data ready. Log in as:");
  console.log("  Employee — pick \"Demo Employee\" on the login screen, PIN 1234");
  console.log(`  Manager  — ${manager.email} (whatever password you set it up with)`);
  console.log('\nAll five orders are prefixed "[DEMO]" in the order list for easy spotting/cleanup.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
