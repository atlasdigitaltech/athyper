/**
 * @athyper/platform-theme — Preset Validator
 *
 * Validates that a CSS preset file defines all required theme variables.
 * Used in two contexts:
 *
 *   1. CI: `pnpm --filter @athyper/platform-theme validate-presets`
 *      Checks all shipped presets against the contract.
 *
 *   2. Runtime: when a tenant uploads a custom preset CSS file,
 *      call validatePresetCSS() to verify completeness before saving.
 *
 * The validator checks both light and dark mode blocks.
 */
import {
  THEME_CONTRACT_VERSION,
  REQUIRED_THEME_VARIABLES,
  OPTIONAL_THEME_VARIABLES,
  DARK_MODE_INHERITED_THEME_VARIABLES,
} from "./theme-contract";

export interface PresetValidationResult {
  valid: boolean;
  presetName: string;
  contractVersion: number;
  /** Variables required but not found in the light-mode CSS block */
  missingLight: string[];
  /** Variables required but not found in the .dark block and not inherited */
  missingDark: string[];
  /** Variables found in CSS but not in the contract (informational) */
  extraVariables: string[];
  /** Warnings (non-blocking) */
  warnings: string[];
}

/** Extract all CSS variable names from a CSS string. */
function extractVariableNames(css: string): Set<string> {
  const vars = new Set<string>();
  const regex = /^\s*(--[\w-]+)\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    vars.add(match[1]!);
  }
  return vars;
}

/** Split a CSS file into its light-mode and dark-mode blocks. */
function splitLightDark(css: string): { light: string; dark: string } {
  const darkIndex = css.indexOf(".dark:");
  if (darkIndex === -1) {
    return { light: css, dark: "" };
  }
  return {
    light: css.substring(0, darkIndex),
    dark: css.substring(darkIndex),
  };
}

/**
 * Validate a CSS preset string against the theme contract.
 *
 * A preset is considered `valid` when:
 *   - All required variables are present in the light-mode block, AND
 *   - If a .dark block is present, all non-inherited required variables appear in it.
 *
 * A preset with NO dark block is still valid (dark mode inherits light values).
 * The caller should surface `warnings` to the user in that case.
 *
 * @param css - The full CSS file content
 * @param presetName - Human label for error messages
 * @returns Validation result with missing/extra variable details
 */
export function validatePresetCSS(css: string, presetName: string): PresetValidationResult {
  const { light, dark } = splitLightDark(css);
  const lightVars = extractVariableNames(light);
  const darkVars = extractVariableNames(dark);

  const required = new Set(REQUIRED_THEME_VARIABLES);
  const optional = new Set<string>(OPTIONAL_THEME_VARIABLES);
  const darkInherited = new Set<string>(DARK_MODE_INHERITED_THEME_VARIABLES);

  const missingLight: string[] = [];
  for (const v of required) {
    if (!lightVars.has(v)) missingLight.push(v);
  }

  // Only check dark vars when a .dark block is actually present. A preset with
  // no dark block is valid but produces a warning (dark inherits light values).
  const missingDark: string[] = [];
  if (dark.length > 0) {
    for (const v of required) {
      if (darkInherited.has(v)) continue;
      if (!darkVars.has(v)) missingDark.push(v);
    }
  }

  const allKnown: Set<string> = new Set([...required, ...optional]);
  const allFound = new Set([...lightVars, ...darkVars]);
  const extraVariables: string[] = [];
  for (const v of allFound) {
    if (!allKnown.has(v)) {
      extraVariables.push(v);
    }
  }

  const warnings: string[] = [];
  if (dark.length === 0) {
    warnings.push("No .dark: block found — dark mode will inherit light values.");
  }

  return {
    // Both light AND dark (when present) must be complete for the preset to be valid.
    valid: missingLight.length === 0 && missingDark.length === 0,
    presetName,
    contractVersion: THEME_CONTRACT_VERSION,
    missingLight,
    missingDark,
    extraVariables,
    warnings,
  };
}
