"use client";

import { useState, useTransition } from "react";
import {
  addGarmentType,
  addAlterationType,
  toggleGarmentType,
  toggleAlterationType,
} from "@/actions/taxonomy";

export default function TaxonomyManager({
  garmentTypes,
  alterationTypes,
}: {
  garmentTypes: any[];
  alterationTypes: any[];
}) {
  return (
    <div className="space-y-8">
      <TaxonomyList
        title="Garment types"
        items={garmentTypes}
        onAdd={addGarmentType}
        onToggle={toggleGarmentType}
      />
      <TaxonomyList
        title="Alteration types"
        items={alterationTypes}
        onAdd={addAlterationType}
        onToggle={toggleAlterationType}
      />
    </div>
  );
}

function TaxonomyList({
  title,
  items,
  onAdd,
  onToggle,
}: {
  title: string;
  items: any[];
  onAdd: (label: string) => Promise<any>;
  onToggle: (id: string, active: boolean) => Promise<any>;
}) {
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-linen bg-white p-6">
      <h2 className="mb-4 font-display text-lg text-ink">{title}</h2>
      <ul className="mb-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => startTransition(async () => { await onToggle(item.id, !item.active); })}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              item.active
                ? "border-linen bg-cream text-ink"
                : "border-linen bg-white text-charcoal/30 line-through"
            }`}
          >
            {item.label}
          </button>
        ))}
      </ul>
      <div className="flex gap-2 border-t border-linen pt-4">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Add new option…"
          className="focus-ring flex-1 rounded-lg border border-linen px-3 py-2 text-sm"
        />
        <button
          disabled={isPending || !label.trim()}
          onClick={() =>
            startTransition(async () => {
              await onAdd(label);
              setLabel("");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream"
        >
          Add
        </button>
      </div>
    </section>
  );
}
