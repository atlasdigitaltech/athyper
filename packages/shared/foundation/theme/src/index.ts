/**
 * @athyper/theme
 *
 * Multi-preset theme system for Athyper.
 *
 * Import paths (locked — see package.json exports):
 *
 *   CSS:
 *     import "@athyper/theme/base.css";
 *     import "@athyper/theme/presets/base.css";
 *     import "@athyper/theme/presets/modern-minimal.css";
 *
 *   Tailwind config:
 *     import athyperPreset from "@athyper/theme/tailwind-preset";
 *
 *   TypeScript:
 *     import { cn } from "@athyper/theme/utils";
 *     import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
 *     import { themePresets, DEFAULT_PRESET } from "@athyper/theme/presets";
 *     import { THEME_CONTRACT_VERSION, REQUIRED_THEME_VARIABLES } from "@athyper/theme/contracts";
 *     import { validatePresetCSS } from "@athyper/theme/validator";
 *
 *   Or from this barrel:
 *     import { cn, resolveSemanticColors, themePresets } from "@athyper/theme";
 */

// Contract
export {
  THEME_CONTRACT_VERSION,
  REQUIRED_THEME_VARIABLES,
  OPTIONAL_THEME_VARIABLES,
} from "./theme-contract";
export type {
  ThemeVariableContract,
  ThemeSurfaceVars,
  ThemeBrandVars,
  ThemeStateVars,
  ThemeSemanticVars,
  ThemeChartVars,
  ThemeSidebarVars,
  ThemeShadowVars,
  ThemeLayoutVars,
} from "./theme-contract";

// Preset registry
export {
  themePresets,
  DEFAULT_PRESET,
  getPresetMeta,
  getPresetsByCategory,
} from "./presets/registry";
export type { ThemePresetMeta } from "./presets/registry";

// Semantic colors
export { resolveSemanticColors, SEMANTIC_INTENTS } from "./semantic-colors";
export type { SemanticIntent, SemanticColorSet } from "./semantic-colors";

// Domain intent mappings (business status/class → SemanticIntent)
export {
  adminStatusIntent,
  kanbanStatusIntent,
  entityClassIntent,
  dataTypeIntent,
  FIELD_FLAG_INTENT,
  accountClassIntent,
  chartTierIntent,
  consolMethodIntent,
  ownerTypeIntent,
  paymentDirectionIntent,
  reconTypeIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  apArStatusIntent,
  glSchemaIntent,
} from "./domain-intents";
export type { AdminStatus } from "./domain-intents";

// Validator
export { validatePresetCSS } from "./preset-validator";
export type { PresetValidationResult } from "./preset-validator";

// Utilities
export { cn } from "./utils";
