const ORDER_STYLES: Record<string, string> = {
  IN_PROGRESS: "bg-brass/15 text-thread border-brass/40",
  SEALED: "bg-sage/15 text-sage border-sage/40",
  PICKED_UP: "bg-charcoal/10 text-charcoal border-charcoal/30",
  CANCELLED: "bg-alert/10 text-alert border-alert/40",
};

const ITEM_STYLES: Record<string, string> = {
  PENDING: "bg-charcoal/10 text-charcoal border-charcoal/30",
  IN_PROGRESS: "bg-brass/15 text-thread border-brass/40",
  COMPLETED: "bg-sage/15 text-sage border-sage/40",
  PICKED_UP: "bg-ink/10 text-ink border-ink/30",
};

const LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SEALED: "Completed — sealed",
  PICKED_UP: "Picked up",
  PENDING: "Not started",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status, kind = "order" }: { status: string; kind?: "order" | "item" }) {
  const styles = kind === "order" ? ORDER_STYLES : ITEM_STYLES;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? "bg-charcoal/10 text-charcoal border-charcoal/30"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
