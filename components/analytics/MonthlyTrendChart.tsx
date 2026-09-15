"use client";

/**
 * A real time-series chart for "revenue by month" — replacing the old approach of
 * rendering each month as its own horizontal bar-meter row. That form is right for a
 * ranked list (see BarRow/BarListCard, still used everywhere that genuinely IS a
 * ranking — revenue by alteration, garment mix, etc.), but a month-over-month trend is a
 * chronological story, meant to be read left-to-right, not top-to-bottom as a stack of
 * bar lengths. A line chart makes the shape of the trend — a slow month, a growth
 * streak, seasonality — visible in one glance instead of requiring the reader to scan
 * every row and do the comparison themselves.
 *
 * Single series, so per the dataviz color rules this stays in the brand's own `thread`
 * accent (a sequential/single-hue chart needs no legend — the card's title already says
 * what's plotted) rather than reaching for the chart-only categorical colors, which are
 * reserved for charts with 2+ real series (see CategoricalCompositionCard,
 * PairedComparisonCard).
 */

import { useState } from "react";
import { formatCents } from "@/lib/money";

export type TrendPoint = {
  month: string;
  label: string;
  /** The value the line plots (revenue, in cents). */
  valueCents: number;
  /** Extra context shown only in the hover tooltip, e.g. "12 orders · 3.2d avg turnaround". */
  meta: string;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 16 };

/** Rounds `max` up to a "clean" gridline value (nearest 1/2/5 × a power of ten) — the
 * same rounding a hand-drawn axis would use, so gridline labels read as $500/$1,000
 * rather than some arbitrary fraction of the tallest bar. */
function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Compact axis-label formatting ($1.2k, $400) — formatCents' full "$1234.00" is too
 * long for a gridline label; only used here, never for a value a manager needs exact. */
function compactDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars === 0) return "$0";
  if (dollars >= 1000) {
    const thousands = dollars / 1000;
    // Drop a trailing ".0" ($5k, not $5.0k) but keep one decimal where it's informative ($5.4k).
    const rounded = dollars >= 10000 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `$${rounded}k`;
  }
  return `$${Math.round(dollars)}`;
}

export function MonthlyTrendChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle?: string;
  points: TrendPoint[];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-linen bg-white p-5">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-3 text-sm text-charcoal/40">No data yet for this range.</p>
      </div>
    );
  }

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxValue = niceCeiling(Math.max(1, ...points.map((p) => p.valueCents)));

  function xFor(i: number) {
    return points.length === 1 ? PAD.left + innerWidth / 2 : PAD.left + (i / (points.length - 1)) * innerWidth;
  }
  function yFor(valueCents: number) {
    return PAD.top + (1 - valueCents / maxValue) * innerHeight;
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.valueCents)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${PAD.top + innerHeight} L ${xFor(0)} ${PAD.top + innerHeight} Z`;

  const gridSteps = [0, 0.5, 1];
  const last = points[points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  // Skip every-other label once there are more months than comfortably fit (Pricing's
  // 12-month default) so labels don't collide — the hover tooltip still carries every
  // month's exact value regardless of which labels are visibly printed.
  const labelEvery = points.length > 8 ? 2 : 1;

  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{title}</p>
          {subtitle && <p className="text-[11px] text-charcoal/40">{subtitle}</p>}
        </div>
        <p className="whitespace-nowrap font-display text-lg text-ink">{formatCents(last.valueCents)}</p>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`${title} — line chart by month`}>
          {/* Recessive gridlines, one step off the card's white surface — never dashed. */}
          {gridSteps.map((step) => {
            const y = PAD.top + (1 - step) * innerHeight;
            return (
              <g key={step}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="#DAD0D2" strokeWidth={1} />
                {/* Only the two extremes get a tick label (not every gridline) — since
                    only the most recent month is directly labeled above the chart, these
                    keep the rest of the scale legible without crowding the card. */}
                {(step === 0 || step === 1) && (
                  <text x={PAD.left} y={y - 4} fontSize={9} fill="#4A383D" fillOpacity={0.45}>
                    {compactDollars(step === 1 ? maxValue : 0)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Area wash under the line — ~10% opacity, never a saturated fill. */}
          <path d={areaPath} fill="#8A4A56" fillOpacity={0.1} stroke="none" />

          {/* The line itself, 2px, round joins. */}
          <path d={linePath} fill="none" stroke="#8A4A56" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Markers + hover targets, one per month. */}
          {points.map((p, i) => {
            const x = xFor(i);
            const y = yFor(p.valueCents);
            const isHovered = hoverIndex === i;
            return (
              <g key={p.month}>
                {isHovered && (
                  <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + innerHeight} stroke="#4A383D" strokeOpacity={0.25} strokeWidth={1} />
                )}
                <circle cx={x} cy={y} r={isHovered ? 5 : 4} fill="#8A4A56" stroke="#FFFFFF" strokeWidth={2} />
                {/* Larger, invisible hit target — easier to hover accurately than the 8px dot alone. */}
                <rect
                  x={x - innerWidth / Math.max(points.length, 1) / 2}
                  y={PAD.top}
                  width={innerWidth / Math.max(points.length, 1)}
                  height={innerHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                />
                {i % labelEvery === 0 && (
                  // Just the month abbreviation ("Sep") on the axis — the full label
                  // with year is in the hover tooltip, so the axis stays uncluttered.
                  <text x={x} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="#4A383D" fillOpacity={0.6}>
                    {p.label.split(" ")[0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-linen bg-white px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(xFor(hoverIndex!) / WIDTH) * 100}%` }}
          >
            <p className="font-medium text-ink">{hovered.label}</p>
            <p className="text-charcoal/70">{formatCents(hovered.valueCents)}</p>
            <p className="text-[11px] text-charcoal/50">{hovered.meta}</p>
          </div>
        )}
      </div>
    </div>
  );
}
