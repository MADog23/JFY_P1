import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2321",
        charcoal: "#2E3532",
        thread: "#8A5A44",
        brass: "#B08D57",
        cream: "#F7F4EE",
        linen: "#EDE7DA",
        sage: "#5C7A6A",
        rose: "#A65C57",
        alert: "#B3492B",
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
