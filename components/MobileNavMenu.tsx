"use client";

import { useState } from "react";
import Link from "next/link";

export function MobileNavMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  if (links.length === 0) return null;

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
        aria-expanded={open}
        className="focus-ring flex flex-col justify-center gap-1 rounded-lg border border-linen p-2"
      >
        <span className="block h-0.5 w-4 bg-ink" />
        <span className="block h-0.5 w-4 bg-ink" />
        <span className="block h-0.5 w-4 bg-ink" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Fixed (not absolute) and anchored with explicit viewport coordinates —
              this used to be `absolute left-0 top-full` relative to the button's own
              wrapper, which rendered it detached from the button on real devices.
              left-4/top-16 line up with the header's own px-4/py-3 padding. */}
          <div className="fixed left-4 top-16 z-20 w-48 rounded-xl border border-linen bg-white p-1.5 shadow-lg">
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
