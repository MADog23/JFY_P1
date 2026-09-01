/**
 * All prices are stored as integer cents (PriceLine.amountCents, Order.totalPriceCents)
 * to avoid floating-point drift. These helpers are the only place formatting/parsing
 * should happen so the rest of the app never touches a raw dollar float.
 */

export function formatCents(cents: number | null | undefined): string {
  const value = ((cents ?? 0) / 100).toFixed(2);
  return `$${value}`;
}

/**
 * Parses a dollar-amount input string (what an employee typed into a price field)
 * into integer cents. Returns null for blank/unparseable input so callers can treat
 * "left blank" as "don't save a line" rather than as $0.
 */
export function parseDollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
