"use client";

import { useState, useTransition } from "react";
import { lookupOrder } from "@/actions/track";

export default function TrackLookup() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await lookupOrder(orderNumber, phone);
      // A successful lookup redirects server-side and never resolves here — only a
      // failure ever produces a result to react to.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest text-thread">Mt Juliet, TN</p>
          <h1 className="mt-1 font-display text-3xl text-ink">Just For You Alterations</h1>
          <p className="mt-1 text-sm text-charcoal/70">Find your order</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-linen bg-white p-6 shadow-sm">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
            Order number
          </label>
          <input
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="JFY-000123"
            className="focus-ring mb-4 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-ink"
          />
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
            Phone number on file
          </label>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(615) 555-0123"
            className="focus-ring mb-5 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-ink"
          />
          <button
            type="submit"
            disabled={isPending}
            className="focus-ring w-full rounded-xl bg-ink py-3 text-sm font-medium text-cream disabled:opacity-40"
          >
            {isPending ? "Looking up…" : "Find my order"}
          </button>
          {error && <p className="mt-3 text-center text-sm text-alert">{error}</p>}
        </form>

        <p className="mt-8 text-center text-xs text-charcoal/40">
          Already have a tracking link? You can still use it directly — this page is just
          an alternative way in.
        </p>
      </div>
    </main>
  );
}
