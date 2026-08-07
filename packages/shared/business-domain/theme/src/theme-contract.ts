/**
 * @athyper/platform-theme — Theme Variable Contract
 *
 * Canonical list of CSS custom properties every theme preset must define.
 * Derived from the union of all 11 shipped presets, audited for completeness.
 *
 * VERSIONED CONTRACT:
 *   This is public platform surface area. Once tenants upload custom presets,
 *   the variable set becomes a compatibility boundary. Adding variables requires
 *   bumping THEME_CONTRACT_VERSION so the validator can distinguish presets
 *   built for v1 from presets built for v2.
 *
 * Variable values use oklch() color space for perceptual uniformity.
 * Runtime switching: document.documentElement.dataset.themePreset = "preset-name"
 * Dark mode: document.documentElement.classList.toggle("dark")
 */

/**
 * Contract version. Bump when adding, removing, or renaming variables.
 * Presets declare which version they target; the validator checks compatibility.
 */
export const THEME_CONTRACT_VERSION = 1;

// ── Variable Groups ─────────────────────────────────────────────

export interface ThemeSurfaceVars {
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
}

export interface ThemeBrandVars {
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
}

export interface ThemeStateVars {
  "--muted": string;
  "--muted-foreground": string;
  "--destructive": string;
  "--border": string;
  "--input": string;
  "--ring": string;
}

export interface ThemeSemanticVars {
  "--success": string;
  "--success-foreground": string;
  "--warning": string;
  "--warning-foreground": string;
  "--info": string;
  "--info-foreground": string;
}

export interface ThemeChartVars {
  "--chart-1": string;
  "--chart-2": string;
  "--chart-3": string;
  "--chart-4": string;
  "--chart-5": string;
  "--categorical-1": string;
  "--categorical-2": string;
  "--categorical-3": string;
  "--categorical-4": string;
  "--categorical-5": string;
}

export interface ThemeSidebarVars {
  "--sidebar": string;
  "--sidebar-foreground": string;
  "--sidebar-primary": string;
  "--sidebar-primary-foreground": string;
  "--sidebar-accent": string;
  "--sidebar-accent-foreground": string;
  "--sidebar-border": string;
  "--sidebar-ring": string;
}

export interface ThemeShadowVars {
  "--shadow-2xs": string;
  "--shadow-xs": string;
  "--shadow-sm": string;
  "--shadow": string;
  "--shadow-md": string;
  "--shadow-lg": string;
  "--shadow-xl": string;
  "--shadow-2xl": string;
}

export interface ThemeLayoutVars {
  "--radius": string;
}

// ── Full Contract ───────────────────────────────────────────────

export interface ThemeVariableContract
  extends ThemeSurfaceVars,
    ThemeBrandVars,
    ThemeStateVars,
    ThemeSemanticVars,
    ThemeChartVars,
    ThemeSidebarVars,
    ThemeShadowVars,
    ThemeLayoutVars {}

/**
 * All variable names a preset must define (v1 contract).
 * Used by the preset validator for CI checks and tenant preset uploads.
 */
export const REQUIRED_THEME_VARIABLES: readonly (keyof ThemeVariableContract)[] = [
  // Surface (6)
  "--background", "--foreground",
  "--card", "--card-foreground",
  "--popover", "--popover-foreground",
  // Brand (6)
  "--primary", "--primary-foreground",
  "--secondary", "--secondary-foreground",
  "--accent", "--accent-foreground",
  // State (6)
  "--muted", "--muted-foreground",
  "--destructive",
  "--border", "--input", "--ring",
  // Semantic (6)
  "--success", "--success-foreground",
  "--warning", "--warning-foreground",
  "--info", "--info-foreground",
  // Chart + Categorical (10)
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--categorical-1", "--categorical-2", "--categorical-3", "--categorical-4", "--categorical-5",
  // Sidebar (8)
  "--sidebar", "--sidebar-foreground",
  "--sidebar-primary", "--sidebar-primary-foreground",
  "--sidebar-accent", "--sidebar-accent-foreground",
  "--sidebar-border", "--sidebar-ring",
  // Shadow (8)
  "--shadow-2xs", "--shadow-xs", "--shadow-sm", "--shadow",
  "--shadow-md", "--shadow-lg", "--shadow-xl", "--shadow-2xl",
  // Layout (1)
  "--radius",
] as const;

/**
 * Required variables that intentionally inherit from the light block in dark mode.
 * These still must exist on every preset root, but a .dark block does not need to
 * redeclare layout values unless the preset wants a different dark-mode shape.
 */
export const DARK_MODE_INHERITED_THEME_VARIABLES = [
  "--radius",
] as const satisfies readonly (keyof ThemeVariableContract)[];

/**
 * Optional variables that presets may define but are not required.
 * Tailwind preset provides fallbacks for these.
 */
export const OPTIONAL_THEME_VARIABLES = [
  "--destructive-foreground",
  "--scrim-modal",
  "--scrim-command",
  "--scrim-drawer",
  "--scrim-context",
] as const;
