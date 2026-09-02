"use client";

import { useState, useTransition } from "react";
import {
  addGarmentType,
  addAlterationType,
  renameGarmentType,
  renameAlterationType,
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
        onRename={renameGarmentType}
        onToggle={toggleGarmentType}
      />
      <TaxonomyList
        title="Alteration types"
        items={alterationTypes}
        onAdd={addAlterationType}
        onRename={renameAlterationType}
        onToggle={toggleAlterationType}
      />
    </div>
  );
}

function TaxonomyList({
  title,
  items,
  onAdd,
  onRename,
  onToggle,
}: {
  title: string;
  items: any[];
  onAdd: (label: string) => Promise<any>;
  onRename: (id: string, label: string) => Promise<any>;
  onToggle: (id: string, active: boolean) => Promise<any>;
}) {
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-linen bg-white p-6">
      <h2 className="mb-4 font-display text-lg text-ink">{title}</h2>
      {error && <p className="mb-3 text-sm text-alert">{error}</p>}
      <ul className="mb-4 flex flex-wrap gap-2">
        {items.map((item) =>
          renameTarget === item.id ? (
            <span key={item.id} className="flex items-center gap-1 rounded-full border border-thread/40 bg-cream px-2 py-1">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="focus-ring w-32 rounded-lg border border-linen bg-white px-2 py-0.5 text-sm"
                autoFocus
              />
              <button
                disabled={isPending || !renameValue.trim()}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const r = await onRename(item.id, renameValue);
                    if (r?.ok) setRenameTarget(null);
                    else setError(r?.error || "Could not rename.");
                  })
                }
                className="focus-ring rounded-full bg-ink px-2 py-0.5 text-xs text-cream disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => setRenameTarget(null)}
                className="focus-ring rounded-full px-2 py-0.5 text-xs text-charcoal/50 hover:bg-white"
              >
                Cancel
              </button>
            </span>
          ) : (
            <span
              key={item.id}
              className={`flex items-center rounded-full border text-sm ${
                item.active
                  ? "border-linen bg-cream text-ink"
                  : "border-linen bg-white text-charcoal/30"
              }`}
            >
              <button
                onClick={() => {
                  if (
                    item.active &&
                    !confirm(
                      `Deactivate "${item.label}"? It'll be hidden from new intake, but items already using it keep the label they were given.`
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => { await onToggle(item.id, !item.active); });
                }}
                className={`px-3 py-1.5 ${item.active ? "" : "line-through"}`}
              >
                {item.label}
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setRenameTarget(item.id);
                  setRenameValue(item.label);
                }}
                title="Rename"
                className="focus-ring border-l border-linen px-2 py-1.5 text-xs text-charcoal/40 hover:text-ink"
              >
                ✎
              </button>
            </span>
          )
        )}
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
