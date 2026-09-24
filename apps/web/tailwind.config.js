/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07080b",
        panel: "#0b0d12",
        surface: "#101319",
        surface2: "#0d1015",
        border: "rgba(255,255,255,.08)",
        border2: "rgba(255,255,255,.06)",
        text: "#e6e8ee",
        "text-dim": "rgba(230,232,238,.5)",
        "text-faint": "rgba(230,232,238,.35)",
        amber: "#f0b44a",
        pink: "#e8639b",
        green: "#5fd08a",
        blue: "#58b7f0",
        purple: "#a084f5",
      },
      fontFamily: {
        display: ["Chakra Petch", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
