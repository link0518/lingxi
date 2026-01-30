/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        "surface-glass": "rgb(var(--surface-glass) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        pink: "rgb(var(--pink) / <alpha-value>)",
        "pink-soft": "rgb(var(--pink-soft) / <alpha-value>)",
        cta: "rgb(var(--cta) / <alpha-value>)",
        "cta-soft": "rgb(var(--cta-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        "gold-soft": "rgb(var(--gold-soft) / <alpha-value>)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        bubble: "var(--radius-bubble)",
      },
      boxShadow: {
        soft: "0 10px 30px rgb(var(--shadow-rgb) / 0.06)",
        softHover: "0 14px 38px rgb(var(--shadow-rgb) / 0.08)",
        ringSoft: "0 0 0 1px rgb(var(--line) / 1), 0 10px 30px rgb(var(--shadow-rgb) / 0.06)",
        // macOS Visual Physics Shadows
        "mac-light": "0 0 0 1px rgba(0,0,0,0.05)", /* 0.5px hairline simulation */
        "mac-dark": "0 0 0 1px rgba(255,255,255,0.1)",
        "mac-window": "0 0 1px rgba(0,0,0,0.4), 0 16px 36px -8px rgba(0,0,0,0.2)", /* Deep window shadow */
        "mac-bezel": "inset 0 1px 0 0 rgba(255,255,255,0.4)", /* Top inner highlight */
        "mac-active": "0 0 0 1px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.1)",
      },
      animation: {
        blob: "blob 7s infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "pulse-slow": "pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};
