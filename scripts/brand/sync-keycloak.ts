#!/usr/bin/env tsx
/**
 * Sync canonical plane brand assets into the Keycloak login theme.
 *
 * Run:
 *   pnpm brand:sync:keycloak
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const kcLogin = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const kcImg = path.join(kcLogin, "resources/img");

const brandSources = {
  neon: path.join(repoRoot, "packages/apps/neon/brand/src"),
  mesh: path.join(repoRoot, "packages/apps/mesh/brand/src"),
  admin: path.join(repoRoot, "packages/apps/admin/brand/src"),
} as const;

interface BrandManifest {
  logoFiles: Record<string, string>;
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

function generatedHeader(): string[] {
  return [
    `<#-- Generated from the canonical plane brand packages. -->`,
    `<#-- DO NOT EDIT DIRECTLY - run: pnpm brand:refresh -->`,
  ];
}

function planeSelection(): string[] {
  return [
    `  <#assign iamBrandPlane = (iamPlane!"athyper")>`,
    `  <#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "admin">`,
    `    <#assign iamBrandPlane = "admin">`,
    `  </#if>`,
  ];
}

async function generateBrandLogoFtl(): Promise<string> {
  return [
    ...generatedHeader(),
    `<div class="kc-brand-logo">`,
    ...planeSelection(),
    `  <img src="\${url.resourcesPath}/img/\${iamBrandPlane}-wordmark-black.png" alt="\${iamProductName!"Athyper"}" />`,
    `</div>`,
    "",
  ].join("\n");
}

async function generateMobileLogoFtl(): Promise<string> {
  return [
    ...generatedHeader(),
    `<div class="kc-mobile-logo">`,
    ...planeSelection(),
    `  <img src="\${url.resourcesPath}/img/\${iamBrandPlane}-wordmark-black.png" alt="\${iamProductName!"Athyper"}" />`,
    `</div>`,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  await ensureDir(kcImg);

  for (const [plane, brandSrc] of Object.entries(brandSources)) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(brandSrc, "manifest.json"), "utf8"),
    ) as BrandManifest;

    for (const file of new Set(Object.values(manifest.logoFiles))) {
      const src = path.join(brandSrc, file);
      const dest = path.join(kcImg, `${plane}-${file}`);
      await fs.copyFile(src, dest);
      console.log(`  ok  img/${plane}-${file}`);
    }
  }

  await fs.writeFile(
    path.join(kcLogin, "_neon-brand-logo.ftl"),
    await generateBrandLogoFtl(),
    "utf8",
  );
  await fs.writeFile(
    path.join(kcLogin, "_neon-brand-mobile.ftl"),
    await generateMobileLogoFtl(),
    "utf8",
  );

  console.log("\nKeycloak plane brand sync complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
