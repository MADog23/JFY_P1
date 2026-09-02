import Link from "next/link";
import { logout } from "@/actions/auth";
import { MobileNavMenu } from "./MobileNavMenu";

export function TopNav({
  name,
  role,
}: {
  name: string;
  role: "EMPLOYEE" | "MANAGER";
}) {
  const base = role === "MANAGER" ? "/manager" : "/employee";
  const managerLinks = [
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
            {role === "MANAGER" &&
              managerLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {role === "MANAGER" && <MobileNavMenu links={managerLinks} />}
          <span className="hidden text-charcoal/70 sm:inline">
            {name} <span className="text-charcoal/40">· {role === "MANAGER" ? "Manager" : "Employee"}</span>
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
