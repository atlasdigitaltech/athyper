#!/usr/bin/env tsx
/**
 * scripts/brand/build-brand.ts
 *
 * Validates all brand manifests and copies source assets from
 * packages/shared/foundation/brand/src/products/{product}/
 * into
 * packages/shared/foundation/brand/dist/{product}/
 *
 * Run: pnpm brand:build
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const srcRoot = path.join(repoRoot, "packages/shared/foundation/brand/src/products");
const distRoot = path.join(repoRoot, "packages/shared/foundation/brand/dist");

const PRODUCTS = ["neon"] as const;

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src: string, dest: string) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function main() {
  await fs.rm(distRoot, { recursive: true, force: true });
  await ensureDir(distRoot);

  for (const product of PRODUCTS) {
    const productSrc = path.join(srcRoot, product);
    const productDist = path.join(distRoot, product);
    const manifestPath = path.join(productSrc, "manifest.json");

    if (!(await exists(manifestPath))) {
      throw new Error(`Missing manifest: ${manifestPath}`);
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      logoFiles: Record<string, string>;
    };

    const requiredFiles = [
      ...Object.values(manifest.logoFiles),
      "manifest.json",
    ];

    for (const file of requiredFiles) {
      const assetSrc = path.join(productSrc, file);
      if (!(await exists(assetSrc))) {
        throw new Error(`Missing asset for ${product}: ${assetSrc}`);
      }
      await copyFile(assetSrc, path.join(productDist, file));
    }

    console.log(`  ✓  ${product} (${requiredFiles.length} files)`);
  }

  console.log("\nBrand build complete.");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
