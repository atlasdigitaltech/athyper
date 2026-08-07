/**
 * @athyper/platform-theme — Preset Validator CLI
 *
 * Standalone Node CLI that validates all shipped presets.
 *
 * Usage:
 *   pnpm --filter @athyper/platform-theme validate-presets
 *
 * Kept separate from preset-validator.ts so consumers don't transitively
 * pull Node types into their typecheck graph.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEME_CONTRACT_VERSION } from "./theme-contract";
import { validatePresetCSS } from "./preset-validator";

if (process.argv.includes("--check-shipped")) {
  // import.meta.dirname is Node 21.2+; use URL-based path for Node 18/20 compat.
  const presetsDir = join(fileURLToPath(new URL(".", import.meta.url)), "presets");

  const legacyEntryPoints = new Set(["base.css", "neon-base.css"]);
  const files = readdirSync(presetsDir).filter(
    (file) => file.endsWith(".css") && !legacyEntryPoints.has(file),
  );
  let allValid = true;

  console.log(`Validating ${files.length} presets against contract v${THEME_CONTRACT_VERSION}\n`);

  for (const file of files) {
    const css = readFileSync(join(presetsDir, file), "utf-8");
    const name = file.replace(".css", "");
    const result = validatePresetCSS(css, name);

    if (!result.valid) {
      allValid = false;
      if (result.missingLight.length > 0) {
        console.error(`✗ ${name}: MISSING light vars: ${result.missingLight.join(", ")}`);
      }
      if (result.missingDark.length > 0) {
        console.error(`✗ ${name}: MISSING dark vars: ${result.missingDark.join(", ")}`);
      }
    } else {
      console.log(`✓ ${name}`);
    }

    for (const w of result.warnings) {
      console.warn(`  ⚠ ${name}: ${w}`);
    }
  }

  console.log(allValid ? "\nAll presets valid." : "\nValidation FAILED.");
  process.exit(allValid ? 0 : 1);
}
