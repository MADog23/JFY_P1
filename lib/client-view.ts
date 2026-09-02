import "server-only";
import { db } from "./db";

/**
 * CLIENT-VIEW REDACTION POLICY
 * ----------------------------
 * This app's focus is the shop's own operations, not the client experience — the brief
 * asks us to err toward *withholding* anything debatable. What the public /track/[token]
 * page is allowed to show is an explicit allow-list, not the raw records:
 *
 *   SHOWN:  order number, due date, overall order status, and per item: a plain
 *           garment label, its description (freeform text entered at intake — e.g.
 *           "Bridesmaid dress — Priya"; helps a client tell apart several similar
 *           items on one order), status (not started / in progress / ready for
 *           pickup / picked up), and the pickup date if applicable.
 *   HIDDEN: client contact details (they already know their own info), pickup contact
 *           info, internal working notes, measurements, staff names (including who
 *           picked an item up — that's for internal accountability, not the client),
 *           payment/pricing status, images, and the audit log.
 *
 * If you're ever unsure whether a new field belongs here, leave it out and surface it
 * through the employee/manager apps instead.
 */
export async function getPublicOrderView(token: string) {
  const order = await db.order.findUnique({
    where: { clientToken: token },
    select: {
      orderNumber: true,
      status: true,
      dueDate: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          garmentType: true,
          description: true,
          status: true,
          pickup: { select: { pickedUpAt: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    dueDate: order.dueDate,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      garmentType: item.garmentType,
      description: item.description,
      status: item.status,
      pickedUpAt: item.pickup?.pickedUpAt ?? null,
    })),
  };
}

// Order numbers are handed out as "JFY-000123" (see lib/order-number.ts), but a client
// typing one in from a receipt might drop the prefix, the padding, or the dash, or get
// the letters lowercase. Reconstruct the canonical form from whatever digits we find so
// "123", "000123", "jfy123", and "JFY-000123" all resolve the same way.
function normalizeOrderNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return input.trim().toUpperCase();
  return `JFY-${digits.padStart(6, "0")}`;
}

// Phone numbers are stored at intake as whatever the client typed (see actions/orders.ts)
// with no format enforced, so comparison has to be format-blind too. Strip everything but
// digits and compare the last 10 (a US number with or without a leading country code "1"
// still matches).
function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Public order lookup — the "I don't have my link" fallback for a client who only has
 * their order number and phone number (see app/track/page.tsx). This is the ONLY thing
 * it returns on a match: the existing clientToken, which just routes them into the same
 * redacted /track/[token] view above — it never hands back any order field directly, so
 * it can't be used to fish for details about an order that isn't the caller's.
 *
 * Deliberately returns null (a flat "no match") for a wrong order number, a wrong phone,
 * or an inactive/nonexistent order alike — it never says which part was wrong, so a
 * guesser gets no more signal than "not found" either way.
 */
export async function lookupClientToken(orderNumberRaw: string, phoneRaw: string): Promise<string | null> {
  const orderNumber = normalizeOrderNumber(orderNumberRaw);
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { clientToken: true, clientPhone: true, pickupContactPhone: true },
  });
  if (!order) return null;

  const onFile = [order.clientPhone, order.pickupContactPhone].filter(Boolean) as string[];
  const matches = onFile.some((candidate) => normalizePhone(candidate) === phone);
  if (!matches) return null;

  return order.clientToken;
}
