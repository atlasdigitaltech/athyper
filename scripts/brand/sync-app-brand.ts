#!/usr/bin/env tsx
/**
 * Sync generated brand assets into each Next app's public/brand folder.
 *
 * The app folders are deployment targets only. Edit assets in:
 *   packages/apps/{product}/brand/src/products/{product}/
 *
 * Run:
 *   pnpm brand:sync:apps
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distRoot = path.join(repoRoot, "packages/shared/brand/dist");

const APP_TARGETS = {
  neon: "apps/neon/public/brand",
  mesh: "apps/mesh/public/brand",
  admin: "apps/admin/public/brand",
} as const;

const PUBLIC_OUTPUT_FILES = {
  wordmarkBlack: "wordmark-black.svg",
  wordmarkWhite: "wordmark-white.svg",
  wordmarkOnBlack: "wordmark-on-black.svg",
  wordmarkOnWhite: "wordmark-on-white.svg",
  icon: "icon.svg",
  appIcon: "appicon.svg",
  favicon: "favicon.svg",
} as const;

const LEGACY_PUBLIC_FILES = {
  neon: ["athyper-icon-white-on-black.jpg", "neon-black.svg", "neon-white.svg"],
  mesh: ["athyper-icon-white-on-black.jpg", "mesh-black.svg", "mesh-white.svg"],
  admin: ["athyper-icon-white-on-black.jpg", "athyper-black.svg", "athyper-white.svg"],
} as const satisfies Record<keyof typeof APP_TARGETS, readonly string[]>;

type ProductCode = keyof typeof APP_TARGETS;
type PublicAssetKey = keyof typeof PUBLIC_OUTPUT_FILES;

const PRODUCT_SOURCES: Record<ProductCode, string> = {
  neon:  "packages/apps/neon/brand/src/products/neon",
  mesh:  "packages/apps/mesh/brand/src/products/mesh",
  admin: "packages/apps/admin/brand/src/products/admin",
};

interface BrandManifest {
  productCode: ProductCode;
  productName: string;
  descriptor: string;
  publicAssets: Record<PublicAssetKey, string>;
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function readManifest(product: ProductCode): Promise<BrandManifest> {
  const manifestPath = path.join(distRoot, product, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as BrandManifest;
  if (manifest.productCode !== product) {
    throw new Error(`Manifest productCode mismatch for ${product}: ${manifest.productCode}`);
  }
  return manifest;
}

function publicUrl(file: string): string {
  return `/brand/${file}`;
}

async function syncProduct(product: ProductCode): Promise<void> {
  const manifest = await readManifest(product);
  const targetDir = path.join(repoRoot, APP_TARGETS[product]);
  await ensureDir(targetDir);

  for (const legacyFile of LEGACY_PUBLIC_FILES[product]) {
    await fs.rm(path.join(targetDir, legacyFile), { force: true });
  }

  const publicManifest: {
    productCode: ProductCode;
    productName: string;
    descriptor: string;
    generatedFrom: string;
    assets: Record<PublicAssetKey, string>;
  } = {
    productCode: product,
    productName: manifest.productName,
    descriptor: manifest.descriptor,
    generatedFrom: PRODUCT_SOURCES[product],
    assets: {} as Record<PublicAssetKey, string>,
  };

  for (const [key, outputFile] of Object.entries(PUBLIC_OUTPUT_FILES) as Array<[PublicAssetKey, string]>) {
    const sourceFile = manifest.publicAssets[key];
    if (!sourceFile) {
      throw new Error(`Missing publicAssets.${key} for ${product}`);
    }

    await fs.copyFile(
      path.join(distRoot, product, sourceFile),
      path.join(targetDir, outputFile),
    );
    publicManifest.assets[key] = publicUrl(outputFile);
  }

  await fs.writeFile(
    path.join(targetDir, "brand-manifest.json"),
    `${JSON.stringify(publicManifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`  ok  ${product} -> ${APP_TARGETS[product]}`);
}

async function main(): Promise<void> {
  for (const product of Object.keys(APP_TARGETS) as ProductCode[]) {
    await syncProduct(product);
  }

  console.log("\nApp brand sync complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
