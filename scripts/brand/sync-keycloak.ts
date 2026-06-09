#!/usr/bin/env tsx
/**
 * Sync canonical Neon brand assets into the Keycloak login theme.
 *
 * Run:
 *   pnpm brand:sync:keycloak
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const brandSrc = path.join(repoRoot, "packages/apps/neon/brand/src/products/neon");
const kcLogin = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const kcImg = path.join(kcLogin, "resources/img");

interface BrandManifest {
  logoFiles: {
    primary: string;
    icon: string;
    [key: string]: string;
  };
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

function generatedHeader(): string[] {
  return [
    `<#-- Generated from packages/apps/neon/brand/src/products/neon/ -->`,
    `<#-- DO NOT EDIT DIRECTLY - run: pnpm brand:refresh -->`,
  ];
}

async function generateBrandLogoFtl(svgPath: string): Promise<string> {
  const svg = await fs.readFile(svgPath, "utf8");
  return [
    ...generatedHeader(),
    `<div class="kc-brand-logo">`,
    svg.trimEnd(),
    `</div>`,
    "",
  ].join("\n");
}

async function generateMobileLogoFtl(iconPath: string): Promise<string> {
  const icon = await fs.readFile(iconPath, "utf8");
  const iconWithAttrs = icon.replace(
    /<svg /,
    `<svg width="24" height="24" aria-hidden="true" `,
  );

  return [
    ...generatedHeader(),
    `<div class="kc-mobile-logo">`,
    iconWithAttrs.trimEnd(),
    `  <span>Neon</span>`,
    `</div>`,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(brandSrc, "manifest.json"), "utf8"),
  ) as BrandManifest;

  await ensureDir(kcImg);

  for (const file of Object.values(manifest.logoFiles)) {
    const src = path.join(brandSrc, file);
    const dest = path.join(kcImg, `neon-${file}`);
    await fs.copyFile(src, dest);
    console.log(`  ok  img/${`neon-${file}`}`);
  }

  await fs.writeFile(
    path.join(kcLogin, "_neon-brand-logo.ftl"),
    await generateBrandLogoFtl(path.join(brandSrc, manifest.logoFiles.primary)),
    "utf8",
  );
  console.log("  ok  _neon-brand-logo.ftl");

  await fs.writeFile(
    path.join(kcLogin, "_neon-brand-mobile.ftl"),
    await generateMobileLogoFtl(path.join(brandSrc, manifest.logoFiles.icon)),
    "utf8",
  );
  console.log("  ok  _neon-brand-mobile.ftl");

  console.log("\nKeycloak brand sync complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
