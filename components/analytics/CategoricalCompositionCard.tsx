/**
 * For a genuinely nominal breakdown — categories that aren't a sequence, where swapping
 * their order wouldn't change what they mean. Right now that's exactly one place:
 * "revenue composition" (standard alterations / custom instructions / write-in charges)
 * — three real, unordered charge types, unlike the pipeline-shaped breakdowns that use
 * OrdinalBreakdownCard instead. Takes up to 3 segments and assigns the validated
 * chart-only colors in a fixed order (wine, gold, teal — see tailwind.config.ts) with a
 * legend, since 2+ series always needs one.
 */
export function CategoricalCompositionCard({
  title,
  subtitle,
  segments,
  valueLabel,
}: {
  title: string;
  subtitle?: string;
  segments: { key: string; label: string; value: number; valueLabel: string }[];
  /** Shown once, top-right — the composition's total (e.g. total revenue). */
  valueLabel?: string;
}) {
  const COLORS = ["bg-chartWine", "bg-chartGold", "bg-chartTeal"] as const;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{title}</p>
        {valueLabel && <span className="whitespace-nowrap font-display text-base text-ink">{valueLabel}</span>}
      </div>
      {subtitle && <p className="mb-3 text-[11px] text-charcoal/40">{subtitle}</p>}

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-charcoal/60">
        {segments.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${COLORS[i % COLORS.length]}`} />
            {s.label}
          </span>
        ))}
      </div>

      {/* One continuous stacked bar (part-to-whole), each segment separated by a 2px
          surface gap rather than a border, so neighbors read as distinct without adding
          border ink that isn't data. */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-linen">
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={s.key}
              className={`${COLORS[i % COLORS.length]} ${i > 0 ? "ml-0.5" : ""}`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex justify-between text-xs text-charcoal/60">
            <span>{s.label}</span>
            <span>{s.valueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
