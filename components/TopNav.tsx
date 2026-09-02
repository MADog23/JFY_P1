import Link from "next/link";
import { logout } from "@/actions/auth";
import { MobileNavMenu } from "./MobileNavMenu";
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
  const managerLinks = [
    ...phase2Links,
    { href: "/manager/employees", label: "Staff" },
    { href: "/manager/taxonomy", label: "Garment options" },
    { href: "/manager/analytics", label: "Analytics" },
    { href: "/manager/account", label: "My account" },
  ];

  return (
    <header className="border-b border-linen bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href={base} className="font-display text-lg text-ink">
            Just For You <span className="text-thread">· Alterations</span>
          </Link>
          <nav className="hidden gap-4 text-sm text-charcoal/70 sm:flex">
            <Link href={base} className="hover:text-ink">
              Orders
            </Link>
            {role === "EMPLOYEE" &&
              phase2Links.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              ))}
            {role === "MANAGER" &&
              managerLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <MobileNavMenu links={role === "MANAGER" ? managerLinks : phase2Links} />
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
