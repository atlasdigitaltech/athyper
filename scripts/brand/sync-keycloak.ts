#!/usr/bin/env tsx
/** Synchronize only active canonical identity assets into the Keycloak theme. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(repoRoot, "packages/platform/foundation/brand/assets");
const target = path.join(repoRoot, "stack/config/iam/themes/neon/login/resources/img");
const planes = ["neon", "mesh", "studio"] as const;
const obsoleteAssets = ["admin-icon.png", "admin-wordmark-black.png", "mesh-icon.png", "mesh-wordmark-black.png", "neon-icon.png", "neon-wordmark-black.png"] as const;

async function main(): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  await Promise.all(obsoleteAssets.map((name) => fs.rm(path.join(target, name), { force: true })));
  await Promise.all([
    ...planes.map((plane) => fs.copyFile(path.join(assets, `plane-lockups/${plane}.svg`), path.join(target, `${plane}-advertising.svg`))),
    fs.copyFile(path.join(assets, "master-marks/athyper-favicon.svg"), path.join(target, "athyper-favicon.svg")),
  ]);
  console.log("Keycloak minimal brand assets synchronized.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
