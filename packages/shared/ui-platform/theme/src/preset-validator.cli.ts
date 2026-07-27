/**
 * @athyper/theme — Preset Validator CLI
 *
 * Standalone Node CLI that validates all shipped presets.
 *
 * Usage:
 *   pnpm --filter @athyper/theme validate-presets
 *
 * Kept separate from preset-validator.ts so consumers don't transitively
 * pull Node types into their typecheck graph.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_CONTRACT_VERSION } from "./theme-contract";
import { validatePresetCSS } from "./preset-validator";

if (process.argv.includes("--check-shipped")) {
  const presetsDir = join(import.meta.dirname ?? ".", "presets");

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
      console.error(`✗ ${name}: MISSING light vars: ${result.missingLight.join(", ")}`);
    } else {
      console.log(`✓ ${name}`);
    }

    if (result.missingDark.length > 0) {
      console.warn(`  ⚠ ${name}: missing dark vars: ${result.missingDark.join(", ")}`);
    }
    for (const w of result.warnings) {
      console.warn(`  ⚠ ${name}: ${w}`);
    }
  }

  console.log(allValid ? "\nAll presets valid." : "\nValidation FAILED.");
  process.exit(allValid ? 0 : 1);
}
