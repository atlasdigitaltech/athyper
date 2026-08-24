#!/usr/bin/env tsx
/** Keep pre-authentication plane lockups identical across IAM and both gateway generations. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const canonicalDir = path.join(repoRoot, "packages/platform/foundation/brand/assets/plane-lockups");
const iamDir = path.join(repoRoot, "stack/config/iam/themes/neon/login/resources/img");
const legacyGatewayDir = path.join(repoRoot, "stack/config/gateway/fallback/brand");
const instanceStatusPath = path.join(repoRoot, "deploy/compose/instance/config/nginx/status.html");
const planes = ["neon", "mesh", "studio"] as const;

async function main(): Promise<void> {
  await fs.mkdir(iamDir, { recursive: true });
  await fs.mkdir(legacyGatewayDir, { recursive: true });

  let instanceStatus = await fs.readFile(instanceStatusPath, "utf8");
  for (const plane of planes) {
    const canonical = path.join(canonicalDir, `${plane}.svg`);
    const svg = await fs.readFile(canonical);
    const iamTarget = path.join(iamDir, `${plane}-advertising.svg`);
    const legacyTarget = path.join(legacyGatewayDir, `${plane}-advertising.svg`);
    const applicationTarget = path.join(repoRoot, `apps/${plane}/public/brand/${plane}/identity-lockup.svg`);
    const faviconSource = path.join(repoRoot, `apps/${plane}/public/brand/${plane}/favicon.png`);
    const faviconTarget = path.join(legacyGatewayDir, `${plane}-favicon.png`);

    await Promise.all([
      fs.copyFile(canonical, iamTarget),
      fs.copyFile(canonical, legacyTarget),
      fs.copyFile(canonical, applicationTarget),
      fs.copyFile(faviconSource, faviconTarget),
    ]);

    const dataUri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
    const embeddedLockup = new RegExp(
      `(<img data-plane-brand="${plane}" src=")data:image\\/(?:png|svg\\+xml);base64,[^"]+(" alt="">)`,
      "u",
    );
    if (!embeddedLockup.test(instanceStatus)) {
      throw new Error(`Could not find the ${plane} embedded lockup in ${path.relative(repoRoot, instanceStatusPath)}`);
    }
    instanceStatus = instanceStatus.replace(embeddedLockup, `$1${dataUri}$2`);
    console.log(`  ok  ${plane} pre-authentication lockup`);
  }

  await fs.writeFile(instanceStatusPath, instanceStatus);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
