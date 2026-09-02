"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "./StatusBadge";
import ItemCard from "./ItemCard";
import { PriceLineRow, AddPriceLineForm } from "./PriceLineEditor";
import {
  updateGeneralNotes,
  updatePaymentStatus,
  updateOrderIntake,
  rotateClientToken,
  cancelOrder,
  uncancelOrder,
} from "@/actions/orders";
import { addItemToOrder } from "@/actions/items";
import { formatCents } from "@/lib/money";

export default function OrderProfile({
  order,
  role,
  garmentTypes,
  alterationTypes,
  trackingUrl,
  staff,
  currentUserId,
}: {
  order: any;
  role: "EMPLOYEE" | "MANAGER";
  garmentTypes: string[];
  alterationTypes: string[];
  trackingUrl: string;
  staff?: { id: string; name: string }[];
  currentUserId: string;
}) {
  const activeItems = order.items.filter((item: any) => !item.removedAt);
  const removedItems = order.items.filter((item: any) => item.removedAt);
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="space-y-6">
      {cancelled && (
        <div className="rounded-2xl border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert">
          This order is cancelled — it no longer counts toward active lists or analytics. A manager can
          restore it below if that was a mistake.
        </div>
      )}
      <OrderHeader order={order} role={role} trackingUrl={trackingUrl} />
      <GeneralNotesAndPayment order={order} role={role} />
      {role === "MANAGER" && <PricingPanel order={order} />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">
            Items ({activeItems.length}
            {removedItems.length > 0 ? `, ${removedItems.length} removed` : ""})
          </h2>
        </div>
        <div className="space-y-4">
          {order.items.map((item: any) => (
            <ItemCard
              key={item.id}
              item={item}
              role={role}
              garmentTypes={garmentTypes}
              alterationTypes={alterationTypes}
              staff={staff}
              currentUserId={currentUserId}
            />
          ))}
        </div>
        {role === "MANAGER" && !cancelled && (
          <AddItemForm orderId={order.id} garmentTypes={garmentTypes} alterationTypes={alterationTypes} />
        )}
      </section>

      <ActivityLog logs={order.auditLogs} />
    </div>
  );
}

