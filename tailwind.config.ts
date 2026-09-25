import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ollie palette (from Screen Designs v18)
        blue: { DEFAULT: "#176B57", dark: "#124C40" },
        cyan: "#176B57",
        rail: "#203A33",
        paper: "#F7F8F5",
        card: "#FFFFFF",
        line: "#D9E3DD",
        line2: "#EAF0EC",
        text: "#202D29",
        muted: "#52645C",
        faint: "#61736B",
        under: "#0A8754",
        cash: "#0E8C8C",
        sub: "#A55B12",
        danger: "#D4503E",
      },
      fontFamily: {
        sans: ["Archivo", "ui-sans-serif", "system-ui", "-apple-system"],
        display: ["Archivo", "ui-sans-serif", "system-ui"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo"],
      },
      borderRadius: {
        DEFAULT: "11px",
        card: "16px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(13,27,46,.05), 0 10px 30px rgba(13,27,46,.07)",
      },
      keyframes: {
        loaderbar: {
          "0%":   { transform: "translateX(-100%)" },
          "50%":  { transform: "translateX(150%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        loaderbar: "loaderbar 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
