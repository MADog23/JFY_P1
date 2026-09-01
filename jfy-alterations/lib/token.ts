import "server-only";
import { randomBytes } from "crypto";

/** URL-safe token for the public client tracking link. No expiration by design (see README). */
export function generateClientToken(): string {
  return randomBytes(24).toString("base64url");
}
