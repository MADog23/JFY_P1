"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "./StatusBadge";
import {
  setItemStatus,
  reopenItem,
  addItemNote,
  upsertMeasurement,
  deleteMeasurement,
  addImagePlaceholder,
  authorizeItemPickup,
  undoItemPickup,
  updateItemIntake,
  claimItem,
  assignItem,
  releaseItem,
} from "@/actions/items";
import { PriceLineRow, AddPriceLineForm } from "./PriceLineEditor";
import { formatCents } from "@/lib/money";

export default function ItemCard({
  item,
  role,
  garmentTypes,
  alterationTypes,
  staff,
  currentUserId,
}: {
  item: any;
  role: "EMPLOYEE" | "MANAGER";
  garmentTypes: string[];
  alterationTypes: string[];
  staff?: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [measureLabel, setMeasureLabel] = useState("");
  const [measureValue, setMeasureValue] = useState("");
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [showPickupForm, setShowPickupForm] = useState(false);
  const [editingIntake, setEditingIntake] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = item.status === "COMPLETED" || item.status === "PICKED_UP";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error || "Something went wrong.");
    });
  }

  return (
    <div className="rounded-2xl border border-linen bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-charcoal/50">{item.garmentType}</p>
          <p className="font-display text-lg text-ink">{item.description}</p>
          {(item.alterations?.length > 0 || item.alterationsCustom) && (
            <p className="mt-1 text-sm text-charcoal/60">
              {item.alterations?.join(", ")}
              {item.alterationsCustom ? ` — ${item.alterationsCustom}` : ""}
            </p>
          )}
        </div>
        <StatusBadge status={item.status} kind="item" />
      </div>

      <ItemAssignment item={item} role={role} staff={staff} currentUserId={currentUserId} />

      {error && <p className="mb-3 text-sm text-alert">{error}</p>}

      {/* Status controls */}
      <div className="mb-4 flex flex-wrap gap-2">
        {item.status === "PENDING" && (
          <button
            disabled={isPending}
            onClick={() => run(() => setItemStatus(item.id, "IN_PROGRESS"))}
            className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm hover:bg-linen"
          >
            Start work
          </button>
        )}
        {item.status === "IN_PROGRESS" && (
          <button
            disabled={isPending}
            onClick={() => run(() => setItemStatus(item.id, "COMPLETED"))}
            className="focus-ring rounded-lg border border-sage/40 bg-sage/10 px-3 py-1.5 text-sm text-sage hover:bg-sage/20"
          >
            Mark completed
          </button>
        )}
        {item.status === "COMPLETED" && (
          <>
            {role === "MANAGER" && (
              <button
                disabled={isPending}
                onClick={() => run(() => reopenItem(item.id))}
                className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm hover:bg-linen"
              >
                Reopen for more work
              </button>
            )}
            <button
              disabled={isPending}
              onClick={() => setShowPickupForm((s) => !s)}
              className="focus-ring rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-sm text-thread hover:bg-brass/20"
            >
              Authorize pickup
            </button>
          </>
        )}
        {item.status === "PICKED_UP" && item.pickup && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="self-center text-xs text-charcoal/50">
              Picked up {new Date(item.pickup.pickedUpAt).toLocaleString()} by {item.pickup.pickedUpByName}
              {role === "MANAGER" ? ` · authorized by ${item.pickup.authorizedBy?.name}` : ""}
            </p>
            {role === "MANAGER" && (
              <button
                disabled={isPending}
                onClick={() => {
                  if (confirm(`Undo pickup of "${item.description}"? It'll go back to completed.`)) {
                    run(() => undoItemPickup(item.id));
                  }
                }}
                className="focus-ring rounded-lg border border-alert/40 px-2 py-1 text-xs text-alert hover:bg-alert/10"
              >
                Undo pickup
              </button>
            )}
          </div>
        )}
        {role === "MANAGER" && !locked && (
          <button
            onClick={() => setEditingIntake((s) => !s)}
            className="focus-ring ml-auto rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm text-charcoal/70 hover:bg-linen"
          >
            Edit item details
          </button>
        )}
      </div>

      {showPickupForm && (
        <div className="mb-4 rounded-xl border border-brass/30 bg-brass/5 p-4">
          <p className="mb-2 text-sm font-medium text-thread">Who is picking this item up?</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={pickupName}
              onChange={(e) => setPickupName(e.target.value)}
              placeholder="Name"
              className="focus-ring flex-1 rounded-lg border border-linen bg-white px-3 py-2 text-sm"
            />
            <input
              value={pickupPhone}
              onChange={(e) => setPickupPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="focus-ring flex-1 rounded-lg border border-linen bg-white px-3 py-2 text-sm"
            />
            <button
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const r = await authorizeItemPickup(item.id, pickupName, pickupPhone);
                  if (r.ok) {
                    setShowPickupForm(false);
                    setPickupName("");
                    setPickupPhone("");
                  }
                  return r;
                })
              }
              className="focus-ring rounded-lg bg-thread px-4 py-2 text-sm text-cream"
            >
              Confirm pickup
            </button>
          </div>
        </div>
      )}

      {editingIntake && (
        <ItemIntakeEditor
          item={item}
          garmentTypes={garmentTypes}
          alterationTypes={alterationTypes}
          onDone={() => setEditingIntake(false)}
        />
      )}

      {/* Pricing — manager-only to view or edit once the order exists. Employees never
          receive item.priceLines at all (stripped server-side in getOrderDetail), so
          this section renders nothing for them even without the role check below —
          the role check just avoids showing a manager-only control to an employee. */}
      {role === "MANAGER" && (
        <ItemPricing orderId={item.orderId} orderItemId={item.id} priceLines={item.priceLines ?? []} />
      )}

      {/* Measurements */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">Measurements</p>
        {item.measurements?.length > 0 && (
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {item.measurements.map((m: any) => (
              <MeasurementRow key={m.id} measurement={m} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={measureLabel}
            onChange={(e) => setMeasureLabel(e.target.value)}
            placeholder="e.g. Hem to floor"
            className="focus-ring w-40 rounded-lg border border-linen bg-white px-3 py-1.5 text-sm"
          />
          <input
            value={measureValue}
            onChange={(e) => setMeasureValue(e.target.value)}
            placeholder="e.g. 41 in"
            className="focus-ring w-32 rounded-lg border border-linen bg-white px-3 py-1.5 text-sm"
          />
          <button
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const r = await upsertMeasurement(item.id, measureLabel, measureValue);
                if (r.ok) {
                  setMeasureLabel("");
                  setMeasureValue("");
                }
                return r;
              })
            }
            className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm hover:bg-linen"
          >
            Save
          </button>
        </div>
      </div>

      {/* Photos (placeholder) */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">Photos</p>
        <div className="flex flex-wrap items-center gap-2">
          {item.images?.map((img: any) => (
            <div
              key={img.id}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-linen bg-cream text-center text-[10px] text-charcoal/40"
              title={img.caption || undefined}
            >
              <span>📷</span>
              <span>pending</span>
            </div>
          ))}
          <button
            disabled={isPending}
            onClick={() => run(() => addImagePlaceholder(item.id))}
            className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-xs text-charcoal/60 hover:bg-linen"
          >
            + Log photo capture
          </button>
        </div>
        <p className="mt-1 text-[11px] text-charcoal/40">
          Photo storage isn't connected yet — this logs that a photo was taken, for now.
        </p>
      </div>

      {/* Notes */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">Notes</p>
        <div className="mb-2 flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a working note…"
            className="focus-ring flex-1 rounded-lg border border-linen bg-white px-3 py-2 text-sm"
          />
          <button
            disabled={isPending || !noteText.trim()}
            onClick={() =>
              run(async () => {
                const r = await addItemNote(item.id, noteText);
                if (r.ok) setNoteText("");
                return r;
              })
            }
            className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <ul className="space-y-1.5">
          {item.notes?.map((n: any) => (
            <li key={n.id} className="rounded-lg bg-cream px-3 py-2 text-sm">
              <p className="text-ink">{n.body}</p>
              <p className="text-[11px] text-charcoal/40">
                {n.author?.name} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ItemIntakeEditor({
  item,
  garmentTypes,
  alterationTypes,
  onDone,
}: {
  item: any;
  garmentTypes: string[];
  alterationTypes: string[];
  onDone: () => void;
}) {
  const [garmentType, setGarmentType] = useState(item.garmentType);
  const [description, setDescription] = useState(item.description);
  const [alterations, setAlterations] = useState<string[]>(item.alterations || []);
  const [custom, setCustom] = useState(item.alterationsCustom || "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(label: string) {
    setAlterations((prev) => (prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]));
  }

  return (
    <div className="mb-4 rounded-xl border border-linen bg-cream p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-charcoal/50">
        Edit item (manager only)
      </p>
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <select
          value={garmentType}
          onChange={(e) => setGarmentType(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-white px-3 py-2 text-sm"
        >
          {garmentTypes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-white px-3 py-2 text-sm"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {alterationTypes.map((a) => (
          <button
            type="button"
            key={a}
            onClick={() => toggle(a)}
            className={`rounded-full border px-3 py-1 text-xs ${
              alterations.includes(a) ? "border-thread bg-thread text-cream" : "border-linen bg-white text-charcoal/70"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        className="focus-ring mb-3 w-full rounded-lg border border-linen bg-white px-3 py-2 text-sm"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateItemIntake({
                itemId: item.id,
                garmentType,
                description,
                alterations,
                alterationsCustom: custom,
              });
              if (r.ok) onDone();
              else setError(r.error || "Could not save.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream"
        >
          Save changes
        </button>
        <button onClick={onDone} className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function MeasurementRow({ measurement }: { measurement: any }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(measurement.label);
  const [value, setValue] = useState(measurement.value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="focus-ring rounded-lg bg-cream px-3 py-2 text-left text-sm hover:bg-linen"
      >
        <p className="text-charcoal/50">{measurement.label}</p>
        <p className="font-medium text-ink">{measurement.value}</p>
      </button>
    );
  }

  return (
    <div className="col-span-2 rounded-lg border border-thread/30 bg-white p-2 sm:col-span-1">
      {error && <p className="mb-1 text-[11px] text-alert">{error}</p>}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="focus-ring mb-1 w-full rounded border border-linen px-2 py-1 text-xs"
        placeholder="Label"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="focus-ring mb-1.5 w-full rounded border border-linen px-2 py-1 text-xs"
        placeholder="Value"
      />
      <div className="flex gap-1">
        <button
          disabled={isPending || !label.trim() || !value.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await upsertMeasurement(measurement.orderItemId, label, value, measurement.id);
              if (r.ok) setEditing(false);
              else setError(r.error || "Could not save.");
            })
          }
          className="focus-ring flex-1 rounded bg-ink px-2 py-1 text-xs text-cream disabled:opacity-40"
        >
          Save
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            if (!confirm(`Remove the "${measurement.label}" measurement?`)) return;
            startTransition(async () => {
              const r = await deleteMeasurement(measurement.id);
              if (!r.ok) setError(r.error || "Could not delete.");
            });
          }}
          className="focus-ring rounded border border-alert/40 px-2 py-1 text-xs text-alert hover:bg-alert/10"
        >
          Delete
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setLabel(measurement.label);
            setValue(measurement.value);
            setError(null);
          }}
          className="focus-ring rounded border border-linen px-2 py-1 text-xs text-charcoal/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Assignment is informational only (see actions/items.ts) — it labels who's
 * responsible for this item and feeds the workload analytics, but never restricts who
 * can actually start/complete it. Any employee or manager can "pick up" (self-claim)
 * an unassigned, not-yet-done item; only a manager can assign/reassign to someone
 * else. Hidden entirely once the item is done (completed/picked up) and was never
 * assigned — nothing useful to show at that point.
 */
function ItemAssignment({
  item,
  role,
  staff,
  currentUserId,
}: {
  item: any;
  role: "EMPLOYEE" | "MANAGER";
  staff?: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [pickedStaffId, setPickedStaffId] = useState("");

  const workable = item.status === "PENDING" || item.status === "IN_PROGRESS";
  if (!workable && !item.assignedTo) return null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error || "Something went wrong.");
    });
  }

  const canRelease = workable && item.assignedToId && (role === "MANAGER" || item.assignedToId === currentUserId);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      {item.assignedTo ? (
        <span className="rounded-full border border-linen bg-cream px-3 py-1 text-charcoal/70">
          Assigned to <span className="font-medium text-ink">{item.assignedTo.name}</span>
        </span>
      ) : workable ? (
        <span className="rounded-full border border-dashed border-linen px-3 py-1 text-charcoal/40">
          Unassigned
        </span>
      ) : null}

      {error && <span className="text-xs text-alert">{error}</span>}

      {workable && !item.assignedTo && (
        <button
          disabled={isPending}
          onClick={() => run(() => claimItem(item.id))}
          className="focus-ring rounded-lg border border-linen bg-white px-2.5 py-1 text-xs text-thread hover:bg-linen"
        >
          Pick up this item
        </button>
      )}

      {canRelease && (
        <button
          disabled={isPending}
          onClick={() => run(() => releaseItem(item.id))}
          className="focus-ring rounded-lg border border-linen bg-white px-2.5 py-1 text-xs text-charcoal/60 hover:bg-cream"
        >
          Release
        </button>
      )}

      {workable && role === "MANAGER" && staff && staff.length > 0 && (
        <>
          {!showAssignPicker ? (
            <button
              onClick={() => {
                setPickedStaffId(item.assignedToId || "");
                setShowAssignPicker(true);
              }}
              className="focus-ring rounded-lg border border-linen bg-white px-2.5 py-1 text-xs text-charcoal/60 hover:bg-cream"
            >
              {item.assignedTo ? "Reassign…" : "Assign…"}
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <select
                value={pickedStaffId}
                onChange={(e) => setPickedStaffId(e.target.value)}
                className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-xs"
              >
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                disabled={isPending || !pickedStaffId}
                onClick={() =>
                  run(async () => {
                    const r = await assignItem(item.id, pickedStaffId);
                    if (r.ok) setShowAssignPicker(false);
                    return r;
                  })
                }
                className="focus-ring rounded-lg bg-ink px-2.5 py-1 text-xs text-cream disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => setShowAssignPicker(false)}
                className="focus-ring rounded-lg border border-linen px-2.5 py-1 text-xs text-charcoal/60"
              >
                Cancel
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Manager-only. Employees never see this component's data even if it somehow rendered
 * for them — getOrderDetail() strips item.priceLines to [] server-side before an
 * employee's page ever receives it — but ItemCard also gates on role so an employee
 * never sees the "Add a price line" control in the first place.
 */
function ItemPricing({
  orderId,
  orderItemId,
  priceLines,
}: {
  orderId: string;
  orderItemId: string;
  priceLines: any[];
}) {
  const itemTotal = priceLines.reduce((sum: number, pl: any) => sum + pl.amountCents, 0);

  return (
    <div className="mb-4 rounded-xl border border-brass/30 bg-brass/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-thread">Pricing (manager only)</p>
        {priceLines.length > 0 && <span className="text-sm font-medium text-ink">{formatCents(itemTotal)}</span>}
      </div>
      {priceLines.length > 0 && (
        <div className="mb-2 divide-y divide-brass/20">
          {priceLines.map((pl: any) => (
            <PriceLineRow key={pl.id} line={pl} />
          ))}
        </div>
      )}
      <AddPriceLineForm orderId={orderId} orderItemId={orderItemId} />
    </div>
  );
}
