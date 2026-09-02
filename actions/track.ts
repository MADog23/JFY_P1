"use server";

import { redirect } from "next/navigation";
import { lookupClientToken } from "@/lib/client-view";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import type { ActionResult } from "./auth";

// Intentionally NOT gated by requireSession()/requireManager() — this is the public,
// unauthenticated counterpart to /track/[token] (see lib/client-view.ts), for a client
// who has their order number and phone number but not their tracking link.
export async function lookupOrder(orderNumber: string, phone: string): Promise<ActionResult> {
  if (!orderNumber.trim() || !phone.trim()) {
    return { ok: false, error: "Enter your order number and phone number." };
  }

  const ip = getClientIp();
  if (isRateLimited(`track-lookup:${ip}`)) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const token = await lookupClientToken(orderNumber, phone);
  if (!token) {
    return {
      ok: false,
      error: "We couldn't find a match. Double-check your order number and phone number, or contact the shop.",
    };
  }

  redirect(`/track/${token}`);
}
