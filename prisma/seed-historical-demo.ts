/**
 * HISTORICAL ANALYTICS DEMO DATA
 *
 * Generates a spread of backdated orders (Apr–Aug 2026, ~5 months, 40/month = ~200
 * orders total) so the "Historical performance" analytics section (see README §
 * "Historical performance analytics") has real trend data to show, instead of empty
 * charts and null stats.
 *
 * Unlike prisma/seed-pricing-demo.ts, this script does NOT create any staff accounts
 * — it looks up your real, already-existing employees by name and attributes all the
 * generated activity (tickets created, items completed, pickups authorized,
 * assignments, payment status changes) to them, so the "Team activity" table reflects
 * actual staff names instead of a throwaway "Demo Employee" login. It expects to find:
 *
 *   Employees (PIN login): Nina DeZemplen, Autumn Vrazel, Janice Tucker, Kamila Chorieva,
 *                          Emilse Salinas, Valentina Forero
 *   Managers  (email login): Emilse Salinas, Valentina Forero  (their co-owner accounts —
 *                            used for the manager-only actions: assigning/reassigning
 *                            items and reopening a completed item)
 *
 * If any of those names don't match exactly what's in Staff accounts, the script stops
 * and tells you which one before writing anything.
 *
 * Every order this creates has a clientName prefixed "[DEMO-HIST] " — a different tag
 * from the "[DEMO] " prefix prisma/seed-pricing-demo.ts uses, so the two demo sets
 * don't collide and can each be cleared independently.
 *
 * Client names are drawn at random (deterministically — same seed every run) from
 * FIRST_NAMES x LAST_NAMES and checked against both what's already in the database
 * and what's already been picked earlier in the same run, so a run never collides
 * with — or silently skips in place of — an order that already exists. That does mean
 * re-running this on top of a *complete* prior run adds another ~200 orders rather
 * than being a no-op — this script is meant to be run once against a freshly-purged
 * database (see prisma/purge-orders-schedule-timeclock.ts), not repeatedly on top of
 * itself. If a run gets interrupted partway, the safest fix is to purge and start
 * over rather than trying to resume it.
 *
 * Run it with:   npx tsx prisma/seed-historical-demo.ts
 * Clear it with: npx tsx prisma/clear-historical-demo.ts
 * (same DATABASE_URL setup as the other seed scripts — see README § "Running locally"
 * for the local case, or run it via `railway run` to target the live database.)
 *
 * Every generated action is logged to the audit trail same as the real app, with
 * "(demo data)" appended to the summary so it's identifiable in each order's activity
 * log.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const TAG = "[DEMO-HIST]";

const EMPLOYEE_NAMES = ["Nina DeZemplen", "Autumn Vrazel", "Janice Tucker", "Kamila Chorieva", "Emilse Salinas", "Valentina Forero"];
const MANAGER_NAMES = ["Emilse Salinas", "Valentina Forero"];

const MONTHS: { year: number; month1: number }[] = [
  { year: 2026, month1: 4 }, // April
  { year: 2026, month1: 5 }, // May
  { year: 2026, month1: 6 }, // June
  { year: 2026, month1: 7 }, // July
  { year: 2026, month1: 8 }, // August
];
const ORDERS_PER_MONTH = 40;

const ITEM_TEMPLATES: { garmentType: string; alterations: string[] }[] = [
  { garmentType: "Wedding Gown", alterations: ["Hem", "Bustle", "Take In Bodice"] },
  { garmentType: "Bridesmaid Dress", alterations: ["Hem", "Adjust Straps"] },
  { garmentType: "Evening Gown / Formal Dress", alterations: ["Hem", "Take In"] },
  { garmentType: "Suit Jacket", alterations: ["Take In", "Shorten Sleeves"] },
  { garmentType: "Suit Pants", alterations: ["Taper Pants", "Cuff Adjustment"] },
  { garmentType: "Tuxedo Jacket", alterations: ["Shorten Sleeves", "Waist Adjustment"] },
  { garmentType: "Tuxedo Pants", alterations: ["Taper Pants", "Hem"] },
  { garmentType: "Vest", alterations: ["Take In"] },
  { garmentType: "Shirt / Blouse", alterations: ["Take In", "Shorten Sleeves"] },
  { garmentType: "Skirt", alterations: ["Hem", "Take In"] },
  { garmentType: "Flower Girl Dress", alterations: ["Hem"] },
];

const ALTERATION_PRICE_CENTS: Record<string, number> = {
  Hem: 3000,
  "Take In": 2800,
  "Let Out": 2800,
  Bustle: 12000,
  "Shorten Sleeves": 3000,
  "Lengthen Sleeves": 3000,
  "Adjust Straps": 1800,
  "Take In Bodice": 4500,
  "Add/Replace Buttons": 1200,
  "Add/Replace Zipper": 3500,
  "Cuff Adjustment": 1800,
  "Taper Pants": 2500,
  "Waist Adjustment": 2500,
  "Re-Line": 5000,
  "Bead/Lace Repair": 6000,
  "Press/Steam Only": 1500,
  "Custom (see notes)": 4000,
};

const COLORS = ["Ivory", "Champagne", "Navy", "Charcoal", "Emerald", "Dusty blue", "Blush", "Black", "Burgundy", "Silver"];
const SIZES = ["size 4", "size 6", "size 8", "size 10", "size 12", "42R", "40L", "38S", "M", "L"];
const FIRST_NAMES = [
  "Rachel", "Sophia", "Marcus", "Priya", "Angela", "Daniel", "Emily", "John", "Olivia", "Ethan",
  "Grace", "Lily", "Noah", "Ava", "Mia", "Liam", "Isabella", "James", "Chloe", "Benjamin",
  "Hannah", "Lucas", "Zoe", "Mason", "Ella", "Logan", "Aria", "Elijah", "Layla", "Henry",
  "Sarah", "Michael", "Jessica", "David", "Amanda", "Christopher", "Ashley", "Matthew", "Samantha", "Andrew",
  "Victoria", "Joshua", "Madison", "Ryan", "Abigail", "Nathan", "Natalie", "Tyler", "Brianna", "Jacob",
  "Kayla", "Justin", "Alexis",
];
const LAST_NAMES = [
  "Kim", "Nguyen", "Webb", "Shah", "Torres", "Brooks", "Carter", "Whitfield", "Bennett", "Foster",
  "Hayes", "Reed", "Coleman", "Price", "Sanders", "Bishop", "Wallace", "Fletcher", "Dunn", "Marsh",
  "Ramirez", "Patel", "Chen", "Diaz", "Murphy", "Rivera", "Cooper", "Richardson", "Cox", "Howard",
  "Ward", "Peterson", "Gray", "Watson", "Kelly", "Simmons", "Hicks", "Warren", "Barnes", "Ross",
];

// --- unique client-name picker ------------------------------------------------
// With ORDERS_PER_MONTH this high, picking first/last name by `index % length` (the
// original approach) cycles back to an already-used combination well before the run
// finishes — every such repeat would silently collide with the idempotency check
// below and get skipped, so the run would quietly fall short of the requested count.
// This instead draws a random (but still seeded/deterministic) combination and
// retries on collision, checked against both what's already in the database (an old
// partial run) and what's already been picked earlier in *this* run.
function pickUniqueClientName(usedNames: Set<string>): { firstName: string; lastName: string; clientName: string } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const clientName = `${TAG} ${firstName} ${lastName}`;
    if (!usedNames.has(clientName)) {
      usedNames.add(clientName);
      return { firstName, lastName, clientName };
    }
  }
  throw new Error(
    "Ran out of unique demo client names to try (50 attempts). Add more entries to FIRST_NAMES/LAST_NAMES in this script."
  );
}

// --- seeded RNG (deterministic) ----------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260401);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function chance(p: number): boolean {
  return rng() < p;
}
function pickWeighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of pairs) {
    if (r < w) return item;
    r -= w;
  }
  return pairs[pairs.length - 1][0];
}

// --- date helpers --------------------------------------------------------------
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function randomDateInMonth(year: number, month1: number): Date {
  return new Date(year, month1 - 1, randInt(1, 27), randInt(9, 17), randInt(0, 59));
}
function laterOf(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function clientToken(): string {
  return randomBytes(24).toString("base64url");
}
function fakePhone(index: number): string {
  return `615-555-${String(1000 + index).slice(-4)}`;
}

async function nextOrderNumber(): Promise<string> {
  const counter = await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: { lastNumber: { increment: 1 } },
    create: { id: 1, lastNumber: 1 },
  });
  return `JFY-${String(counter.lastNumber).padStart(6, "0")}`;
}

/** Mirrors lib/pricing.ts:recomputeOrderTotal. */
async function recomputeOrderTotal(orderId: string) {
  const result = await prisma.priceLine.aggregate({ where: { orderId }, _sum: { amountCents: true } });
  await prisma.order.update({ where: { id: orderId }, data: { totalPriceCents: result._sum.amountCents ?? 0 } });
}

