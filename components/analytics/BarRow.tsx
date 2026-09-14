/**
 * One labeled horizontal bar (a value against a shared max) — the same visual building
 * block Overview already uses inline for its trend/breakdown cards, pulled out here so
 * Employees/Pricing/Garments can build their own bar lists without re-deriving the same
 * few lines of markup each time.
 */
export function BarRow({
  label,
  valueLabel,
  pct,
}: {
  label: string;
  valueLabel: string;
  /** 0-100, already computed by the caller (against whatever "max" makes sense there). */
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-charcoal/60">
        <span className="font-medium text-ink">{label}</span>
        <span>{valueLabel}</span>
      </div>
      <div className="h-2 rounded-full bg-linen">
        <div className="h-2 rounded-full bg-thread" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

/** A titled white card wrapping a vertical stack of BarRows — the shared shell for
 * "revenue by X" / "trend by month" style cards across the analytics pages. */
export function BarListCard({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Shown instead of `children` when the caller has nothing to plot. */
  empty?: string;
}) {
  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="text-sm font-medium text-ink">{title}</p>
      {subtitle && <p className="mb-3 text-[11px] text-charcoal/40">{subtitle}</p>}
      {empty ? <p className="text-sm text-charcoal/40">{empty}</p> : <div className={`space-y-3 ${subtitle ? "" : "mt-3"}`}>{children}</div>}
    </div>
  );
}
