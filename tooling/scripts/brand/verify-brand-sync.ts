#!/usr/bin/env tsx
/** Verify the active platform brand registry and every deployed browser target. */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATLAS_MODERN_BRAND, BRAND_PLANES, getPlaneBrand } from "../../../packages/platform/foundation/brand/src/index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const failures: string[] = [];

async function read(relative: string): Promise<Buffer> {
  return fs.readFile(path.join(repoRoot, relative));
}

async function text(relative: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relative), "utf8");
}

async function exists(relative: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function verifyApplications(): Promise<void> {
  const canonicalFavicon = sha256(await read("packages/platform/foundation/brand/assets/master-marks/athyper-favicon.svg"));
  const obsoleteAssets = ["app-icon-inverse.png", "app-icon.svg", "icon.png", "wordmark-inverse.png", "wordmark-inverse.svg", "wordmark.png", "wordmark.svg"] as const;
  for (const plane of BRAND_PLANES) {
    const brand = getPlaneBrand(plane);
    const root = `apps/${plane}/public`;
    if (brand.themeColor !== ATLAS_MODERN_BRAND.colors.primary) failures.push(`${plane} browser theme color is not Atlas Modern`);
    for (const descriptor of [brand.identityLockup, brand.appIcon]) {
      const target = `${root}${descriptor.src}`;
      if (!(await exists(target))) failures.push(`${plane} is missing registered asset ${descriptor.src}`);
    }
    const canonicalLockup = `packages/platform/foundation/brand/assets/plane-lockups/${plane}.svg`;
    const identityLockup = `${root}${brand.identityLockup.src}`;
    if (!(await exists(identityLockup)) || sha256(await read(identityLockup)) !== sha256(await read(canonicalLockup))) failures.push(`${plane} pre-authentication identity lockup is stale`);
    const favicon = `${root}${brand.favicon}`;
    if (!(await exists(favicon)) || sha256(await read(favicon)) !== canonicalFavicon) failures.push(`${plane} universal favicon is stale`);
    const manifestPath = `${root}${brand.manifest}`;
    if (!(await exists(manifestPath))) {
      failures.push(`${plane} is missing ${brand.manifest}`);
      continue;
    }
    const manifest = JSON.parse(await text(manifestPath)) as Record<string, unknown>;
    if (manifest.name !== brand.applicationName || manifest.short_name !== brand.shortName || manifest.description !== brand.description) failures.push(`${plane} web manifest identity is stale`);
    if (manifest.theme_color !== ATLAS_MODERN_BRAND.colors.primary) failures.push(`${plane} web manifest does not use Atlas Modern`);
    for (const name of obsoleteAssets) if (await exists(`apps/${plane}/public/brand/${plane}/${name}`)) failures.push(`${plane} still deploys obsolete brand asset ${name}`);
  }
}

async function verifyKeycloak(): Promise<void> {
  const root = "deploy/config/iam/themes/neon/login";
  const resolver = await text(`${root}/_theme-resolver.ftl`);
  const tokens = await text(`${root}/resources/css/iam.tokens.css`);
  const head = await text(`${root}/_iam-head.ftl`);
  if (!resolver.includes('fallbackTheme = "atlas-modern"')) failures.push("Keycloak does not default to Atlas Modern");
  if (
    !tokens.includes("--a-brand: #234B84;")
    || !tokens.includes("--a-primary: var(--a-brand);")
    || !tokens.includes("--plane-accent:var(--a-primary)")
  ) failures.push("Keycloak interaction tokens are stale");
  if (!head.includes('theme-color" content="#234B84"')) failures.push("Keycloak browser theme color is stale");
  const header = await text(`${root}/_iam-header.ftl`);
  if (!header.includes('${iamBrandPlane}-advertising.svg')) failures.push("Keycloak header does not use the approved advertising wordmarks");
  for (const product of ["neon", "mesh", "studio"] as const) {
    const canonical = `packages/platform/foundation/brand/assets/plane-lockups/${product}.svg`;
    const asset = `${root}/resources/img/${product}-advertising.svg`;
    if (!(await exists(canonical))) {
      failures.push(`Canonical brand assets are missing ${product}.svg`);
      continue;
    }
    if (!(await exists(asset)) || sha256(await read(asset)) !== sha256(await read(canonical))) {
      failures.push(`Keycloak ${product} pre-authentication lockup is stale`);
      continue;
    }
    const svg = await text(canonical);
    if (!svg.includes("#234B84")) failures.push(`${product} advertising wordmark is not Atlas Modern blue`);
    if (/<(?:text|image|script|foreignObject)[\s>]/iu.test(svg)) failures.push(`${product} advertising wordmark is not self-contained path-only SVG`);
  }
  for (const name of ["admin-icon.png", "admin-wordmark-black.png", "mesh-icon.png", "mesh-wordmark-black.png", "neon-icon.png", "neon-wordmark-black.png"] as const) {
    if (await exists(`${root}/resources/img/${name}`)) failures.push(`Keycloak still deploys obsolete brand asset ${name}`);
  }
}

async function verifyGateways(): Promise<void> {
  for (const page of [
    "deploy/compose/instance/config/nginx/status.html",
    "deploy/compose/platform/outage/status.html",
  ]) {
    const html = await text(page);
    if (!html.includes('data-theme-family="atlas-modern"')) failures.push(`${page} does not declare Atlas Modern`);
    if (!html.includes('theme-color" content="#234B84"')) failures.push(`${page} browser theme color is stale`);
  }

  const instancePage = await text("deploy/compose/instance/config/nginx/status.html");
  for (const plane of ["neon", "mesh", "studio"] as const) {
    const canonical = await read(`packages/platform/foundation/brand/assets/plane-lockups/${plane}.svg`);
    if (!instancePage.includes(`data-plane-brand="${plane}" src="data:image/svg+xml;base64,${canonical.toString("base64")}"`)) failures.push(`Stack v2 gateway ${plane} embedded lockup is stale`);
  }
}

async function main(): Promise<void> {
  await verifyApplications();
  await verifyKeycloak();
  await verifyGateways();

  if (failures.length) {
    console.error(["Brand sync verification FAILED:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Brand sync verified for ${ATLAS_MODERN_BRAND.name}, ${BRAND_PLANES.length} planes, Keycloak, and the gateway.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
