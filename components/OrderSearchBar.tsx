"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Search + date-range controls for the order list pages (employee and manager share
 * this). Everything is driven through the URL's query string — filter/search/from/to
 * all live there together — so the status tabs on the page (rendered server-side)
 * stay in sync with whatever's typed here, and a search result page is a plain
 * shareable/bookmarkable link.
 */
export function OrderSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [isPending, startTransition] = useTransition();

  const hasActiveSearch = !!(searchParams.get("search") || searchParams.get("from") || searchParams.get("to"));

  function apply(overrides?: { search?: string; from?: string; to?: string }) {
    const next = { search, from, to, ...overrides };
    const params = new URLSearchParams(searchParams.toString());
    (["search", "from", "to"] as const).forEach((key) => {
      const value = next[key];
      if (value) params.set(key, value);
      else params.delete(key);
    });
    // A new search changes which orders match, so whatever page the list was on no
    // longer means anything — back to page 1, same as switching a status tab does.
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clearAll() {
    setSearch("");
    setFrom("");
    setTo("");
    apply({ search: "", from: "", to: "" });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-linen bg-white p-4"
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="order-search-search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Search
        </label>
        <input
          id="order-search-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Client name, phone, email, or order #…"
          className="focus-ring w-full rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="order-search-from" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          From
        </label>
        <input
          id="order-search-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="order-search-to" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/50">
          To
        </label>
        <input
          id="order-search-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="focus-ring rounded-lg border border-linen bg-cream px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream disabled:opacity-60"
      >
        Search
      </button>
      {hasActiveSearch && (
        <button
          type="button"
          onClick={clearAll}
          className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm text-charcoal/60 hover:bg-cream"
        >
          Clear
        </button>
      )}
      <p className="w-full text-[11px] text-charcoal/40">
        Date range filters by when the intake ticket was created, not the due date.
      </p>
    </form>
  );
}
