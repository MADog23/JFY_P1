import Link from "next/link";
import { logout } from "@/actions/auth";
import { MobileNavMenu } from "./MobileNavMenu";
import { ManageMenu } from "./ManageMenu";
import { isPhase2Enabled } from "@/lib/feature-flags";

export function TopNav({
  name,
  role,
}: {
  name: string;
  role: "EMPLOYEE" | "MANAGER";
}) {
  const base = role === "MANAGER" ? "/manager" : "/employee";
  // Phase 2 (timeclock + scheduling) — off by default; see lib/feature-flags.ts for
  // how to turn this on (and back off) without a code change.
  const phase2Links = isPhase2Enabled()
    ? [
        { href: `${base}/timeclock`, label: "Timeclock" },
        { href: `${base}/schedule`, label: "Schedule" },
      ]
    : [];
  // Analytics stays a top-level link next to Timeclock/Schedule — checked often enough
  // that it earns its own spot in the bar, unlike the admin pages below.
  const analyticsLink = { href: "/manager/analytics", label: "Analytics" };
  // The rest of the manager-only admin pages — grouped under a "Manage" dropdown on
  // desktop (see ManageMenu) instead of each sitting as its own top-level link, so the
  // bar doesn't keep growing. Still flattened into the mobile menu below — nothing is
  // hidden on a phone, just organized differently on wide screens.
  const manageLinks = [
    { href: "/manager/employees", label: "Staff" },
    { href: "/manager/taxonomy", label: "Garment options" },
    { href: "/manager/audit", label: "Audit report" },
    { href: "/manager/account", label: "My account" },
  ];
  const managerLinks = [...phase2Links, analyticsLink, ...manageLinks];

  return (
    <header className="border-b border-linen bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 sm:gap-6">
          <MobileNavMenu links={role === "MANAGER" ? managerLinks : phase2Links} />
          {/* The logo has always linked home — the house icon just makes that obvious
              at a glance instead of relying on "click the logo" being a known
              convention. This is the one and only "home" link now; the old standalone
              "Orders" text link went away since it pointed at the exact same place. */}
          <Link href={base} className="flex items-center gap-2 font-display text-lg text-ink" aria-label="Go to Orders (home)">
            <span aria-hidden="true">🏠</span>
            <span>
              Just For You <span className="text-thread">· Alterations</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-charcoal/70 sm:flex">
            {phase2Links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-ink">
                {link.label}
              </Link>
            ))}
            {role === "MANAGER" && (
              <Link href={analyticsLink.href} className="hover:text-ink">
                {analyticsLink.label}
              </Link>
            )}
            {role === "MANAGER" && <ManageMenu links={manageLinks} />}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-charcoal/70">
            {name}{" "}
            <span className="hidden text-charcoal/40 sm:inline">
              · {role === "MANAGER" ? "Manager" : "Employee"}
            </span>
          </span>
          <form action={logout}>
            <button className="focus-ring rounded-lg border border-linen px-3 py-1.5 text-charcoal/70 hover:bg-cream">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
