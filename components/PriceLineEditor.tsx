"use client";

import { useState, useTransition } from "react";
import { addPriceLine, updatePriceLine, deletePriceLine } from "@/actions/pricing";
import { formatCents, parseDollarsToCents } from "@/lib/money";

/**
 * Manager-only building blocks for editing itemized pricing after an order exists.
 * Shared between ItemCard (per-item price lines) and OrderProfile (order-level lines
 * not tied to any item, e.g. a rush fee). Both callers are expected to already be
 * gated on role === "MANAGER" before rendering these — the underlying server actions
 * enforce that independently, but there's no reason to show the controls to an
 * employee who could never successfully call them.
 */

export function PriceLineRow({ line }: { line: any }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState((line.amountCents / 100).toFixed(2));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-2 text-sm">
        <div>
          <span className="text-ink">{line.description}</span>
          <span className="ml-2 text-[11px] text-charcoal/40">
            {line.updatedBy ? `edited by ${line.updatedBy.name}` : `added by ${line.createdBy?.name}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink">{formatCents(line.amountCents)}</span>
          <button
            onClick={() => setEditing(true)}
            className="focus-ring rounded px-2 py-1 text-xs text-thread hover:underline"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 py-2">
      {error && <p className="text-[11px] text-alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus-ring min-w-0 flex-1 rounded-lg border border-linen bg-white px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-charcoal/50">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="focus-ring w-20 rounded-lg border border-linen bg-white px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-1">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const amountCents = parseDollarsToCents(amount);
              if (amountCents === null) return setError("Enter a valid amount.");
              const r = await updatePriceLine(line.id, description, amountCents);
              if (r.ok) setEditing(false);
              else setError(r.error || "Could not save.");
            })
          }
          className="focus-ring rounded bg-ink px-3 py-1 text-xs text-cream"
        >
          Save
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            if (!confirm(`Remove the "${line.description}" price line?`)) return;
            startTransition(async () => {
              const r = await deletePriceLine(line.id);
              if (!r.ok) setError(r.error || "Could not delete.");
            });
          }}
          className="focus-ring rounded border border-alert/40 px-3 py-1 text-xs text-alert hover:bg-alert/10"
        >
          Delete
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setDescription(line.description);
            setAmount((line.amountCents / 100).toFixed(2));
            setError(null);
          }}
          className="focus-ring rounded border border-linen px-3 py-1 text-xs text-charcoal/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AddPriceLineForm({
  orderId,
  orderItemId,
  placeholder = "Add a price line…",
}: {
  orderId: string;
  orderItemId: string | null;
  placeholder?: string;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-t border-brass/20 pt-2">
      {error && <p className="mb-1 text-[11px] text-alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={placeholder}
          className="focus-ring flex-1 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-charcoal/50">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="focus-ring w-20 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={isPending || !description.trim()}
          onClick={() =>
            startTransition(async () => {
              const amountCents = parseDollarsToCents(amount);
              if (amountCents === null) return setError("Enter a valid amount.");
              const r = await addPriceLine(orderId, orderItemId, description, amountCents);
              if (r.ok) {
                setDescription("");
                setAmount("");
              } else setError(r.error || "Could not add price line.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-3 py-1.5 text-xs text-cream disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
