/**
 * @athyper/theme — Tailwind CSS 4 Preset
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ TAILWIND INTEGRATION MODE: JS Preset consuming CSS variables    │
 * │                                                                  │
 * │ This is a JavaScript/TypeScript Tailwind preset. It does NOT    │
 * │ define color values — it maps CSS custom properties to Tailwind │
 * │ utility class names. The actual color values live in CSS preset │
 * │ files (e.g. presets/modern-minimal.css) and are switched at     │
 * │ runtime via the data-theme-preset HTML attribute.               │
 * │                                                                  │
 * │ We chose JS preset over CSS-first @theme because:              │
 * │  1. Portable — works in any Tailwind 3.x or 4.x configuration  │
 * │  2. Composable — packages can extend via presets: [athyperPreset]│
 * │  3. Typed — TypeScript catches invalid theme keys at build time │
 * │                                                                  │
 * │ This file should be the ONLY place Tailwind theme mapping is    │
 * │ defined. Do not add ad hoc CSS variable references in component │
 * │ styles or inline @theme blocks. If a new utility is needed,     │
 * │ add it here.                                                    │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   // tailwind.config.ts (in any app or package)
 *   import athyperPreset from "@athyper/theme/tailwind-preset";
 *   export default { presets: [athyperPreset], content: [...] };
 */
import type { Config } from "tailwindcss";

const athyperPreset: Config = {
  content: [],
  theme: {
    // ── Colors — all mapped from CSS custom properties ───────
    colors: {
      transparent: "transparent",
      current: "currentColor",

      background: "var(--background)",
      foreground: "var(--foreground)",

      card:    { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
      popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
      primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
      secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
      accent:  { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
      muted:   { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },

      // --destructive-foreground is optional (fallback to --primary-foreground)
      destructive: {
        DEFAULT: "var(--destructive)",
        foreground: "var(--destructive-foreground, var(--primary-foreground))",
      },

      success: { DEFAULT: "var(--success)", foreground: "var(--success-foreground)" },
      warning: { DEFAULT: "var(--warning)", foreground: "var(--warning-foreground)" },
      info:    { DEFAULT: "var(--info)", foreground: "var(--info-foreground)" },

      border: "var(--border)",
      input:  "var(--input)",
      ring:   "var(--ring)",

      chart: {
        1: "var(--chart-1)", 2: "var(--chart-2)", 3: "var(--chart-3)",
        4: "var(--chart-4)", 5: "var(--chart-5)",
      },
      categorical: {
        1: "var(--categorical-1)", 2: "var(--categorical-2)", 3: "var(--categorical-3)",
        4: "var(--categorical-4)", 5: "var(--categorical-5)",
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

    // ── Border Radius — driven by --radius variable ──────────
    borderRadius: {
      none: "0px",
      sm:   "calc(var(--radius) - 4px)",
      md:   "calc(var(--radius) - 2px)",
      DEFAULT: "var(--radius)",
      lg:   "var(--radius)",
      xl:   "calc(var(--radius) + 4px)",
      "2xl": "calc(var(--radius) + 8px)",
      "3xl": "calc(var(--radius) + 16px)",
      full: "9999px",
    },

    // ── Shadows — from CSS variables (per-theme character) ───
    boxShadow: {
      "2xs": "var(--shadow-2xs)",
      xs:    "var(--shadow-xs)",
      sm:    "var(--shadow-sm)",
      DEFAULT: "var(--shadow)",
      md:    "var(--shadow-md)",
      lg:    "var(--shadow-lg)",
      xl:    "var(--shadow-xl)",
      "2xl": "var(--shadow-2xl)",
      none:  "none",
    },

    // ── Typography (shared across all presets) ───────────────
    fontFamily: {
      sans:   ["var(--font-geist-sans)", "Geist", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      mono:   ["var(--font-geist-mono)", "Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      serif:  ["var(--font-serif)", "Source Serif 4", "Georgia", "Cambria", "serif"],
      arabic: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "Geist", "system-ui", "sans-serif"],
      tamil:  ["Noto Sans Tamil", "Geist", "system-ui", "sans-serif"],
    },
    fontSize: {
      "2xs": ["0.625rem",  { lineHeight: "0.875rem" }],
      xs:    ["0.75rem",   { lineHeight: "1rem" }],
      sm:    ["0.8125rem", { lineHeight: "1.25rem" }],
      base:  ["0.875rem",  { lineHeight: "1.375rem" }],
      md:    ["0.9375rem", { lineHeight: "1.5rem" }],
      lg:    ["1rem",      { lineHeight: "1.5rem" }],
      xl:    ["1.125rem",  { lineHeight: "1.75rem" }],
      "2xl": ["1.25rem",   { lineHeight: "1.875rem" }],
      "3xl": ["1.5rem",    { lineHeight: "2rem" }],
      "4xl": ["1.875rem",  { lineHeight: "2.25rem" }],
      "5xl": ["2.25rem",   { lineHeight: "2.75rem" }],
    },

    // ── Extended ─────────────────────────────────────────────
    extend: {
      fontSize: {
        // ── Entity Document Typography Scale ────────────────────────────────
        // Shared by all document entities via ApprovableDocumentHeader et al.
        // Token names describe role, not location — safe to use on any entity.
        "doc-number":      ["16px",    { lineHeight: "1.2",  fontWeight: "600", letterSpacing: "-0.01em"  }],
        "doc-subtitle":    ["12px",    { lineHeight: "1.4",  fontWeight: "400"  }],
        "doc-badge":       ["13px",    { lineHeight: "1",    fontWeight: "600"  }],
        "doc-field-label": ["10px",    { lineHeight: "1",    fontWeight: "600",  letterSpacing: "0.12em"  }],
        "doc-field-value": ["14px",    { lineHeight: "1.2",  fontWeight: "600"  }],
        "doc-amount":      ["14px",    { lineHeight: "1.2",  fontWeight: "700",  letterSpacing: "-0.005em" }],
        "doc-support":     ["11px",    { lineHeight: "1.4",  fontWeight: "400"  }],
        "doc-action":      ["12.5px",  { lineHeight: "1",    fontWeight: "600"  }],
      },
      width: {
        sidebar: "256px",
        "sidebar-collapsed": "64px",
        "nav-rail": "54px",
        "context-panel": "252px",
      },
      maxWidth: {
        "content-sm":   "640px",
        "content-md":   "768px",
        "content-lg":   "1024px",
        "content-xl":   "1280px",
        "content-full": "1536px",
      },
      zIndex: {
        dropdown: "50",
        sticky:   "100",
        fixed:    "200",
        overlay:  "300",
        modal:    "400",
        popover:  "500",
        toast:    "600",
        command:  "700",
      },
      keyframes: {
        "fade-in":        { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out":       { from: { opacity: "1" }, to: { opacity: "0" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "slide-in-left":  { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        "slide-in-up":    { from: { transform: "translateY(10px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "scale-in":       { from: { transform: "scale(0.95)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
        spinner:          { to: { transform: "rotate(360deg)" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "fade-in":        "fade-in 200ms ease-out",
        "fade-out":       "fade-out 150ms ease-in",
        "slide-in-right": "slide-in-right 300ms ease-out",
        "slide-in-left":  "slide-in-left 300ms ease-out",
        "slide-in-up":    "slide-in-up 200ms ease-out",
        "scale-in":       "scale-in 200ms ease-out",
        spinner:          "spinner 600ms linear infinite",
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up":   "accordion-up 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default athyperPreset;
