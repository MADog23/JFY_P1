"use client";

import { useState, useTransition } from "react";
import { createIntakeTicket } from "@/actions/orders";

type ItemDraft = {
  garmentType: string;
  description: string;
  alterations: string[];
  alterationsCustom: string;
};

const emptyItem = (): ItemDraft => ({
  garmentType: "",
  description: "",
  alterations: [],
  alterationsCustom: "",
});

export default function IntakeForm({
  garmentTypes,
  alterationTypes,
}: {
  garmentTypes: string[];
  alterationTypes: string[];
}) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createIntakeTicket({
        clientName,
        clientPhone,
        clientEmail,
        pickupContactName,
        pickupContactPhone,
        dueDate,
        items,
      });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
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
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
                  Garment type
                </label>
                <select
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
        disabled={isPending}
        className="focus-ring w-full rounded-xl bg-ink py-3 text-sm font-medium text-cream disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {isPending ? "Creating ticket…" : "Create intake ticket"}
      </button>
      <p className="text-xs text-charcoal/50">
        Once created, the client and item details above are locked — only a manager can edit them.
        You'll be able to add notes, measurements, and mark progress right away.
      </p>
    </form>
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
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-lg border border-linen bg-cream px-3 py-2"
      />
    </div>
  );
}
