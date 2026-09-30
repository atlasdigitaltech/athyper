#!/usr/bin/env tsx
/** Synchronize only active canonical identity assets into the Keycloak theme. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { keycloakShowcaseFiles } from "./keycloak-showcase";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const assets = path.join(repoRoot, "packages/platform/foundation/brand/assets");
const target = path.join(
  repoRoot,
  "deploy/config/iam/themes/neon/login/resources/img",
);
const planes = ["neon", "mesh", "studio"] as const;
const obsoleteAssets = [
  "admin-icon.png",
  "admin-wordmark-black.png",
  "mesh-icon.png",
  "mesh-wordmark-black.png",
  "neon-icon.png",
  "neon-wordmark-black.png",
] as const;

async function main(): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  await fs.copyFile(path.join(repoRoot, "packages/platform/foundation/surface-kit/src/public-identity-layout.css"), path.join(target, "../css/public-identity-layout.css"));
  await fs.copyFile(path.join(repoRoot, "packages/platform/foundation/surface-kit/src/public-identity-showcase.css"), path.join(target, "../css/public-identity-showcase.css"));
  await fs.rm(path.join(target, "../js/world-network-motif.js"), {
    force: true,
  });
  await Promise.all(
    obsoleteAssets.map((name) =>
      fs.rm(path.join(target, name), { force: true }),
    ),
  );
  await Promise.all([
    ...planes.map((plane) =>
      fs.copyFile(
        path.join(assets, `plane-lockups/${plane}.svg`),
        path.join(target, `${plane}-advertising.svg`),
      ),
    ),
    fs.copyFile(
      path.join(assets, "master-marks/athyper-favicon.svg"),
      path.join(target, "athyper-favicon.svg"),
    ),
  ]);
  for (const [name, content] of Object.entries(keycloakShowcaseFiles())) {
    await fs.writeFile(path.join(target, "../..", name), content);
  }
  console.log(
    "Keycloak brand assets and shared workspace previews synchronized.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
