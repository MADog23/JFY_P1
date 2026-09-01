import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Just For You Alterations — Digital Ticket",
  description: "Internal ticketing system for Just For You Alterations, Mt Juliet TN.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body min-h-screen bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
