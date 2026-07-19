#!/usr/bin/env tsx
/**
 * Verify generated brand targets are current.
 *
 * Run:
 *   pnpm brand:verify
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const brandSrc = path.join(repoRoot, "packages/apps/neon/brand/src");
const brandDist = path.join(repoRoot, "packages/shared/ui-platform/brand/dist");
const kcLogin = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const kcImg = path.join(kcLogin, "resources/img");

const APP_TARGETS = {
  neon: "apps/neon/public/brand",
  mesh: "apps/mesh/public/brand",
  admin: "apps/admin/public/brand",
} as const;

const PUBLIC_OUTPUT_FILES = {
  wordmarkBlack: "wordmark-black.png",
  wordmarkWhite: "wordmark-white.png",
  wordmarkOnBlack: "wordmark-on-black.png",
  wordmarkOnWhite: "wordmark-on-white.png",
  icon: "icon.png",
  appIcon: "appicon.png",
  favicon: "favicon.png",
} as const;

type ProductCode = keyof typeof APP_TARGETS;
type PublicAssetKey = keyof typeof PUBLIC_OUTPUT_FILES;

const PRODUCT_SOURCES: Record<ProductCode, string> = {
  neon:  "packages/apps/neon/brand/src",
  mesh:  "packages/apps/mesh/brand/src",
  admin: "packages/apps/admin/brand/src",
};

interface KeycloakBrandManifest {
  logoFiles: {
    primary: string;
    icon: string;
    [key: string]: string;
  };
}

interface AppBrandManifest {
  productCode: ProductCode;
  productName: string;
  descriptor: string;
  publicAssets: Record<PublicAssetKey, string>;
}

async function sha256(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hashString(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function generatedHeader(): string[] {
  return [
    `<#-- Generated from packages/apps/neon/brand/src/ -->`,
    `<#-- DO NOT EDIT DIRECTLY - run: pnpm brand:refresh -->`,
  ];
}

async function expectedBrandLogoFtl(manifest: KeycloakBrandManifest): Promise<string> {
  return [
    ...generatedHeader(),
    `<div class="kc-brand-logo">`,
    `  <img src="\${url.resourcesPath}/img/neon-${manifest.logoFiles.primary}" alt="Neon — Business Operating Platform" />`,
    `</div>`,
    "",
  ].join("\n");
}

async function expectedMobileLogoFtl(manifest: KeycloakBrandManifest): Promise<string> {
  return [
    ...generatedHeader(),
    `<div class="kc-mobile-logo">`,
    `  <img src="\${url.resourcesPath}/img/neon-${manifest.logoFiles.icon}" width="24" height="24" alt="" />`,
    `  <span>Neon</span>`,
    `</div>`,
    "",
  ].join("\n");
}

function publicUrl(file: string): string {
  return `/brand/${file}`;
}

async function verifyKeycloak(failures: string[]): Promise<void> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(brandSrc, "manifest.json"), "utf8"),
  ) as KeycloakBrandManifest;

  for (const file of Object.values(manifest.logoFiles)) {
    const src = path.join(brandSrc, file);
    const dest = path.join(kcImg, `neon-${file}`);
    if (!(await exists(dest))) {
      failures.push(`Missing Keycloak image: resources/img/neon-${file}`);
      continue;
    }

    const [sourceHash, destHash] = await Promise.all([sha256(src), sha256(dest)]);
    if (sourceHash !== destHash) {
      failures.push(`Stale Keycloak image: resources/img/neon-${file}`);
    }
  }

  const ftlChecks = [
    {
      label: "_neon-brand-logo.ftl",
      actual: path.join(kcLogin, "_neon-brand-logo.ftl"),
      expected: await expectedBrandLogoFtl(manifest),
    },
    {
      label: "_neon-brand-mobile.ftl",
      actual: path.join(kcLogin, "_neon-brand-mobile.ftl"),
      expected: await expectedMobileLogoFtl(manifest),
    },
  ];

  for (const { label, actual, expected } of ftlChecks) {
    if (!(await exists(actual))) {
      failures.push(`Missing Keycloak include: ${label}`);
      continue;
    }

    const actualContent = await fs.readFile(actual, "utf8");
    if (
      !actualContent.includes("iamBrandPlane") ||
      !actualContent.includes("${iamBrandPlane}") ||
      !actualContent.includes("iamProductName")
    ) {
      failures.push(`Stale Keycloak include: ${label}`);
    }
  }
}

async function verifyApps(failures: string[]): Promise<void> {
  for (const product of Object.keys(APP_TARGETS) as ProductCode[]) {
    const manifestPath = path.join(brandDist, product, "manifest.json");
    if (!(await exists(manifestPath))) {
      failures.push(`Missing brand dist manifest for ${product}; run pnpm brand:build`);
      continue;
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as AppBrandManifest;
    const targetDir = path.join(repoRoot, APP_TARGETS[product]);

    const expectedPublicManifest = {
      productCode: product,
      productName: manifest.productName,
      descriptor: manifest.descriptor,
      generatedFrom: PRODUCT_SOURCES[product],
      assets: Object.fromEntries(
        Object.entries(PUBLIC_OUTPUT_FILES).map(([key, outputFile]) => [key, publicUrl(outputFile)]),
      ),
    };

    for (const [key, outputFile] of Object.entries(PUBLIC_OUTPUT_FILES) as Array<[PublicAssetKey, string]>) {
      const sourceFile = manifest.publicAssets[key];
      const sourcePath = path.join(brandDist, product, sourceFile);
      const targetPath = path.join(targetDir, outputFile);

      if (!(await exists(targetPath))) {
        failures.push(`Missing app brand asset: ${APP_TARGETS[product]}/${outputFile}`);
        continue;
      }

      const [sourceHash, targetHash] = await Promise.all([sha256(sourcePath), sha256(targetPath)]);
      if (sourceHash !== targetHash) {
        failures.push(`Stale app brand asset: ${APP_TARGETS[product]}/${outputFile}`);
      }
    }

    const appManifestPath = path.join(targetDir, "brand-manifest.json");
    if (!(await exists(appManifestPath))) {
      failures.push(`Missing app brand manifest: ${APP_TARGETS[product]}/brand-manifest.json`);
      continue;
    }

    const expectedContent = `${JSON.stringify(expectedPublicManifest, null, 2)}\n`;
    const actualContent = await fs.readFile(appManifestPath, "utf8");
    if (hashString(actualContent) !== hashString(expectedContent)) {
      failures.push(`Stale app brand manifest: ${APP_TARGETS[product]}/brand-manifest.json`);
    }
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];

  await verifyKeycloak(failures);
  await verifyApps(failures);

  if (failures.length > 0) {
    console.error("\nBrand sync verification FAILED:\n");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error("\nRun: pnpm brand:refresh\n");
    process.exit(1);
  }

  console.log("Brand sync verified.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
