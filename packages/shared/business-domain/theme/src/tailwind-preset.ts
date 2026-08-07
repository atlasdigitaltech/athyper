/**
 * @athyper/platform-theme Tailwind integration.
 *
 * The concrete token values for typography come from typography.ts. This file
 * maps CSS variables and generated typography fragments into Tailwind theme
 * keys that apps can import directly.
 */

import type { Config } from "tailwindcss";
import {
  tailwindDocumentFontSize,
  tailwindFontFamilies,
  tailwindFontSize,
} from "./typography";

export const athyperTheme = {
  colors: {
    transparent: "transparent",
    current: "currentColor",

    background: "var(--background)",
    foreground: "var(--foreground)",

    card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
    popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
    primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
    secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
    accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
    muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },

    destructive: {
      DEFAULT: "var(--destructive)",
      foreground: "var(--destructive-foreground, var(--primary-foreground))",
    },

    success: { DEFAULT: "var(--success)", foreground: "var(--success-foreground)" },
    warning: { DEFAULT: "var(--warning)", foreground: "var(--warning-foreground)" },
    info: { DEFAULT: "var(--info)", foreground: "var(--info-foreground)" },

    border: "var(--border)",
    input: "var(--input)",
    ring: "var(--ring)",

    chart: {
      1: "var(--chart-1)",
      2: "var(--chart-2)",
      3: "var(--chart-3)",
      4: "var(--chart-4)",
      5: "var(--chart-5)",
    },
    categorical: {
      1: "var(--categorical-1)",
      2: "var(--categorical-2)",
      3: "var(--categorical-3)",
      4: "var(--categorical-4)",
      5: "var(--categorical-5)",
    },

    sidebar: {
      DEFAULT: "var(--sidebar)",
      foreground: "var(--sidebar-foreground)",
      primary: "var(--sidebar-primary)",
      "primary-foreground": "var(--sidebar-primary-foreground)",
      accent: "var(--sidebar-accent)",
      "accent-foreground": "var(--sidebar-accent-foreground)",
      border: "var(--sidebar-border)",
      ring: "var(--sidebar-ring)",
    },
  },

  borderRadius: {
    none: "0px",
    sm: "calc(var(--radius) - 4px)",
    md: "calc(var(--radius) - 2px)",
    DEFAULT: "var(--radius)",
    lg: "var(--radius)",
    xl: "calc(var(--radius) + 4px)",
    "2xl": "calc(var(--radius) + 8px)",
    "3xl": "calc(var(--radius) + 16px)",
    full: "9999px",
  },

  boxShadow: {
    "2xs": "var(--shadow-2xs)",
    xs: "var(--shadow-xs)",
    sm: "var(--shadow-sm)",
    DEFAULT: "var(--shadow)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
    "2xl": "var(--shadow-2xl)",
    none: "none",
  },

  fontFamily: tailwindFontFamilies,
  fontSize: tailwindFontSize,

  extend: {
    fontSize: tailwindDocumentFontSize,
    width: {
      sidebar: "256px",
      "sidebar-collapsed": "64px",
      "nav-rail": "54px",
      "context-panel": "252px",
    },
    maxWidth: {
      "content-sm": "640px",
      "content-md": "768px",
      "content-lg": "1024px",
      "content-xl": "1280px",
      "content-full": "1536px",
    },
    zIndex: {
      dropdown: "50",
      sticky: "100",
      fixed: "200",
      overlay: "300",
      modal: "400",
      popover: "500",
      toast: "600",
      command: "700",
    },
    keyframes: {
      "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
      "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
      "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
      "slide-in-left": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
      "slide-in-up": {
        from: { transform: "translateY(10px)", opacity: "0" },
        to: { transform: "translateY(0)", opacity: "1" },
      },
      "scale-in": {
        from: { transform: "scale(0.95)", opacity: "0" },
        to: { transform: "scale(1)", opacity: "1" },
      },
      spinner: { to: { transform: "rotate(360deg)" } },
      "pencil-write": {
        "0%, 100%": { transform: "rotate(0deg)" },
        "20%": { transform: "rotate(-12deg) translate(-0.5px, 0.5px)" },
        "40%": { transform: "rotate(2deg)" },
        "60%": { transform: "rotate(-12deg) translate(0.5px, -0.5px)" },
        "80%": { transform: "rotate(2deg)" },
      },
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
      "fade-in": "fade-in 200ms ease-out",
      "fade-out": "fade-out 150ms ease-in",
      "slide-in-right": "slide-in-right 300ms ease-out",
      "slide-in-left": "slide-in-left 300ms ease-out",
      "slide-in-up": "slide-in-up 200ms ease-out",
      "scale-in": "scale-in 200ms ease-out",
      spinner: "spinner 600ms linear infinite",
      "pencil-write": "pencil-write 1.6s ease-in-out infinite",
      "accordion-down": "accordion-down 200ms ease-out",
      "accordion-up": "accordion-up 200ms ease-out",
    },
  },
} satisfies NonNullable<Config["theme"]>;

const athyperPreset: Config = {
  content: [],
  theme: athyperTheme,
  plugins: [],
};

export default athyperPreset;
