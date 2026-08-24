#!/usr/bin/env node
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const blueMarkSource = join(repoRoot, "packages/platform/foundation/brand/assets/master-marks/mark-blue-transparent-2048.png");
const whiteMarkSource = join(repoRoot, "packages/platform/foundation/brand/assets/master-marks/mark-white-transparent-2048.png");
const neonWordmarkSource = join(repoRoot, "packages/platform/foundation/brand/assets/master-wordmarks/neon.svg");
const neonReverseWordmarkSource = join(repoRoot, "packages/platform/foundation/brand/assets/master-wordmarks/neon-reverse.svg");
const blueMarkTargets = [
  "packages/platform/foundation/brand/assets/athyper-favicon.png",
  "apps/neon/public/brand/neon/favicon.png",
  "apps/neon/public/brand/neon/app-icon.png",
  "apps/neon/public/brand/neon/icon.png",
  "apps/mesh/public/brand/mesh/favicon.png",
  "apps/mesh/public/brand/mesh/app-icon.png",
  "apps/mesh/public/brand/mesh/icon.png",
  "apps/studio/public/brand/studio/favicon.png",
  "apps/studio/public/brand/studio/app-icon.png",
  "apps/studio/public/brand/studio/icon.png",
  "stack/config/iam/themes/neon/login/resources/img/athyper-favicon.png",
  "stack/config/gateway/fallback/brand/athyper-favicon.png",
];
const whiteMarkTargets = [
  "apps/neon/public/brand/neon/app-icon-inverse.png",
  "apps/mesh/public/brand/mesh/app-icon-inverse.png",
  "apps/studio/public/brand/studio/app-icon-inverse.png",
];
const directAssets = [
  [neonWordmarkSource, "apps/neon/public/brand/neon/wordmark.svg"],
  [neonReverseWordmarkSource, "apps/neon/public/brand/neon/wordmark-inverse.svg"],
];
const embeddedPages = [
  "deploy/compose/instance/config/nginx/status.html",
  "deploy/compose/platform/outage/status.html",
];
const check = process.argv.includes("--check");
const canonical = await readFile(blueMarkSource);

for (const relative of blueMarkTargets) {
  const target = join(repoRoot, relative);
  if (!check) await copyFile(blueMarkSource, target);
  const actual = await readFile(target);
  if (!actual.equals(canonical)) throw new Error(`Universal blue mark is stale: ${relative}`);
}
const inverse = await readFile(whiteMarkSource);
for (const relative of whiteMarkTargets) {
  const target = join(repoRoot, relative);
  if (!check) await copyFile(whiteMarkSource, target);
  const actual = await readFile(target);
  if (!actual.equals(inverse)) throw new Error(`Universal inverse mark is stale: ${relative}`);
}
for (const [source, relative] of directAssets) {
  const target = join(repoRoot, relative);
  if (!check) await copyFile(source, target);
  if (!(await readFile(target)).equals(await readFile(source))) throw new Error(`Master wordmark is stale: ${relative}`);
}

const dataUri = `data:image/png;base64,${canonical.toString("base64")}`;
for (const relative of embeddedPages) {
  const target = join(repoRoot, relative);
  let html = await readFile(target, "utf8");
  if (!check) {
    html = html.replace(/(<link rel="icon"[^>]*href=")data:image\/png;base64,[^"]+("[^>]*>)/u, `$1${dataUri}$2`);
    await writeFile(target, html);
  }
  if (!html.includes(dataUri)) throw new Error(`Embedded universal favicon is stale: ${relative}`);
}

const iamLogin = join(repoRoot, "stack/config/iam/themes/neon/login");
for (const name of (await readdir(iamLogin)).filter((value) => value.endsWith(".ftl"))) {
  const template = await readFile(join(iamLogin, name), "utf8");
  if (template.includes('rel="icon"') && !template.includes("img/athyper-favicon.png")) {
    throw new Error(`Keycloak template does not use the universal favicon: ${name}`);
  }
}

const legacyGateway = await readFile(join(repoRoot, "stack/config/gateway/fallback/status.html"), "utf8");
if (!legacyGateway.includes('href="/brand/athyper-favicon.png"')) {
  throw new Error("Legacy gateway does not use the universal favicon");
}

console.log(`${check ? "Verified" : "Synchronized"} master marks and Neon wordmarks across IAM, gateway, and applications.`);
