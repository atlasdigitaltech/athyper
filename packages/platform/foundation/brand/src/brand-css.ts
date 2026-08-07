/**
 * @athyper/platform-brand — CSS variable generation from tenant brand config.
 *
 * Bridges TenantBrandConfig → theme CSS variables. Depends on the palette
 * derivation in @athyper/platform-theme/brand-palette (no external color libraries).
 */

import {
  generateBrandColorOverrides,
  type CssVariableOverrides,
  type BrandColorOverrides,
} from "@athyper/platform-theme/brand-palette";
import type { TenantBrandConfig } from "./types";

/**
 * Derives light and dark CSS variable overrides from a TenantBrandConfig.
 * Returns `{ light: {}, dark: {} }` when no primaryHex is configured (base preset
 * is used as-is).
 *
 * The output is a delta — only the brand group variables that differ from the
 * base preset. Pass it to <BrandProvider config={{ cssVariableOverrides }} />.
 */
export function buildBrandCssOverrides(
  config: Pick<TenantBrandConfig, "primaryHex" | "accentHex">,
): BrandColorOverrides {
  if (!config.primaryHex) return { light: {}, dark: {} };
  return generateBrandColorOverrides({
    primaryHex: config.primaryHex,
    accentHex:  config.accentHex,
  });
}

/**
 * Builds a CSS selector block string from an override map.
 * Used by BrandProvider to inject an inline <style> for SSR hydration.
 * Keys and values are validated to prevent CSS injection.
 *
 * @param overrides - CSS variable key/value map
 * @param selector  - CSS selector (default: ":root")
 */
export function buildCssStyleBlock(
  overrides: CssVariableOverrides,
  selector = ":root",
): string {
  const vars = Object.entries(overrides)
    .filter(
      ([k, v]) =>
        /^--[a-z][a-z0-9-]*$/.test(k) &&
        !v.includes("<") &&
        !v.includes(">") &&
        !v.includes('"') &&
        !v.includes(";") &&
        !v.includes("url("),
    )
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  return vars ? `${selector} {\n${vars}\n}` : "";
}
