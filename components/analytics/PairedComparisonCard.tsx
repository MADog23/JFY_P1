/**
 * A genuine "before vs. after per item" comparison — right now just Employees'
 * "Scheduled vs. worked, by week." Previously rendered as two same-colored BarRows
 * stacked per week, which shows both numbers but leaves the actual comparison (did this
 * week run over or under schedule?) as homework for the reader. Two fixed colors, one
 * legend for the whole card (never per row — a legend belongs once, not repeated), so
 * the two bars read as a pair at a glance.
 *
 * Uses the chart-only categorical colors (see tailwind.config.ts), not the brand's own
 * thread/brass — this is a genuine 2-series identity comparison, the one thing the
 * muted brand palette doesn't have enough contrast to do safely. Always wine (slot 1)
 * for the first series, gold (slot 2) for the second — never reordered.
 */
export function PairedComparisonLegend({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="mb-3 flex items-center gap-4 text-[11px] text-charcoal/60">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-chartWine" />
        {labelA}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-chartGold" />
        {labelB}
      </span>
    </div>
  );
}

export function PairedBarPair({
  groupLabel,
  valueA,
  valueB,
  valueLabelA,
  valueLabelB,
  max,
  note,
}: {
  groupLabel: string;
  valueA: number;
  valueB: number;
  valueLabelA: string;
  valueLabelB: string;
  max: number;
  /** e.g. "+2.5h OT" — shown next to the group label, same red-flag color as before. */
  note?: React.ReactNode;
}) {
  const pctA = max > 0 ? Math.min(100, (valueA / max) * 100) : 0;
  const pctB = max > 0 ? Math.min(100, (valueB / max) * 100) : 0;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">
        {groupLabel}
        {note && <span className="ml-2">{note}</span>}
      </p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-linen">
            <div className="h-2 rounded-full bg-chartWine" style={{ width: `${pctA}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] text-charcoal/60">{valueLabelA}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-linen">
            <div className="h-2 rounded-full bg-chartGold" style={{ width: `${pctB}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] text-charcoal/60">{valueLabelB}</span>
        </div>
      </div>
    </div>
  );
}
