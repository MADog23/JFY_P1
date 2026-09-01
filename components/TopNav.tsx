import Link from "next/link";
import { logout } from "@/actions/auth";

export function TopNav({
  name,
  role,
}: {
  name: string;
  role: "EMPLOYEE" | "MANAGER";
}) {
  const base = role === "MANAGER" ? "/manager" : "/employee";
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
            {role === "MANAGER" && (
              <>
                <Link href="/manager/employees" className="hover:text-ink">
                  Staff
                </Link>
                <Link href="/manager/taxonomy" className="hover:text-ink">
                  Garment options
                </Link>
                <Link href="/manager/analytics" className="hover:text-ink">
                  Analytics
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-charcoal/70">
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
