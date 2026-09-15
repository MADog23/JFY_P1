import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette matches justforyoualterations.com's own declared brand color
        // (#d7cfd2, a soft dusty rose/mauve) rather than an invented "tailoring shop"
        // look — see /home/claude notes in the handoff for how these were derived.
        ink: "#241B1E", // primary text, near-black with a warm plum undertone
        charcoal: "#4A383D", // secondary text / labels
        thread: "#8A4A56", // primary accent — links, active states, buttons
        brass: "#B98A93", // secondary accent — badge fills/borders, highlights
        cream: "#FAF5F4", // page background
        linen: "#DAD0D2", // borders / card hairlines — closest match to the site's own #d7cfd2
        sage: "#6B8071", // semantic "completed / success" color, kept distinct from the brand hue
        rose: "#A65C57",
        alert: "#B23A45", // errors, overdue — kept in the same warm family as the rest

        // Chart-only accent colors — NOT part of the UI chrome palette above (buttons,
        // links, borders keep using thread/brass/etc. exactly as before). These exist
        // solely for the handful of analytics charts that genuinely need 2-3
        // side-by-side series colors (e.g. revenue composition's 3 charge types,
        // scheduled-vs-worked hours). The brand palette above is deliberately soft/muted
        // for UI chrome, but that same low saturation fails real colorblind-safety and
        // legibility checks when reused as chart series colors — these three were chosen
        // and validated specifically for that job (OKLCH chroma/lightness/contrast +
        // CVD-simulated separation, both protanopia and deuteranopia, against the cream
        // surface). Always assign in this fixed order — chartWine, chartGold, chartTeal —
        // never re-ordered or cycled, same as any categorical palette. A 2-series chart
        // MUST use an adjacent pair (wine+gold, or gold+teal) — wine+teal directly next to
        // each other fails the deuteranopia check (both read as similar to red-green
        // colorblind viewers when paired alone, without gold between them as a bridge).
        chartWine: "#9C3B4A",
        chartGold: "#B8791F",
        chartTeal: "#00805F",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "serif"],
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

