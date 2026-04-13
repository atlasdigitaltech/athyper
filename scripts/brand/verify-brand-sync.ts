#!/usr/bin/env tsx
/**
 * scripts/brand/verify-brand-sync.ts
 *
 * CI guard: fails if the Keycloak theme's generated brand assets are stale
 * or missing relative to the canonical source in packages/shared/foundation/brand/.
 *
 * Run: pnpm brand:verify
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const brandSrc = path.join(repoRoot, "packages/shared/foundation/brand/src/products/neon");
const kcLogin = path.join(repoRoot, "mesh/config/iam/themes/neon/login");
const kcImg = path.join(kcLogin, "resources/img");

async function sha256(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Re-generate expected FTL content without writing to disk, for comparison. */
async function expectedBrandLogoFtl(): Promise<string> {
  const svg = await fs.readFile(path.join(brandSrc, "logo-primary.svg"), "utf8");
  return [
    `<#-- ═══════════════════════════════════════════════════════════════════ -->`,
    `<#-- Generated from packages/shared/foundation/brand/src/products/neon/ -->`,
    `<#-- DO NOT EDIT DIRECTLY — run: pnpm brand:refresh                     -->`,
    `<#-- ═══════════════════════════════════════════════════════════════════ -->`,
    `<div class="kc-brand-logo">`,
    svg.trimEnd(),
    `</div>`,
    "",
  ].join("\n");
}

async function expectedMobileLogoFtl(): Promise<string> {
  const icon = await fs.readFile(path.join(brandSrc, "icon.svg"), "utf8");
  const iconWithAttrs = icon.replace(/<svg /, `<svg width="24" height="24" aria-hidden="true" `);
  return [
    `<#-- ═══════════════════════════════════════════════════════════════════ -->`,
    `<#-- Generated from packages/shared/foundation/brand/src/products/neon/ -->`,
    `<#-- DO NOT EDIT DIRECTLY — run: pnpm brand:refresh                     -->`,
    `<#-- ═══════════════════════════════════════════════════════════════════ -->`,
    `<div class="kc-mobile-logo">`,
    iconWithAttrs.trimEnd(),
    `  <span>Neon</span>`,
    `</div>`,
    "",
  ].join("\n");
}

function hashString(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function main() {
  const failures: string[] = [];
  const manifest = JSON.parse(
    await fs.readFile(path.join(brandSrc, "manifest.json"), "utf8"),
  ) as { logoFiles: Record<string, string> };

  // 1. Verify static SVG copies in KC img/
  for (const file of Object.values(manifest.logoFiles)) {
    const src = path.join(brandSrc, file);
    const dest = path.join(kcImg, `neon-${file}`);
    if (!(await exists(dest))) {
      failures.push(`Missing KC img file: resources/img/neon-${file} — run: pnpm brand:refresh`);
      continue;
    }
    const [s, d] = await Promise.all([sha256(src), sha256(dest)]);
    if (s !== d) failures.push(`Stale KC img file: resources/img/neon-${file} — run: pnpm brand:refresh`);
  }

  // 2. Verify FTL includes
  const checks: Array<{ label: string; actual: string; expected: string }> = [
    {
      label: "_neon-brand-logo.ftl",
      actual: path.join(kcLogin, "_neon-brand-logo.ftl"),
      expected: await expectedBrandLogoFtl(),
    },
    {
      label: "_neon-brand-mobile.ftl",
      actual: path.join(kcLogin, "_neon-brand-mobile.ftl"),
      expected: await expectedMobileLogoFtl(),
    },
  ];

  for (const { label, actual, expected } of checks) {
    if (!(await exists(actual))) {
      failures.push(`Missing KC FTL include: ${label} — run: pnpm brand:refresh`);
      continue;
    }
    const actualContent = await fs.readFile(actual, "utf8");
    if (hashString(actualContent) !== hashString(expected)) {
      failures.push(`Stale KC FTL include: ${label} — run: pnpm brand:refresh`);
    }
  }

  if (failures.length > 0) {
    console.error("\n  ✖  Brand sync verification FAILED:\n");
    failures.forEach((f) => console.error(`     • ${f}`));
    console.error("");
    process.exit(1);
  }

  console.log("  ✓  Brand sync verified — KC theme is up to date.");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
