import type { Config } from "tailwindcss";

/**
 * Tailwind config — coexists with the existing Clay-inspired design system
 * (plain CSS in globals.css). The shadcn-style components we add (Dialog,
 * AlertDialog, Sonner toasts) use Tailwind utility classes; everything
 * else continues to use the .clay-* class system.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
    },
    extend: {
      colors: {
        border: "var(--oat-border)",
        input: "var(--oat-border)",
        ring: "var(--focus-ring, rgb(20 110 245))",
        background: "var(--pure-white)",
        foreground: "var(--clay-black)",
        primary: {
          DEFAULT: "var(--ube-800)",
          foreground: "var(--pure-white)",
        },
        secondary: {
          DEFAULT: "var(--oat-light)",
          foreground: "var(--clay-black)",
        },
        destructive: {
          DEFAULT: "var(--pomegranate-400)",
          foreground: "var(--clay-black)",
        },
        muted: {
          DEFAULT: "var(--oat-light)",
          foreground: "var(--warm-charcoal)",
        },
        accent: {
          DEFAULT: "var(--matcha-600)",
          foreground: "var(--pure-white)",
        },
      },
      borderRadius: {
        lg: "var(--radius-card)",
        md: "calc(var(--radius-card) - 2px)",
        sm: "var(--radius-sharp)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
