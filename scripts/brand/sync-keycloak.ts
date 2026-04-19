#!/usr/bin/env tsx
/**
 * scripts/brand/sync-keycloak.ts
 *
 * Copies canonical brand assets from dist/neon/ into the Keycloak theme's
 * static resource folder, and generates FTL include fragments so templates
 * never embed logo markup by hand.
 *
 * Targets:
 *   stack/config/iam/themes/neon/login/resources/img/
 *   stack/config/iam/themes/neon/login/_neon-brand-logo.ftl
 *   stack/config/iam/themes/neon/login/_neon-brand-mobile.ftl
 *
 * Run: pnpm brand:sync:keycloak
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const brandDist = path.join(repoRoot, "packages/shared/foundation/brand/dist/neon");
const brandSrc = path.join(repoRoot, "packages/shared/foundation/brand/src/products/neon");
const kcLogin = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const kcImg = path.join(kcLogin, "resources/img");

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

/** Read logo-primary.svg and wrap it in the kc-brand-logo div. */
async function generateBrandLogoFtl(svgPath: string): Promise<string> {
  const svg = await fs.readFile(svgPath, "utf8");
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

/** Read icon.svg and wrap it in the kc-mobile-logo div. */
async function generateMobileLogoFtl(iconPath: string): Promise<string> {
  const icon = await fs.readFile(iconPath, "utf8");
  // Inject width/height/aria-hidden into the root svg element for mobile use
  const iconWithAttrs = icon.replace(
    /<svg /,
    `<svg width="24" height="24" aria-hidden="true" `,
  );
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

async function main() {
  // Use src directly (sync can run without a prior build step)
  const [logoSrc, iconSrc] = [
    path.join(brandSrc, "logo-primary.svg"),
    path.join(brandSrc, "icon.svg"),
  ];

  // 1. Copy SVG files to KC static img folder
  await ensureDir(kcImg);
  const manifest = JSON.parse(
    await fs.readFile(path.join(brandSrc, "manifest.json"), "utf8"),
  ) as { logoFiles: Record<string, string> };

  for (const file of Object.values(manifest.logoFiles)) {
    const src = path.join(brandSrc, file);
    const dest = path.join(kcImg, `neon-${file}`);
    await fs.copyFile(src, dest);
    console.log(`  ✓  img/${`neon-${file}`}`);
  }

  // 2. Generate FTL include: brand logo panel
  const brandLogoFtl = await generateBrandLogoFtl(logoSrc);
  const brandLogoPath = path.join(kcLogin, "_neon-brand-logo.ftl");
  await fs.writeFile(brandLogoPath, brandLogoFtl, "utf8");
  console.log(`  ✓  _neon-brand-logo.ftl`);

  // 3. Generate FTL include: mobile logo
  const mobileLogoFtl = await generateMobileLogoFtl(iconSrc);
  const mobileLogoPath = path.join(kcLogin, "_neon-brand-mobile.ftl");
  await fs.writeFile(mobileLogoPath, mobileLogoFtl, "utf8");
  console.log(`  ✓  _neon-brand-mobile.ftl`);

  console.log("\nKeycloak brand sync complete.");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