function OrderHeader({ order, role, trackingUrl }: { order: any; role: "EMPLOYEE" | "MANAGER"; trackingUrl: string }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  // trackingUrl is "<baseUrl>/track/<clientToken>" — strip the token to get the
  // standalone lookup page a client can use with just their order number + phone.
  const lookupUrl = trackingUrl.replace(/\/track\/.+$/, "/track");

  return (
    <div className="rounded-2xl border border-linen bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-charcoal/50">{order.orderNumber}</p>
          <h1 className="font-display text-2xl text-ink">{order.clientName}</h1>
        </div>
        <div className="flex items-center gap-2">
          {order.isRush && (
            <span className="rounded-full border border-alert/40 bg-alert/10 px-2.5 py-1 text-xs font-medium text-alert">
              Rush
            </span>
          )}
          <StatusBadge status={order.status} kind="order" />
        </div>
      </div>

      {!editing ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Client phone" value={order.clientPhone} />
          <Row label="Client email" value={order.clientEmail || "—"} />
          <Row label="Pickup contact" value={order.pickupContactName || "Same as client"} />
          <Row label="Pickup contact phone" value={order.pickupContactPhone || "—"} />
          <Row label="Due date" value={order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "—"} />
          <Row label="Created by" value={`${order.createdBy?.name} on ${new Date(order.createdAt).toLocaleDateString()}`} />
        </dl>
      ) : (
        <IntakeEditor order={order} onDone={() => setEditing(false)} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {role === "MANAGER" && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm text-charcoal/70 hover:bg-linen"
          >
            Edit client details
          </button>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(trackingUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="focus-ring rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-sm text-thread hover:bg-brass/20"
        >
          {copied ? "Link copied!" : "Copy client tracking link"}
        </button>
        {role === "MANAGER" && <RotateTokenButton orderId={order.id} />}
        {role === "MANAGER" && (
          <CancelOrderButton
            orderId={order.id}
            orderNumber={order.orderNumber}
            cancelled={order.status === "CANCELLED"}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-charcoal/50">
        No easy way to send that link? They can also visit{" "}
        <span className="font-medium text-charcoal/70">{lookupUrl}</span> and look up order{" "}
        {order.orderNumber} with the phone number on file.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-charcoal/40">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function IntakeEditor({ order, onDone }: { order: any; onDone: () => void }) {
  const [clientName, setClientName] = useState(order.clientName);
  const [clientPhone, setClientPhone] = useState(order.clientPhone);
  const [clientEmail, setClientEmail] = useState(order.clientEmail || "");
  const [pickupContactName, setPickupContactName] = useState(order.pickupContactName || "");
  const [pickupContactPhone, setPickupContactPhone] = useState(order.pickupContactPhone || "");
  const [dueDate, setDueDate] = useState(order.dueDate ? order.dueDate.slice(0, 10) : "");
  const [isRush, setIsRush] = useState(!!order.isRush);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-linen bg-cream p-4">
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="Client name" value={clientName} onChange={setClientName} />
        <LabeledInput label="Client phone" value={clientPhone} onChange={setClientPhone} />
        <LabeledInput label="Client email" value={clientEmail} onChange={setClientEmail} />
        <LabeledInput label="Due date" type="date" value={dueDate} onChange={setDueDate} />
        <LabeledInput label="Pickup contact name" value={pickupContactName} onChange={setPickupContactName} />
        <LabeledInput label="Pickup contact phone" value={pickupContactPhone} onChange={setPickupContactPhone} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-charcoal/70">
        <input
          type="checkbox"
          checked={isRush}
          onChange={(e) => setIsRush(e.target.checked)}
          className="focus-ring h-4 w-4 rounded border-linen"
        />
        Rush order
      </label>
      <div className="mt-3 flex gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateOrderIntake({
                orderId: order.id,
                clientName,
                clientPhone,
                clientEmail,
                pickupContactName,
                pickupContactPhone,
                dueDate,
                isRush,
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

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-lg border border-linen bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

function RotateTokenButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (confirm("This invalidates the old client link and creates a new one. Continue?")) {
          startTransition(async () => { await rotateClientToken(orderId); });
        }
      }}
      className="focus-ring rounded-lg border border-linen bg-white px-3 py-1.5 text-sm text-charcoal/60 hover:bg-cream"
    >
      Reset client link
    </button>
  );
}

/**
 * MANAGER ONLY: soft-cancels an order created entirely by mistake (duplicate ticket,
 * wrong client, test order) — see the cancelOrder/uncancelOrder comments in
 * actions/orders.ts. Reversible from the same button once cancelled.
 */
function CancelOrderButton({
  orderId,
  orderNumber,
  cancelled,
}: {
  orderId: string;
  orderNumber: string;
  cancelled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (cancelled) {
    return (
      <span className="flex items-center gap-2">
        {error && <span className="text-xs text-alert">{error}</span>}
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await uncancelOrder(orderId);
              if (!r.ok) setError(r.error || "Could not restore.");
            })
          }
          className="focus-ring rounded-lg border border-sage/40 bg-sage/10 px-3 py-1.5 text-sm text-sage hover:bg-sage/20"
        >
          Restore order
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert">{error}</span>}
      <button
        disabled={isPending}
        onClick={() => {
          if (confirm(`Cancel order ${orderNumber}? This is reversible — a manager can restore it later.`)) {
            startTransition(async () => {
              setError(null);
              const r = await cancelOrder(orderId);
              if (!r.ok) setError(r.error || "Could not cancel.");
            });
          }
        }}
        className="focus-ring rounded-lg border border-alert/40 px-3 py-1.5 text-sm text-alert hover:bg-alert/10"
      >
        Cancel order
      </button>
    </span>
  );
}

function GeneralNotesAndPayment({ order, role }: { order: any; role: "EMPLOYEE" | "MANAGER" }) {
  const [notes, setNotes] = useState(order.generalNotes || "");
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  return (
    <div className="rounded-2xl border border-linen bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal/50">Payment status</p>
          <p className="mt-1 text-sm text-charcoal/60">
            Order total <span className="font-display text-base text-ink">{formatCents(order.totalPriceCents)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {(["UNPAID", "DEPOSIT_PAID", "PAID"] as const).map((status) => (
            <button
              key={status}
              disabled={isPending}
              onClick={() => startTransition(async () => { await updatePaymentStatus(order.id, status); })}
              className={`rounded-full border px-3 py-1 text-xs ${
                order.paymentStatus === status
                  ? "border-thread bg-thread text-cream"
                  : "border-linen bg-cream text-charcoal/60"
              }`}
            >
              {status === "DEPOSIT_PAID" ? "Deposit paid" : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">Order-level notes</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Anything about the order as a whole (not a specific item)…"
        className="focus-ring w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await updateGeneralNotes(order.id, notes);
              setSavedAt(Date.now());
            })
          }
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-1.5 text-sm hover:bg-linen"
        >
          Save notes
        </button>
        {savedAt && <span className="text-xs text-sage">Saved</span>}
      </div>
    </div>
  );
}

/**
 * Manager-only. order.priceLines only ever reaches this component non-empty for a
 * manager — employees get [] server-side (see actions/orders.ts:getOrderDetail) — and
 * OrderProfile also gates rendering this whole panel on role === "MANAGER".
 * Per-item price lines are edited from each item's own card (ItemCard); this panel is
 * only for order-wide charges not tied to a single garment.
 */
function PricingPanel({ order }: { order: any }) {
  const orderLevelLines = (order.priceLines ?? []).filter((pl: any) => !pl.orderItemId);

  return (
    <section className="rounded-2xl border border-linen bg-white p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">Itemized pricing</h2>
        <span className="text-sm font-medium text-ink">Order total: {formatCents(order.totalPriceCents)}</span>
      </div>
      <p className="mb-3 text-xs text-charcoal/50">
        Manager only. Per-item pricing is edited from each item's card below — this section is for
        charges that apply to the whole order rather than one garment (e.g. a rush fee).
      </p>
      {orderLevelLines.length > 0 && (
        <div className="mb-2 divide-y divide-linen">
          {orderLevelLines.map((pl: any) => (
            <PriceLineRow key={pl.id} line={pl} />
          ))}
        </div>
      )}
      <AddPriceLineForm orderId={order.id} orderItemId={null} placeholder="Add an order-wide charge…" />
    </section>
  );
}

function AddItemForm({
  orderId,
  garmentTypes,
  alterationTypes,
}: {
  orderId: string;
  garmentTypes: string[];
  alterationTypes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [garmentType, setGarmentType] = useState(garmentTypes[0] || "");
  const [description, setDescription] = useState("");
  const [alterations, setAlterations] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="focus-ring mt-4 rounded-lg border border-dashed border-linen bg-white px-4 py-2 text-sm text-charcoal/60 hover:border-thread/50"
      >
        + Add another item to this order
      </button>
    );
  }

  function toggle(label: string) {
    setAlterations((prev) => (prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]));
  }

  return (
    <div className="mt-4 rounded-2xl border border-linen bg-white p-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-charcoal/50">
        Add item (manager only)
      </p>
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <select
          value={garmentType}
          onChange={(e) => setGarmentType(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        >
          {garmentTypes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {alterationTypes.map((a) => (
          <button
            type="button"
            key={a}
            onClick={() => toggle(a)}
            className={`rounded-full border px-3 py-1 text-xs ${
              alterations.includes(a) ? "border-thread bg-thread text-cream" : "border-linen bg-cream text-charcoal/70"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="Additional instructions (optional)"
        rows={2}
        className="focus-ring mb-3 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={isPending || !description.trim() || !garmentType}
          onClick={() =>
            startTransition(async () => {
              const r = await addItemToOrder(orderId, { garmentType, description, alterations, alterationsCustom: custom });
              if (r.ok) {
                setOpen(false);
                setDescription("");
                setAlterations([]);
                setCustom("");
              } else setError(r.error || "Could not add item.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream"
        >
          Add item
        </button>
        <button onClick={() => setOpen(false)} className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActivityLog({ logs }: { logs: any[] }) {
  if (!logs || logs.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-lg text-ink">Recent activity</h2>
      <div className="rounded-2xl border border-linen bg-white p-4">
        <ul className="space-y-2">
          {logs.map((log: any) => (
            <li key={log.id} className="border-b border-linen pb-2 text-sm last:border-0 last:pb-0">
              <p className="text-ink">{log.summary}</p>
              <p className="text-[11px] text-charcoal/40">{new Date(log.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
