#!/usr/bin/env tsx
/** Synchronize the minimal canonical browser-brand contract into every plane app. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import presentation from "../../packages/platform/foundation/brand/src/plane-presentation.json" with { type: "json" };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const planes = ["neon", "mesh", "studio"] as const;
const canonicalRoot = path.join(repoRoot, "packages/platform/foundation/brand/assets");
const obsoleteAssets = ["app-icon-inverse.png", "app-icon.svg", "icon.png", "wordmark-inverse.png", "wordmark-inverse.svg", "wordmark.png", "wordmark.svg"] as const;

async function main(): Promise<void> {
  for (const plane of planes) {
    const target = path.join(repoRoot, `apps/${plane}/public/brand/${plane}`);
    const identity = presentation.planes[plane];
    await fs.mkdir(target, { recursive: true });
    await Promise.all(obsoleteAssets.map((name) => fs.rm(path.join(target, name), { force: true })));
    await Promise.all([
      fs.copyFile(path.join(canonicalRoot, `plane-lockups/${plane}.svg`), path.join(target, "identity-lockup.svg")),
      fs.copyFile(path.join(canonicalRoot, "master-marks/mark-blue-transparent-2048.png"), path.join(target, "app-icon.png")),
      fs.copyFile(path.join(canonicalRoot, "master-marks/athyper-favicon.svg"), path.join(target, "athyper-favicon.svg")),
    ]);
    await fs.writeFile(path.join(target, "manifest.webmanifest"), `${JSON.stringify({
      name: identity.applicationName,
      short_name: identity.shortName,
      description: identity.description,
      start_url: "/",
      display: "standalone",
      background_color: "#f8fafc",
      theme_color: "#234B84",
      icons: [{ src: `/brand/${plane}/app-icon.png`, sizes: "2048x2048", type: "image/png", purpose: "any" }],
    })}\n`, "utf8");
    console.log(`  ok  ${plane} -> apps/${plane}/public/brand/${plane}`);
  }
  console.log("\nMinimal app brand sync complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
