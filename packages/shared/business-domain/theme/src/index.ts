/**
 * @athyper/platform-theme
 *
 * Multi-preset theme system for Athyper.
 *
 * Import paths (locked — see package.json exports):
 *
 *   CSS:
 *     import "@athyper/platform-theme/base.css";
 *     import "@athyper/platform-theme/presets/base.css";
 *     import "@athyper/platform-theme/presets/modern-minimal.css";
 *
 *   Tailwind config:
 *     import athyperPreset from "@athyper/platform-theme/tailwind-preset";
 *
 *   TypeScript:
 *     import { cn } from "@athyper/platform-theme/utils";
 *     import { resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
 *     import { themePresets, DEFAULT_PRESET } from "@athyper/platform-theme/presets";
 *     import { THEME_CONTRACT_VERSION, REQUIRED_THEME_VARIABLES } from "@athyper/platform-theme/contracts";
 *     import { validatePresetCSS } from "@athyper/platform-theme/validator";
 *
 *   Or from this barrel:
 *     import { cn, resolveSemanticColors, themePresets } from "@athyper/platform-theme";
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
  workflowItemStatusIntent,
} from "./domain-intents";
export type { AdminStatus } from "./domain-intents";

// Validator
export { validatePresetCSS } from "./preset-validator";
export type { PresetValidationResult } from "./preset-validator";

// Utilities
export { cn } from "./utils";

// Typography
export {
  documentTypography,
  fontFamilies,
  renderTypographyCss,
  semanticTypography,
  t,
  tailwindDocumentFontSize,
  tailwindFontFamilies,
  tailwindFontSize,
  typeScale,
} from "./typography";
export type {
  DocumentTypeTokenName,
  FontFamilyToken,
  TypeScaleTokenName,
  TypographyToken,
} from "./typography";
