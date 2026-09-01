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
 *           garment label + status (not started / in progress / ready for pickup /
 *           picked up) + the pickup date if applicable.
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
      status: item.status,
      pickedUpAt: item.pickup?.pickedUpAt ?? null,
    })),
  };
}
