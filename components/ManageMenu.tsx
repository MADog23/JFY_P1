"use client";

/**
 * Desktop-only dropdown that groups the manager-only admin pages (Staff, Garment
 * options, Analytics, My account) behind one "Manage" trigger, instead of each sitting
 * as its own top-level link in the bar. Keeps the manager nav from growing every time a
 * new admin page gets added — today's four links would otherwise make seven total
 * items across the bar (Orders, Timeclock, Schedule, Staff, Garment options,
 * Analytics, My account) before even reaching the sign-out button.
 *
 * Mobile is unaffected: MobileNavMenu still gets these same links flattened into its
 * own list, nothing is hidden from a phone — this component itself is `hidden sm:block`
 * and only exists for the wide layout.
 */

import { useState } from "react";
import Link from "next/link";

export function ManageMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage"
        aria-expanded={open}
        className="focus-ring flex items-center gap-1 rounded-lg px-1 py-1 text-charcoal/70 hover:text-ink"
      >
        Manage
        <span aria-hidden="true" className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border border-linen bg-white p-1.5 shadow-lg">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-charcoal/70 hover:bg-cream"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
