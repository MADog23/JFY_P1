import type { MetadataRoute } from "next";

// PWA manifest — Next serves this at /manifest.webmanifest and links it automatically
// (see app/layout.tsx). This is what "Add to Home Screen" / "Save to Home Screen"
// reads to pick the icon and app name shown on the device's home screen, so its
// icons are the dark rounded-square brand mark (app/icon.png and app/apple-icon.png
// cover the browser-tab favicon and iOS home-screen icon respectively; these are the
// same artwork at the sizes Android/Chrome's install prompt expects).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Just For You Alterations — Digital Ticket",
    short_name: "JFY",
    description: "Internal ticketing system for Just For You Alterations, Mt Juliet TN.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF5F4", // cream — matches the app's page background (tailwind.config.ts)
    theme_color: "#8A4A56", // thread — matches the app's primary accent (tailwind.config.ts)
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
