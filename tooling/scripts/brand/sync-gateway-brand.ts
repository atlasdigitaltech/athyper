#!/usr/bin/env tsx
/** Keep pre-authentication plane lockups identical across IAM and both gateway generations. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const canonicalDir = path.join(repoRoot, "packages/platform/foundation/brand/assets/plane-lockups");
const iamDir = path.join(repoRoot, "stack/config/iam/themes/neon/login/resources/img");
const legacyGatewayDir = path.join(repoRoot, "stack/config/gateway/fallback/brand");
const embeddedStatusPaths = [
  path.join(repoRoot, "deploy/compose/instance/config/nginx/status.html"),
  path.join(repoRoot, "deploy/compose/platform/outage/status.html"),
];
const planes = ["neon", "mesh", "studio"] as const;

async function main(): Promise<void> {
  await fs.mkdir(iamDir, { recursive: true });
  await fs.mkdir(legacyGatewayDir, { recursive: true });
  await Promise.all(["admin-wordmark-black.png", "mesh-wordmark-black.png", "neon-wordmark-black.png"].map((name) => fs.rm(path.join(legacyGatewayDir, name), { force: true })));

  const embeddedStatuses = new Map(
    await Promise.all(embeddedStatusPaths.map(async (statusPath) => [statusPath, await fs.readFile(statusPath, "utf8")] as const)),
  );
  for (const plane of planes) {
    const canonical = path.join(canonicalDir, `${plane}.svg`);
    const svg = await fs.readFile(canonical);
    const iamTarget = path.join(iamDir, `${plane}-advertising.svg`);
    const legacyTarget = path.join(legacyGatewayDir, `${plane}-advertising.svg`);
    const applicationTarget = path.join(repoRoot, `apps/${plane}/public/brand/${plane}/identity-lockup.svg`);
    const iconSource = path.join(repoRoot, `apps/${plane}/public/brand/${plane}/app-icon.png`);
    const iconTarget = path.join(legacyGatewayDir, `${plane}-icon.png`);

    await Promise.all([
      fs.copyFile(canonical, iamTarget),
      fs.copyFile(canonical, legacyTarget),
      fs.copyFile(canonical, applicationTarget),
      fs.copyFile(iconSource, iconTarget),
    ]);

    const dataUri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
    for (const [statusPath, status] of embeddedStatuses) {
      const embeddedLockup = new RegExp(
        `(<img data-plane-brand="${plane}" src=")data:image\\/(?:png|svg\\+xml);base64,[^"]+(" alt="">)`,
        "u",
      );
      if (!embeddedLockup.test(status)) {
        throw new Error(`Could not find the ${plane} embedded lockup in ${path.relative(repoRoot, statusPath)}`);
      }
      embeddedStatuses.set(statusPath, status.replace(embeddedLockup, `$1${dataUri}$2`));
    }
    console.log(`  ok  ${plane} pre-authentication lockup`);
  }

  await Promise.all([...embeddedStatuses].map(([statusPath, status]) => fs.writeFile(statusPath, status)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
