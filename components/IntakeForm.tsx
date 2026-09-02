"use client";

import { useId, useState, useTransition } from "react";
import { createIntakeTicket } from "@/actions/orders";
import { parseDollarsToCents, formatCents } from "@/lib/money";

type PriceLineSource = "ALTERATION" | "CUSTOM_INSTRUCTIONS" | "FREEFORM";

type PriceLineDraft = {
  key: string;
  description: string;
  amount: string; // raw text as typed; parsed to cents at submit time
  source: PriceLineSource;
};

type ItemDraft = {
  garmentType: string;
  description: string;
  alterations: string[];
  alterationsCustom: string;
  priceLines: PriceLineDraft[];
};

const emptyItem = (): ItemDraft => ({
  garmentType: "",
  description: "",
  alterations: [],
  alterationsCustom: "",
  priceLines: [],
});

function freeformKey() {
  return `freeform:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/**
 * Regenerates an item's auto price rows (one per selected alteration, one for the
 * custom-instructions text if present) from its current alterations/alterationsCustom,
 * preserving any amount already typed for a row that's still there, and preserving
 * freeform rows the employee added by hand untouched. Called when moving from the
 * details step to the pricing step, so pricing always reflects the latest selections.
 */
function syncItemPriceLines(item: ItemDraft): PriceLineDraft[] {
  const byKey = new Map(item.priceLines.map((pl) => [pl.key, pl]));
  const next: PriceLineDraft[] = [];

  for (const alteration of item.alterations) {
    const key = `alteration:${alteration}`;
    const prior = byKey.get(key);
    next.push({ key, description: alteration, amount: prior?.amount ?? "", source: "ALTERATION" });
  }

  const custom = item.alterationsCustom.trim();
  if (custom) {
    const key = "custom-instructions";
    const prior = byKey.get(key);
    const label = custom.length > 60 ? `${custom.slice(0, 60)}…` : custom;
    next.push({
      key,
      description: `Custom: ${label}`,
      amount: prior?.amount ?? "",
      source: "CUSTOM_INSTRUCTIONS",
    });
  }

  for (const pl of item.priceLines) {
    if (pl.source === "FREEFORM") next.push(pl);
  }

  return next;
}

function draftLinesToPayload(lines: PriceLineDraft[]) {
  return lines
    .map((pl) => {
      const amountCents = parseDollarsToCents(pl.amount);
      if (amountCents === null) return null; // left blank — don't save a line at all
      const description = pl.description.trim() || "Additional charge";
      return { description, amountCents, source: pl.source };
    })
    .filter((pl): pl is { description: string; amountCents: number; source: PriceLineSource } => pl !== null);
}

export default function IntakeForm({
  garmentTypes,
  alterationTypes,
}: {
  garmentTypes: string[];
  alterationTypes: string[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isRush, setIsRush] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [orderPriceLines, setOrderPriceLines] = useState<PriceLineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function toggleAlteration(index: number, label: string) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const has = it.alterations.includes(label);
        return {
          ...it,
          alterations: has ? it.alterations.filter((a) => a !== label) : [...it.alterations, label],
        };
      })
    );
  }

  function goToPricing() {
    if (!clientName.trim() || !clientPhone.trim()) {
      setError("Client name and phone are required.");
      return;
    }
    if (items.some((it) => !it.garmentType || !it.description.trim())) {
      setError("Every item needs a garment type and description.");
      return;
    }
    setError(null);
    setItems((prev) => prev.map((it) => ({ ...it, priceLines: syncItemPriceLines(it) })));
    setStep(2);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createIntakeTicket({
        clientName,
        clientPhone,
        clientEmail,
        pickupContactName,
        pickupContactPhone,
        dueDate,
        isRush,
        items: items.map((it) => ({
          garmentType: it.garmentType,
          description: it.description,
          alterations: it.alterations,
          alterationsCustom: it.alterationsCustom,
          priceLines: draftLinesToPayload(it.priceLines),
        })),
        orderPriceLines: draftLinesToPayload(orderPriceLines),
      });
      if (result && !result.ok) setError(result.error);
    });
  }

  const grandTotalCents =
    items.reduce(
      (sum, it) => sum + it.priceLines.reduce((s, pl) => s + (parseDollarsToCents(pl.amount) ?? 0), 0),
      0
    ) + orderPriceLines.reduce((s, pl) => s + (parseDollarsToCents(pl.amount) ?? 0), 0);

  if (step === 2) {
    return (
      <PricingStep
        items={items}
        setItems={setItems}
        orderPriceLines={orderPriceLines}
        setOrderPriceLines={setOrderPriceLines}
        grandTotalCents={grandTotalCents}
        error={error}
        isPending={isPending}
        onBack={() => setStep(1)}
        onSubmit={submit}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        goToPricing();
      }}
      className="space-y-8"
    >
      {error && (
        <p className="rounded-lg border border-alert/30 bg-alert/10 px-4 py-2 text-sm text-alert">{error}</p>
      )}

      <section className="rounded-2xl border border-linen bg-white p-6">
        <h2 className="mb-4 font-display text-lg text-ink">Client &amp; pickup contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" required value={clientName} onChange={setClientName} />
          <Field label="Client phone" required value={clientPhone} onChange={setClientPhone} />
          <Field label="Client email (optional)" value={clientEmail} onChange={setClientEmail} type="email" />
          <Field label="Promise / due date (optional)" value={dueDate} onChange={setDueDate} type="date" />
          <Field
            label="Pickup contact name (if different)"
            value={pickupContactName}
            onChange={setPickupContactName}
          />
          <Field
            label="Pickup contact phone (if different)"
            value={pickupContactPhone}
            onChange={setPickupContactPhone}
          />
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-charcoal/70">
          <input
            type="checkbox"
            checked={isRush}
            onChange={(e) => setIsRush(e.target.checked)}
            className="focus-ring h-4 w-4 rounded border-linen"
          />
          Rush order
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Items in this order</h2>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
            className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm text-thread hover:bg-linen"
          >
            + Add another item
          </button>
        </div>

        {items.map((item, index) => (
          <div key={index} className="rounded-2xl border border-linen bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-charcoal/50">
                Item {index + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="text-xs text-alert hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`item-garment-type-${index}`}
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60"
                >
                  Garment type
                </label>
                <select
                  id={`item-garment-type-${index}`}
                  required
                  value={item.garmentType}
                  onChange={(e) => updateItem(index, { garmentType: e.target.value })}
                  className="focus-ring w-full rounded-lg border border-linen bg-cream px-3 py-2"
                >
                  <option value="">Select…</option>
                  {garmentTypes.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                label="Item description (color, brand, distinguishing detail)"
                required
                value={item.description}
                onChange={(v) => updateItem(index, { description: v })}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
                Desired alterations
              </label>
              <div className="flex flex-wrap gap-2">
                {alterationTypes.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => toggleAlteration(index, a)}
                    className={`focus-ring rounded-full border px-3 py-1.5 text-sm transition ${
                      item.alterations.includes(a)
                        ? "border-thread bg-thread text-cream"
                        : "border-linen bg-cream text-charcoal/70 hover:border-thread/50"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Additional instructions (optional) — measurements come later in the working profile"
                value={item.alterationsCustom}
                onChange={(e) => updateItem(index, { alterationsCustom: e.target.value })}
                className="focus-ring mt-3 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>
        ))}
      </section>

      <button
        type="submit"
        className="focus-ring w-full rounded-xl bg-ink py-3 text-sm font-medium text-cream sm:w-auto sm:px-8"
      >
        Continue to pricing →
      </button>
      <p className="text-xs text-charcoal/50">
        Next you'll enter itemized pricing, receipt-style — that step is optional and can be left blank.
        Once the ticket is created, the client/item details above are locked and the itemized pricing
        becomes manager-only. You'll be able to add notes, measurements, and mark progress right away.
      </p>
    </form>
  );
}

