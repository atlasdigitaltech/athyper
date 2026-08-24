#!/usr/bin/env tsx
/** Generates the standalone Keycloak token bridge from the active theme source. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLOR_TOKENS, DENSITY_TOKENS, FOUNDATION_TOKENS, type ColorMode } from "../src/tokens";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../../../..");
const output = path.join(repoRoot, "stack/config/iam/themes/neon/login/resources/css/iam.tokens.css");
const check = process.argv.includes("--check");

const kebab = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function canonicalColors(mode: ColorMode): string[] {
  return Object.entries(COLOR_TOKENS[mode]).map(([name, value]) => `  --a-${kebab(name)}: ${value};`);
}

function compatibilityAliases(): string[] {
  return [
    "--athyper-color-bg:var(--a-background)", "--athyper-color-surface:var(--a-muted)",
    "--athyper-color-surface-raised:var(--a-surface-raised)", "--athyper-color-text:var(--a-foreground)",
    "--athyper-color-muted:var(--a-muted-foreground)", "--athyper-color-border:var(--a-border)",
    "--athyper-color-primary:var(--a-primary)", "--athyper-color-primary-foreground:var(--a-primary-foreground)",
    "--athyper-color-success:var(--a-success)", "--athyper-color-warning:var(--a-warning)",
    "--athyper-color-danger:var(--a-danger)", "--athyper-color-info:var(--a-primary)",
    "--athyper-color-neon:var(--a-brand)", "--athyper-color-mesh:var(--a-brand)",
    "--athyper-color-studio:var(--a-brand)", "--plane-accent:var(--a-primary)",
    "--athyper-font-sans:var(--a-font-sans)", "--athyper-font-mono:var(--a-font-mono)",
    ...Object.keys(FOUNDATION_TOKENS.spacing).map((key) => `--athyper-space-${key}:var(--a-space-${key})`),
    "--athyper-radius-sm:var(--a-radius-sm)", "--athyper-radius-md:var(--a-radius-md)",
    "--athyper-radius-lg:var(--a-radius-lg)", "--athyper-radius-xl:var(--a-radius-xl)",
    "--athyper-shadow-sm:var(--a-shadow-raised)", "--athyper-shadow-md:var(--a-shadow-raised)",
    "--athyper-shadow-lg:var(--a-shadow-prominent)", "--athyper-focus-ring:0 0 0 var(--a-focus-width) var(--a-focus)",
    "--athyper-motion-fast:var(--a-motion-fast)", "--athyper-motion-normal:var(--a-motion-normal)",
    "--background:var(--a-background)", "--foreground:var(--a-foreground)", "--card:var(--a-surface-raised)",
    "--card-foreground:var(--a-foreground)", "--popover:var(--a-surface-raised)", "--popover-foreground:var(--a-foreground)",
    "--primary:var(--a-primary)", "--primary-foreground:var(--a-primary-foreground)",
    "--secondary:var(--a-muted)", "--secondary-foreground:var(--a-foreground)",
    "--accent:var(--a-muted)", "--accent-foreground:var(--a-foreground)",
    "--muted:var(--a-muted)", "--muted-foreground:var(--a-muted-foreground)",
    "--destructive:var(--a-danger)", "--destructive-foreground:var(--a-danger-foreground)",
    "--success:var(--a-success)", "--warning:var(--a-warning)", "--info:var(--a-primary)",
    "--border:var(--a-border)", "--input:var(--a-input)", "--ring:var(--a-focus)",
    "--radius:var(--a-radius-md)", "--shadow-sm:var(--a-shadow-raised)", "--shadow-md:var(--a-shadow-raised)",
    "--bg:var(--a-background)", "--fg:var(--a-foreground)", "--primary-fg:var(--a-primary-foreground)",
    "--muted-fg:var(--a-muted-foreground)", "--input-bg:var(--a-surface-raised)",
  ].map((value) => `  ${value};`);
}

const t = FOUNDATION_TOKENS;
const structural = [
  `--a-theme-family:atlas-modern`,
  `--a-font-sans:${t.typography.sans}`, `--a-font-mono:${t.typography.mono}`,
  `--a-font-size-body:${t.typography.body}`, `--a-font-size-sm:${t.typography.small}`, `--a-font-size-title:${t.typography.title}`,
  `--a-line-height-body:${t.typography.bodyLineHeight}`, `--a-line-height-title:${t.typography.titleLineHeight}`, `--a-font-weight-regular:${t.typography.regularWeight}`, `--a-font-weight-strong:${t.typography.strongWeight}`,
  ...Object.entries(t.spacing).map(([key, value]) => `--a-space-${key}:${value}`),
  `--a-radius-sm:${t.radii.small}`, `--a-radius-md:${t.radii.medium}`, `--a-radius-lg:${t.radii.large}`, `--a-radius-xl:${t.radii.extraLarge}`, `--a-radius-round:${t.radii.round}`,
  `--a-shadow-raised:${t.elevation.raised}`, `--a-shadow-overlay:${t.elevation.overlay}`, `--a-shadow-prominent:${t.elevation.prominent}`,
  `--a-motion-fast:${t.motion.fast}`, `--a-motion-normal:${t.motion.normal}`, `--a-motion-slow:${t.motion.slow}`, `--a-easing:${t.motion.easing}`,
  `--a-focus-width:${t.accessibility.focusWidth}`, `--a-focus-offset:${t.accessibility.focusOffset}`,
  `--a-border-width:${t.borders.width}`, `--a-content-sm:${t.sizing.contentSmall}`, `--a-icon-sm:${t.sizing.iconSmall}`, `--a-icon-md:${t.sizing.iconMedium}`, `--a-logo-md:${t.sizing.logoMedium}`,
  `--a-control-height:${DENSITY_TOKENS.comfortable.controlHeight}`, `--a-touch-target:${DENSITY_TOKENS.comfortable.touchTarget}`,
  `--a-opacity-interactive:${t.opacity.interactive}`, `--a-opacity-disabled:${t.opacity.disabled}`,
].map((value) => `  ${value};`);

const css = `/*\n * GENERATED from @athyper/platform-theme/src/tokens.ts.\n * Do not edit. Run: pnpm iam:build\n */\n@font-face {\n  font-family: "Geist";\n  src: url("../fonts/Geist-Variable.woff2") format("woff2");\n  font-style: normal;\n  font-weight: 100 900;\n  font-display: swap;\n}\n\n:root, :root[data-theme="light"] {\n${[...canonicalColors("light"), ...structural, ...compatibilityAliases()].join("\n")}\n  color-scheme: light;\n}\n\n:root[data-theme="dark"], :root.dark {\n${canonicalColors("dark").join("\n")}\n  color-scheme: dark;\n}\n\n:root[data-theme="high-contrast"] {\n${canonicalColors("high-contrast").join("\n")}\n  color-scheme: dark;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  :root { --a-motion-fast: 0ms; --a-motion-normal: 0ms; --a-motion-slow: 0ms; }\n}\n`;

if (check) {
  const current = await readFile(output, "utf8").catch(() => "");
  if (current !== css) throw new Error("IAM token CSS is stale. Run: pnpm iam:build");
  console.log("IAM token CSS is current.");
} else {
  await writeFile(output, css, "utf8");
  console.log(`Generated ${path.relative(repoRoot, output)} from active theme tokens.`);
}
