/**
 * For a breakdown whose categories are a PIPELINE, not unrelated groups — order status
 * (in progress -> ready for pickup -> picked up), item status, payment status, or a
 * price-bucket distribution (Under $25 -> $400+). Swapping the order of these categories
 * would change what they mean, which is exactly the dataviz "ordinal" case: one hue,
 * graduated lightness, rather than a distinct color per stage (that's for unrelated
 * categories — see CategoricalCompositionCard). The gradient reads as "how far along,"
 * which fits a status/stage breakdown better than a rainbow ever would.
 *
 * `stages` must already be in pipeline order — this component doesn't sort them.
 */
export function OrdinalBreakdownCard({
  title,
  subtitle,
  stages,
}: {
  title: string;
  subtitle?: string;
  stages: { key: string; label: string; count: number }[];
}) {
  const total = stages.reduce((sum, s) => sum + s.count, 0) || 1;

  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <p className="text-sm font-medium text-ink">{title}</p>
      {subtitle && <p className="mb-3 text-[11px] text-charcoal/40">{subtitle}</p>}
      <div className={`space-y-2 ${subtitle ? "" : "mt-3"}`}>
        {stages.map((s, i) => {
          const pct = Math.round((s.count / total) * 100);
          // 0.32 -> 1.0 opacity across the stages, so the first stage is still clearly
          // visible (never near-invisible) while the last stage reads as full-strength.
          const opacity = stages.length > 1 ? 0.32 + (i / (stages.length - 1)) * 0.68 : 1;
          return (
            <div key={s.key}>
              <div className="mb-1 flex justify-between text-xs text-charcoal/60">
                <span>{s.label}</span>
                <span>{s.count}</span>
              </div>
              <div className="h-2 rounded-full bg-linen">
                <div className="h-2 rounded-full bg-thread" style={{ width: `${pct}%`, opacity }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
