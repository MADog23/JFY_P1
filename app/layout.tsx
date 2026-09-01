import type { Metadata, Viewport } from "next";
import "./globals.css";

// This app is entirely database-backed and per-user (sessions, live order data) —
// nothing in it should be statically prerendered at build time. Setting this here
// cascades to every route in the app, which also fixes the specific case of /login:
// it queries Prisma directly with no cookies()/headers() call to auto-signal dynamic
// rendering, so without this Next tries to prerender it at build time (before a
// database is even attached on Railway) and the build fails on a missing DATABASE_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Just For You Alterations — Digital Ticket",
  description: "Internal ticketing system for Just For You Alterations, Mt Juliet TN.",
};

// Browser-tab and address-bar tint, plus what "Add to Home Screen" shows for the app
// name/icon works from — app/manifest.ts has the fuller PWA config (icons, standalone
// display). app/icon.png and app/apple-icon.png are Next's special-file convention:
// dropping those files here is enough for Next to auto-generate the favicon and
// apple-touch-icon <link> tags, no metadata.icons config needed.
export const viewport: Viewport = {
  themeColor: "#8A4A56", // thread — tailwind.config.ts
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body min-h-screen bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
