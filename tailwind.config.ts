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

