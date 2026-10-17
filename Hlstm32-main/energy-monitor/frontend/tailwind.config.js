/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        paper: "#FDFBF7",
        accent: {
          yellow: "#FFD02C",
          green: "#06D6A0",
          red: "#FF5D5D",
          blue: "#5B8DEF",
          purple: "#B392F0",
        },
      },
      boxShadow: {
        brutal: "4px 4px 0 0 #111111",
        "brutal-sm": "3px 3px 0 0 #111111",
        "brutal-lg": "8px 8px 0 0 #111111",
      },
      borderWidth: {
        brutal: "2px",
      },
      fontFamily: {
        display: [
          "Space Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
