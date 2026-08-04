#!/usr/bin/env tsx
/**
 * Build canonical brand assets into packages/shared/ui-platform/brand/dist.
 *
 * Sources (per-product after brand split):
 *   packages/products/neon/brand/src/
 *   packages/products/mesh/brand/src/
 *   packages/products/admin/brand/src/
 *
 * Output:
 *   packages/shared/ui-platform/brand/dist/{product}/
 *
 * Run:
 *   pnpm brand:build
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distRoot = path.join(repoRoot, "packages/shared/ui-platform/brand/dist");

const PRODUCTS = ["neon", "mesh", "admin"] as const;

type ProductCode = (typeof PRODUCTS)[number];

const PRODUCT_SOURCES: Record<ProductCode, string> = {
  neon:    path.join(repoRoot, "packages/products/neon/brand/src"),
  mesh:    path.join(repoRoot, "packages/products/mesh/brand/src"),
  admin:   path.join(repoRoot, "packages/products/admin/brand/src"),
};
const REQUIRED_PUBLIC_ASSET_KEYS = [
  "wordmarkBlack",
  "wordmarkWhite",
  "wordmarkOnBlack",
  "wordmarkOnWhite",
  "icon",
  "appIcon",
  "favicon",
] as const;

type PublicAssetKey = (typeof REQUIRED_PUBLIC_ASSET_KEYS)[number];

interface BrandManifest {
  productCode: ProductCode;
  productName: string;
  descriptor: string;
  logoFiles: Record<string, string>;
  publicAssets: Record<PublicAssetKey, string>;
  rules?: Record<string, unknown>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

function assertLocalAssetPath(product: string, file: string): void {
  if (!file || file.includes("\\") || path.isAbsolute(file) || file.split("/").includes("..")) {
    throw new Error(`Invalid brand asset path for ${product}: ${file}`);
  }
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

async function readManifest(product: ProductCode): Promise<BrandManifest> {
  const manifestPath = path.join(PRODUCT_SOURCES[product], "manifest.json");
  if (!(await exists(manifestPath))) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as BrandManifest;
  if (manifest.productCode !== product) {
    throw new Error(`Manifest productCode mismatch for ${product}: ${manifest.productCode}`);
  }

  for (const key of REQUIRED_PUBLIC_ASSET_KEYS) {
    if (!manifest.publicAssets?.[key]) {
      throw new Error(`Missing publicAssets.${key} in ${manifestPath}`);
    }
  }

  return manifest;
}

async function validatePublicSvg(product: ProductCode, file: string): Promise<void> {
  if (!file.endsWith(".svg")) return;

  const assetPath = path.join(PRODUCT_SOURCES[product], file);
  const svg = await fs.readFile(assetPath, "utf8");
  const forbidden = [
    /<script[\s>]/i,
    /<image[\s>]/i,
    /<foreignObject[\s>]/i,
    /<text[\s>]/i,
    /\son[a-z]+\s*=/i,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(svg)) {
      throw new Error(`Unsafe or non-portable public SVG markup in ${product}/${file}: ${pattern}`);
    }
  }

  if (!/<svg[\s>]/i.test(svg) || !/viewBox=/i.test(svg)) {
    throw new Error(`Public SVG must include <svg> and viewBox: ${product}/${file}`);
  }
}

async function main(): Promise<void> {
  await fs.rm(distRoot, { recursive: true, force: true });
  await ensureDir(distRoot);

  for (const product of PRODUCTS) {
    const productSrc = PRODUCT_SOURCES[product];
    const productDist = path.join(distRoot, product);
    const manifest = await readManifest(product);

    const assetFiles = unique([
      ...Object.values(manifest.logoFiles),
      ...Object.values(manifest.publicAssets),
      "manifest.json",
    ]);

    for (const file of assetFiles) {
      assertLocalAssetPath(product, file);

      const assetSrc = path.join(productSrc, file);
      if (!(await exists(assetSrc))) {
        throw new Error(`Missing asset for ${product}: ${assetSrc}`);
      }

      if (Object.values(manifest.publicAssets).includes(file)) {
        await validatePublicSvg(product, file);
      }

      await copyFile(assetSrc, path.join(productDist, file));
    }

    console.log(`  ok  ${product} (${assetFiles.length} files)`);
  }

  console.log("\nBrand build complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
