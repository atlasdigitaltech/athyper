#!/usr/bin/env tsx
/** Copy deployed app wordmarks into the standalone gateway outage bundle. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const targetDir = path.join(repoRoot, "stack/config/gateway/fallback/brand");
const products = ["neon", "mesh", "studio"] as const;

async function main(): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  for (const product of products) {
    for (const asset of ["wordmark-black.png", "favicon.png"] as const) {
      const source = path.join(repoRoot, `apps/${product}/public/brand/${asset}`);
      const target = path.join(targetDir, `${product}-${asset}`);
      await fs.copyFile(source, target);
      console.log(`  ok  ${product} -> ${path.relative(repoRoot, target)}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