function PricingStep({
  items,
  setItems,
  orderPriceLines,
  setOrderPriceLines,
  grandTotalCents,
  error,
  isPending,
  onBack,
  onSubmit,
}: {
  items: ItemDraft[];
  setItems: React.Dispatch<React.SetStateAction<ItemDraft[]>>;
  orderPriceLines: PriceLineDraft[];
  setOrderPriceLines: React.Dispatch<React.SetStateAction<PriceLineDraft[]>>;
  grandTotalCents: number;
  error: string | null;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  function updateItemLine(itemIndex: number, lineKey: string, patch: Partial<PriceLineDraft>) {
    setItems((prev) =>
      prev.map((it, i) =>
        i !== itemIndex
          ? it
          : { ...it, priceLines: it.priceLines.map((pl) => (pl.key === lineKey ? { ...pl, ...patch } : pl)) }
      )
    );
  }

  function addFreeformItemLine(itemIndex: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i !== itemIndex
          ? it
          : {
              ...it,
              priceLines: [...it.priceLines, { key: freeformKey(), description: "", amount: "", source: "FREEFORM" }],
            }
      )
    );
  }

  function removeItemLine(itemIndex: number, lineKey: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i !== itemIndex ? it : { ...it, priceLines: it.priceLines.filter((pl) => pl.key !== lineKey) }
      )
    );
  }

  function updateOrderLine(lineKey: string, patch: Partial<PriceLineDraft>) {
    setOrderPriceLines((prev) => prev.map((pl) => (pl.key === lineKey ? { ...pl, ...patch } : pl)));
  }

  function addOrderLine() {
    setOrderPriceLines((prev) => [...prev, { key: freeformKey(), description: "", amount: "", source: "FREEFORM" }]);
  }

  function removeOrderLine(lineKey: string) {
    setOrderPriceLines((prev) => prev.filter((pl) => pl.key !== lineKey));
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-alert/30 bg-alert/10 px-4 py-2 text-sm text-alert">{error}</p>
      )}

      <div>
        <h2 className="font-display text-lg text-ink">Itemized pricing</h2>
        <p className="mt-1 text-sm text-charcoal/60">
          Enter a price for whatever's decided now — leave anything unsure blank, a manager can fill it in
          or fix it later. Once this ticket is created, only a manager can view or edit pricing.
        </p>
      </div>

      {items.map((item, index) => (
        <section key={index} className="rounded-2xl border border-linen bg-white p-6">
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wide text-charcoal/50">{item.garmentType}</p>
            <p className="font-display text-lg text-ink">{item.description}</p>
          </div>

          <div className="divide-y divide-linen">
            {item.priceLines.length === 0 && (
              <p className="py-3 text-sm text-charcoal/40">No alterations selected for this item yet.</p>
            )}
            {item.priceLines.map((pl) => (
              <PriceLineRow
                key={pl.key}
                line={pl}
                editableDescription={pl.source === "FREEFORM"}
                onChange={(patch) => updateItemLine(index, pl.key, patch)}
                onRemove={pl.source === "FREEFORM" ? () => removeItemLine(index, pl.key) : undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => addFreeformItemLine(index)}
            className="focus-ring mt-3 rounded-lg border border-dashed border-linen bg-cream px-3 py-1.5 text-xs text-charcoal/60 hover:border-thread/50"
          >
            + Add a charge for this item
          </button>
        </section>
      ))}

      <section className="rounded-2xl border border-linen bg-white p-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Charges not tied to one item (e.g. rush fee)
        </p>
        {orderPriceLines.length === 0 && <p className="mb-3 text-sm text-charcoal/40">None added.</p>}
        <div className="divide-y divide-linen">
          {orderPriceLines.map((pl) => (
            <PriceLineRow
              key={pl.key}
              line={pl}
              editableDescription
              onChange={(patch) => updateOrderLine(pl.key, patch)}
              onRemove={() => removeOrderLine(pl.key)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addOrderLine}
          className="focus-ring mt-3 rounded-lg border border-dashed border-linen bg-cream px-3 py-1.5 text-xs text-charcoal/60 hover:border-thread/50"
        >
          + Add a charge
        </button>
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-thread/30 bg-brass/10 px-6 py-4">
        <span className="text-sm font-medium text-thread">Order total</span>
        <span className="font-display text-2xl text-ink">{formatCents(grandTotalCents)}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="focus-ring rounded-xl border border-linen bg-white px-5 py-3 text-sm text-charcoal/70 hover:bg-cream"
        >
          ← Back to details
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onSubmit}
          className="focus-ring flex-1 rounded-xl bg-ink py-3 text-sm font-medium text-cream disabled:opacity-40 sm:flex-none sm:px-8"
        >
          {isPending ? "Creating ticket…" : "Create intake ticket"}
        </button>
      </div>
      <p className="text-xs text-charcoal/50">
        Prices left blank won't be saved — a manager can add them later. Once this ticket is created,
        the itemized breakdown is manager-only to view or edit; employees will still see the order total.
      </p>
    </div>
  );
}

function PriceLineRow({
  line,
  editableDescription,
  onChange,
  onRemove,
}: {
  line: PriceLineDraft;
  editableDescription: boolean;
  onChange: (patch: Partial<PriceLineDraft>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      {editableDescription ? (
        <input
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description"
          className="focus-ring min-w-0 flex-1 rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      ) : (
        <span className="min-w-0 flex-1 text-sm text-ink">{line.description}</span>
      )}
      <div className="flex items-center gap-1">
        <span className="text-sm text-charcoal/50">$</span>
        <input
          inputMode="decimal"
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="0.00"
          className="focus-ring w-24 rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-xs text-alert hover:underline">
          Remove
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-lg border border-linen bg-cream px-3 py-2"
      />
    </div>
  );
}
