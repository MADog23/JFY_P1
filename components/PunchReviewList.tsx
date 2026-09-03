"use client";

/**
 * Manager-facing punch correction UI. This is the actual fix for Homebase's
 * "constantly messes up their time clock records" complaint: every punch is visible,
 * every correction is a real edit (never a silent rewrite — see correctPunch's audit
 * trail), and a bad punch can be voided without deleting it. Nothing here computes pay;
 * it's strictly "here's what was recorded, fix it if it's wrong."
 */

import { useState, useTransition } from "react";
import { correctPunch, voidPunch, addManualPunch } from "@/actions/punches";
import type { PunchType } from "@/lib/hours";
import { toDateTimeInputValue, formatShopDateTime } from "@/lib/dates";

type RawPunch = {
  id: string;
  type: PunchType;
  timestamp: Date | string;
  note: string | null;
  createdBy: { id: string; name: string };
  editedAt: Date | string | null;
  editedBy: { id: string; name: string } | null;
  voidedAt: Date | string | null;
  voidedBy: { id: string; name: string } | null;
  voidReason: string | null;
};

// BREAK = paid, LUNCH = unpaid — see lib/hours.ts's header for why that distinction
// matters for the totals this list feeds into.
const PUNCH_TYPES: PunchType[] = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END", "LUNCH_START", "LUNCH_END"];

function PunchRow({ punch }: { punch: RawPunch }) {
  const [editing, setEditing] = useState(false);
  const [timestamp, setTimestamp] = useState(toDateTimeInputValue(punch.timestamp));
  const [type, setType] = useState<PunchType>(punch.type);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (punch.voidedAt) {
    return (
      <tr className="border-b border-linen/60 text-charcoal/40 last:border-0">
        <td className="px-3 py-2 line-through">{formatShopDateTime(punch.timestamp, { dateStyle: "medium", timeStyle: "short" })}</td>
        <td className="px-3 py-2 line-through">{punch.type.replace("_", " ")}</td>
        <td className="px-3 py-2 text-[11px]" colSpan={2}>
          Voided by {punch.voidedBy?.name}: {punch.voidReason}
        </td>
      </tr>
    );
  }

  if (editing) {
    return (
      <tr className="border-b border-linen/60 last:border-0">
        <td className="px-3 py-2">
          <input
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PunchType)}
            className="focus-ring rounded-lg border border-linen bg-white px-2 py-1 text-sm"
          >
            {PUNCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2" colSpan={2}>
          {error && <p className="mb-1 text-[11px] text-alert">{error}</p>}
          <div className="flex gap-1">
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  // Pass the raw datetime-local string through — the server interprets it as
                  // shop-local time (see actions/punches.ts), not this browser's own timezone.
                  const r = await correctPunch(punch.id, timestamp, type);
                  if (r.ok) setEditing(false);
                  else setError(r.error || "Could not save.");
                })
              }
              className="focus-ring rounded bg-ink px-3 py-1 text-xs text-cream"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setTimestamp(toDateTimeInputValue(punch.timestamp));
                setType(punch.type);
                setError(null);
              }}
              className="focus-ring rounded border border-linen px-3 py-1 text-xs text-charcoal/60"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-linen/60 last:border-0">
      <td className="px-3 py-2 text-ink">{formatShopDateTime(punch.timestamp, { dateStyle: "medium", timeStyle: "short" })}</td>
      <td className="px-3 py-2 text-ink">{punch.type.replace("_", " ")}</td>
      <td className="px-3 py-2 text-[11px] text-charcoal/50">
        {punch.createdBy.id === punch.editedBy?.id || !punch.editedBy
          ? `entered by ${punch.createdBy.name}`
          : `entered by ${punch.createdBy.name}, edited by ${punch.editedBy.name}`}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(true)} className="focus-ring rounded px-2 py-1 text-xs text-thread hover:underline">
            Edit
          </button>
          <button
            onClick={() => {
              const reason = prompt("Reason for voiding this punch:");
              if (reason === null) return;
              if (!reason.trim()) return alert("A reason is required.");
              startTransition(async () => {
                await voidPunch(punch.id, reason);
              });
            }}
            className="focus-ring rounded px-2 py-1 text-xs text-alert hover:underline"
          >
            Void
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddMissedPunchForm({ userId }: { userId: string }) {
  const [type, setType] = useState<PunchType>("CLOCK_IN");
  const [timestamp, setTimestamp] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  return (
    <div className="border-t border-linen bg-cream/60 px-3 py-3">
      {error && <p className="mb-1 text-[11px] text-alert">{error}</p>}
      {added && <p className="mb-1 text-[11px] text-sage">Added.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as PunchType)} className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm">
          {PUNCH_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — why this is being added manually"
          className="focus-ring min-w-[14rem] flex-1 rounded-lg border border-linen bg-white px-2 py-1.5 text-sm"
        />
        <button
          disabled={isPending || !timestamp}
          onClick={() =>
            startTransition(async () => {
              setAdded(false);
              const r = await addManualPunch(userId, type, timestamp, note);
              if (r.ok) {
                setAdded(true);
                setTimestamp("");
                setNote("");
              } else setError(r.error || "Could not add punch.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-3 py-1.5 text-xs text-cream disabled:opacity-40"
        >
          Add missed punch
        </button>
      </div>
    </div>
  );
}

export function PunchReviewList({ userId, punches }: { userId: string; punches: RawPunch[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-linen bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-linen bg-cream text-left text-[11px] uppercase tracking-wide text-charcoal/50">
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {punches.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-charcoal/50">
                No punches in this range.
              </td>
            </tr>
          ) : (
            punches.map((p) => <PunchRow key={p.id} punch={p} />)
          )}
        </tbody>
      </table>
      <AddMissedPunchForm userId={userId} />
    </div>
  );
}