/** Mirrors lib/audit.ts:logAudit, but accepts a backdated `createdAt`. */
async function logAudit(input: {
  orderId: string;
  entityType: "ORDER" | "ORDER_ITEM";
  entityId: string;
  action: string;
  summary: string;
  performedById: string;
  createdAt: Date;
}) {
  await prisma.auditLog.create({
    data: {
      orderId: input.orderId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      performedById: input.performedById,
      createdAt: input.createdAt,
    },
  });
}

type StaffRef = { id: string; name: string };

type Outcome = "in_progress" | "sealed_ready" | "picked_up_ontime" | "picked_up_late" | "reopened_then_sealed";

async function seedOrder(
  index: number,
  year: number,
  month1: number,
  employees: StaffRef[],
  managers: StaffRef[],
  usedNames: Set<string>
) {
  const { firstName, lastName, clientName } = pickUniqueClientName(usedNames);

  const createdAt = randomDateInMonth(year, month1);
  const isRush = chance(0.12);
  const creator = pick(employees);

  const itemCount = randInt(1, 3);
  const itemDefs = Array.from({ length: itemCount }, () => {
    const tmpl = pick(ITEM_TEMPLATES);
    return {
      garmentType: tmpl.garmentType,
      description: `${pick(COLORS)}, ${pick(SIZES)}`,
      alterations: tmpl.alterations,
    };
  });

  const outcome = pickWeighted<Outcome>([
    ["in_progress", 0.22],
    ["sealed_ready", 0.15],
    ["picked_up_ontime", 0.38],
    ["picked_up_late", 0.13],
    ["reopened_then_sealed", 0.12],
  ]);
  const willComplete = outcome !== "in_progress";
  const willPickup = outcome === "picked_up_ontime" || outcome === "picked_up_late" || outcome === "reopened_then_sealed";

  const workStart = addDays(createdAt, randInt(0, 3));
  const perItemCompletedAt = itemDefs.map((_, i) => addDays(workStart, randInt(2, isRush ? 5 : 9) + i));
  let sealedAt: Date | null = willComplete
    ? new Date(Math.max(...perItemCompletedAt.map((d) => d.getTime())))
    : null;

  let dueDate: Date;
  if (outcome === "picked_up_ontime") {
    dueDate = addDays(sealedAt!, randInt(0, 6));
  } else if (outcome === "picked_up_late") {
    dueDate = addDays(sealedAt!, -randInt(1, 6));
  } else if (outcome === "sealed_ready" || outcome === "reopened_then_sealed") {
    dueDate = chance(0.8) ? addDays(sealedAt!, randInt(0, 6)) : addDays(sealedAt!, -randInt(1, 6));
  } else {
    dueDate = addDays(createdAt, randInt(10, 25));
  }
  // Guard against a randomly-generated due date landing on/before intake. When this
  // order has a sealedAt, clamp to createdAt+1 (never createdAt+2) so a deliberately
  // "late" due date (due < sealedAt) can't accidentally get pushed past sealedAt and
  // flip into looking on-time — the minimum createdAt→sealedAt gap this script ever
  // generates is 2 days, so createdAt+1 is always still < sealedAt.
  if (dueDate.getTime() <= createdAt.getTime()) dueDate = addDays(createdAt, sealedAt ? 1 : 2);

  const orderNumber = await nextOrderNumber();
  const order = await prisma.order.create({
    data: {
      orderNumber,
      clientName,
      clientPhone: fakePhone(index),
      dueDate,
      isRush,
      clientToken: clientToken(),
      createdById: creator.id,
      paymentStatus: "UNPAID",
      createdAt,
      updatedAt: createdAt,
      items: {
        create: itemDefs.map((d) => ({
          garmentType: d.garmentType,
          description: d.description,
          alterations: d.alterations,
          createdAt,
          updatedAt: createdAt,
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
    performedById: creator.id,
    createdAt,
  });

  // --- pricing (so revenue trend / avg order value have real numbers) ----------
  const priceLineRows: Prisma.PriceLineCreateManyInput[] = [];
  order.items.forEach((item, i) => {
    itemDefs[i].alterations.forEach((a) => {
      priceLineRows.push({
        orderId: order.id,
        orderItemId: item.id,
        description: a,
        amountCents: ALTERATION_PRICE_CENTS[a] ?? 2500,
        source: "ALTERATION",
        createdById: creator.id,
      });
    });
  });
  if (isRush) {
    priceLineRows.push({
      orderId: order.id,
      orderItemId: null,
      description: "Rush service",
      amountCents: randInt(35, 60) * 100,
      source: "FREEFORM",
      createdById: creator.id,
    });
  }
  await prisma.priceLine.createMany({ data: priceLineRows });
  await recomputeOrderTotal(order.id);

  // --- item work progression ----------------------------------------------------
  const itemFinalStatus: ("PENDING" | "IN_PROGRESS" | "COMPLETED" | "PICKED_UP")[] = [];
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    const itemStarted = willComplete || chance(0.6);
    if (!itemStarted) {
      itemFinalStatus.push("PENDING");
      continue;
    }
    const startedAt = addDays(workStart, randInt(0, 2));
    if (!willComplete) {
      const starter = pick(employees);
      await prisma.orderItem.update({ where: { id: item.id }, data: { status: "IN_PROGRESS", startedAt } });
      await logAudit({
        orderId: order.id,
        entityType: "ORDER_ITEM",
        entityId: item.id,
        action: "STATUS_CHANGE",
        summary: `"${item.description}" marked in progress by ${starter.name} (demo data).`,
        performedById: starter.id,
        createdAt: startedAt,
      });
      itemFinalStatus.push("IN_PROGRESS");
      continue;
    }
    const completedAt = perItemCompletedAt[i];
    const completer = pick(employees);
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { status: "COMPLETED", startedAt, completedAt, completedById: completer.id },
    });
    await logAudit({
      orderId: order.id,
      entityType: "ORDER_ITEM",
      entityId: item.id,
      action: "STATUS_CHANGE",
      summary: `"${item.description}" marked completed by ${completer.name} (demo data).`,
      performedById: completer.id,
      createdAt: completedAt,
    });
    itemFinalStatus.push("COMPLETED");
  }

  // --- reopen scenario ------------------------------------------------------------
  if (outcome === "reopened_then_sealed") {
    const target = order.items[0];
    const manager = pick(managers);
    const reopenedAt = addDays(sealedAt!, randInt(1, 3));
    await prisma.orderItem.update({
      where: { id: target.id },
      data: { status: "IN_PROGRESS", completedAt: null, completedById: null, reopenedAt, reopenedById: manager.id },
    });
    await logAudit({
      orderId: order.id,
      entityType: "ORDER_ITEM",
      entityId: target.id,
      action: "ITEM_REOPENED",
      summary: `"${target.description}" reopened for more work by ${manager.name} (demo data).`,
      performedById: manager.id,
      createdAt: reopenedAt,
    });

    const refinisher = pick(employees);
    const recompletedAt = addDays(reopenedAt, randInt(1, 4));
    await prisma.orderItem.update({
      where: { id: target.id },
      data: { status: "COMPLETED", completedAt: recompletedAt, completedById: refinisher.id },
    });
    await logAudit({
      orderId: order.id,
      entityType: "ORDER_ITEM",
      entityId: target.id,
      action: "STATUS_CHANGE",
      summary: `"${target.description}" marked completed by ${refinisher.name} (demo data).`,
      performedById: refinisher.id,
      createdAt: recompletedAt,
    });
    sealedAt = laterOf(sealedAt!, recompletedAt);
  }

  if (willComplete) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "SEALED", sealedAt } });
  }

  // --- pickup ------------------------------------------------------------------
  if (willPickup) {
    const pickupDate = addDays(sealedAt!, randInt(0, 5));
    const authorizer = chance(0.75) ? pick(employees) : pick(managers);
    const pickedUpByName = `${firstName} ${lastName}`;
    for (const item of order.items) {
      await prisma.itemPickup.create({
        data: {
          orderItemId: item.id,
          pickedUpByName,
          pickedUpByPhone: fakePhone(index),
          authorizedById: authorizer.id,
          pickedUpAt: pickupDate,
        },
      });
      await prisma.orderItem.update({ where: { id: item.id }, data: { status: "PICKED_UP" } });
      await logAudit({
        orderId: order.id,
        entityType: "ORDER_ITEM",
        entityId: item.id,
        action: "PICKUP_AUTHORIZED",
        summary: `"${item.description}" picked up by ${pickedUpByName}, authorized by ${authorizer.name} (demo data).`,
        performedById: authorizer.id,
        createdAt: pickupDate,
      });
      itemFinalStatus[order.items.indexOf(item)] = "PICKED_UP";
    }
    await prisma.order.update({ where: { id: order.id }, data: { status: "PICKED_UP" } });
  }

  // --- payment progression ------------------------------------------------------
  let paymentTarget: "UNPAID" | "DEPOSIT_PAID" | "PAID";
  if (outcome === "in_progress") {
    paymentTarget = chance(0.45) ? "DEPOSIT_PAID" : "UNPAID";
  } else if (outcome === "sealed_ready") {
    paymentTarget = chance(0.5) ? "PAID" : "DEPOSIT_PAID";
  } else {
    paymentTarget = chance(0.85) ? "PAID" : "DEPOSIT_PAID";
  }
  if (paymentTarget !== "UNPAID") {
    const depositPayer = pick(employees);
    const depositDate = addDays(createdAt, randInt(0, 3));
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "DEPOSIT_PAID" } });
    await logAudit({
      orderId: order.id,
      entityType: "ORDER",
      entityId: order.id,
      action: "PAYMENT_STATUS_CHANGED",
      summary: `Payment status for ${order.orderNumber} set to DEPOSIT_PAID by ${depositPayer.name} (demo data).`,
      performedById: depositPayer.id,
      createdAt: depositDate,
    });

    if (paymentTarget === "PAID") {
      const paidPayer = pick(employees);
      let paidDate = addDays(depositDate, randInt(2, 10));
      if (sealedAt) paidDate = new Date(Math.min(paidDate.getTime(), addDays(sealedAt, 2).getTime()));
      if (paidDate.getTime() <= depositDate.getTime()) paidDate = addDays(depositDate, 1);
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
      await logAudit({
        orderId: order.id,
        entityType: "ORDER",
        entityId: order.id,
        action: "PAYMENT_STATUS_CHANGED",
        summary: `Payment status for ${order.orderNumber} set to PAID by ${paidPayer.name} (demo data).`,
        performedById: paidPayer.id,
        createdAt: paidDate,
      });
    }
  }

  // --- assignment (informational — see README § "Item assignments") ------------
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    const status = itemFinalStatus[i];
    const assignProbability = status === "PENDING" ? 0.4 : 0.8;
    if (!chance(assignProbability)) continue;

    const assignedAt = addDays(createdAt, randInt(0, 2));
    if (chance(0.55)) {
      const who = pick(employees);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { assignedToId: who.id, assignedById: who.id, assignedAt },
      });
      await logAudit({
        orderId: order.id,
        entityType: "ORDER_ITEM",
        entityId: item.id,
        action: "ITEM_ASSIGNED",
        summary: `"${item.description}" picked up by ${who.name} (demo data).`,
        performedById: who.id,
        createdAt: assignedAt,
      });
    } else {
      const mgr = pick(managers);
      const who = pick(employees);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { assignedToId: who.id, assignedById: mgr.id, assignedAt },
      });
      await logAudit({
        orderId: order.id,
        entityType: "ORDER_ITEM",
        entityId: item.id,
        action: "ITEM_ASSIGNED",
        summary: `"${item.description}" assigned to ${who.name} by ${mgr.name} (demo data).`,
        performedById: mgr.id,
        createdAt: assignedAt,
      });
    }
  }

  console.log(`Created ${orderNumber} — ${clientName} (${outcome}, ${paymentTarget})`);
}

