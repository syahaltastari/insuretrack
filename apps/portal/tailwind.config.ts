import type { Config } from "tailwindcss";

/**
 * Tailwind config untuk apps/portal. Coexists with the Clay-inspired design
 * system (plain CSS di @insuretrack/ui/styles/globals.css). shadcn-style
 * components (Dialog, AlertDialog, Sonner toasts) pakai Tailwind utility
 * classes; sisanya tetap .clay-* class system.
 *
 * Brand color palette di-expose sebagai Tailwind utilities (mis.
 * `bg-matcha-300`, `text-ube-800`, `border-oat-border`) supaya section
 * components bisa pakai utility-first syntax tanpa hardcode inline
 * `style={{ color: "var(--...)" }}` kecuali untuk one-off cases.
 *
 * Semua warna di bawah reference CSS variables yang didefinisikan di
 * packages/ui/src/styles/globals.css. Single source of truth tetap di CSS.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/forms/src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
    },
    extend: {
      colors: {
        // shadcn-style semantic aliases (existing)
        border: "var(--oat-border)",
        input: "var(--oat-border)",
        ring: "var(--focus-ring, rgb(20 110 245))",
        background: "var(--pure-white)",
        foreground: "var(--clay-black)",
        // Remapped ke Honey (landing refresh). Form components yang
        // butuh ube-800 (admin-style) bisa pakai `bg-ube-800` di bawah.
        primary: {
          DEFAULT: "var(--honey-700)",
          foreground: "var(--canvas)",
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
        // Honey brand palette (landing refresh v2). Reference CSS
        // variables di packages/ui/src/styles/globals.css. Single
        // source of truth tetap di CSS.
        honey: {
          50: "var(--honey-50)",
          100: "var(--honey-100)",
          200: "var(--honey-200)",
          300: "var(--honey-300)",
          400: "var(--honey-400)",
          500: "var(--honey-500)",
          600: "var(--honey-600)",
          700: "var(--honey-700)",
          800: "var(--honey-800)",
          900: "var(--honey-900)",
        },
        // Warm-off-white surface scale (landing canvas)
        canvas: "var(--canvas)",
        paper: "var(--paper)",
        sand: "var(--sand)",
        honeyTint: "var(--honey-tint)",
        // Refined neutrals (warm-black, warm-grey)
        ink: "var(--ink)",
        charcoal: "var(--charcoal)",
        stone: "var(--stone)",
        // Refined oat (warm border)
        oatRefined: "var(--oat-refined)",
        oatLightRefined: "var(--oat-light-refined)",
        // Brand palette — direct access ke design tokens.
        // Pakai di section components untuk utility-first styling.
        matcha: {
          300: "var(--matcha-300)",
          600: "var(--matcha-600)",
          800: "var(--matcha-800)",
        },
        slushie: {
          500: "var(--slushie-500)",
          800: "var(--slushie-800)",
        },
        lemon: {
          400: "var(--lemon-400)",
          500: "var(--lemon-500)",
          700: "var(--lemon-700)",
          800: "var(--lemon-800)",
        },
        ube: {
          300: "var(--ube-300)",
          800: "var(--ube-800)",
          900: "var(--ube-900)",
        },
        pomegranate: {
          400: "var(--pomegranate-400)",
        },
        blueberry: {
          800: "var(--blueberry-800)",
        },
        clay: {
          black: "var(--clay-black)",
          white: "var(--pure-white)",
        },
        warm: {
          cream: "var(--warm-cream)",
          silver: "var(--warm-silver)",
          charcoal: "var(--warm-charcoal)",
        },
        dark: {
          charcoal: "var(--dark-charcoal)",
        },
        oat: {
          border: "var(--oat-border)",
          light: "var(--oat-light)",
        },
        cool: {
          border: "var(--cool-border)",
        },
        darkBorder: "var(--dark-border)",
        lightFrost: "var(--light-frost)",
      },
      borderRadius: {
        lg: "var(--radius-card)",
        md: "calc(var(--radius-card) - 2px)",
        sm: "var(--radius-sharp)",
        // Brand-specific radii dari design system
        standard: "var(--radius-standard)",
        badge: "var(--radius-badge)",
        feature: "var(--radius-feature)",
        section: "var(--radius-section)",
        pill: "var(--radius-pill)",
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
