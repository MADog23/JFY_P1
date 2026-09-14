/**
 * Shared shell for the four analytics pages (Overview/Employees/Pricing/Garments) — one
 * TopNav + tab bar here instead of each page repeating it, same composition pattern
 * Next's App Router is built for. Each page below only returns its own content; this is
 * where the manager guard, the page chrome, and the max-width container live.
 */

import { requireManager } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { AnalyticsTabs } from "@/components/AnalyticsTabs";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireManager();

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-ink">Analytics</h1>
            <p className="text-sm text-charcoal/60">A business hub for how the shop, its pricing, its garments, and its team are doing.</p>
          </div>
          <AnalyticsTabs />
        </div>
        {children}
      </main>
    </>
  );
}