async function main() {
  const employees: StaffRef[] = [];
  for (const name of EMPLOYEE_NAMES) {
    const u = await prisma.user.findFirst({ where: { name, role: "EMPLOYEE", active: true } });
    if (!u) {
      throw new Error(
        `Could not find an active EMPLOYEE account named "${name}" in Staff accounts. Check the exact ` +
          `spelling/capitalization there (or edit EMPLOYEE_NAMES in this script) and re-run.`
      );
    }
    employees.push({ id: u.id, name: u.name });
  }

  const managers: StaffRef[] = [];
  for (const name of MANAGER_NAMES) {
    const u = await prisma.user.findFirst({ where: { name, role: "MANAGER", active: true } });
    if (!u) {
      throw new Error(
        `Could not find an active MANAGER account named "${name}" in Staff accounts. Check the exact ` +
          `spelling/capitalization there (or edit MANAGER_NAMES in this script) and re-run.`
      );
    }
    managers.push({ id: u.id, name: u.name });
  }

  console.log(`Found ${employees.length} employee account(s) and ${managers.length} manager account(s). Seeding...\n`);

  // Seed usedNames with anything already in the database under this tag (e.g. left
  // over from an earlier partial run) so a fresh run never collides with — or
  // silently re-skips — orders that already exist.
  const existingDemoOrders = await prisma.order.findMany({
    where: { clientName: { startsWith: TAG } },
    select: { clientName: true },
  });
  const usedNames = new Set(existingDemoOrders.map((o) => o.clientName));

  let index = 0;
  for (const { year, month1 } of MONTHS) {
    for (let i = 0; i < ORDERS_PER_MONTH; i++) {
      await seedOrder(index, year, month1, employees, managers, usedNames);
      index++;
    }
  }

  console.log(`\nDone. ${index} order slot(s) processed (existing ones were skipped).`);
  console.log('All of it is prefixed "[DEMO-HIST]" in the order list — run "npx tsx prisma/clear-historical-demo.ts" to remove it later.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
