/**
 * Shared stat tile for the analytics pages — same visual as Overview's local StatCard
 * (app/manager/analytics/page.tsx), pulled out here so Employees/Pricing/Garments share
 * one definition instead of three near-identical copies. Overview's own copy is left
 * exactly as it was rather than switched over to this — no reason to touch a page the
 * user asked to keep as-is.
 */
export function StatCard({
  label,
  value,
  accent,
  sublabel,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-charcoal/50">{label}</p>
      <p className={`mt-1 font-display text-3xl ${accent ? "text-alert" : "text-ink"}`}>{value}</p>
      {sublabel && <p className="mt-1 text-[11px] text-charcoal/40">{sublabel}</p>}
    </div>
  );
}
