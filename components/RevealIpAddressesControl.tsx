"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmRevealAuditIpAddresses } from "@/actions/audit-report";

/**
 * Sits above the audit table when the "Security" category is selected. IP addresses
 * are hidden by default (see actions/audit-report.ts's server-side masking) — this is
 * the re-authentication prompt that unlocks them for ~15 minutes, and each unlock is
 * itself written to the audit trail (AUDIT_IP_ADDRESSES_VIEWED) so there's a provable
 * record of who chose to view them and when.
 */
export function RevealIpAddressesControl({ revealed, expiresAt }: { revealed: boolean; expiresAt: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The row data itself is fetched fresh on every render, but nothing was otherwise
  // telling the page to re-render right when the 15-minute unlock actually expires —
  // without this, IPs stayed visible on-screen indefinitely until something else
  // happened to trigger a refresh (navigating away and back, etc). This schedules
  // exactly one router.refresh() for the moment expiresAt passes, which re-runs
  // listAuditReport server-side and re-masks the rows the instant the token is no
  // longer valid, no manual refresh required.
  useEffect(() => {
    if (!revealed || !expiresAt) return;
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => router.refresh(), delay);
    return () => clearTimeout(timer);
  }, [revealed, expiresAt, router]);

  if (revealed) {
    return (
      <p className="mb-4 rounded-xl border border-linen bg-cream px-4 py-3 text-sm text-charcoal/70">
        IP addresses are visible for about 15 minutes from when you unlocked them.
      </p>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmRevealAuditIpAddresses(password);
      if (result.ok) {
        setPassword("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mb-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring rounded-lg border border-linen bg-white px-3 py-2 text-sm text-charcoal/70 hover:bg-cream"
        >
          Show IP addresses
        </button>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-2xl border border-linen bg-white p-4">
          <div>
            <label htmlFor="reveal-ip-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
              Re-enter your password to view IP addresses
            </label>
            <input
              id="reveal-ip-password"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-60"
          >
            {isPending ? "Checking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPassword("");
              setError(null);
            }}
            className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm text-charcoal/60 hover:bg-cream"
          >
            Cancel
          </button>
          {error && <p className="w-full text-sm text-alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
