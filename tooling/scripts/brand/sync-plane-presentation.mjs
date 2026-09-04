#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = join(root, "packages/platform/foundation/brand/src/plane-presentation.json");
const config = JSON.parse(await readFile(sourcePath, "utf8"));
const check = process.argv.includes("--check");
const planes = ["neon", "mesh", "studio"];
const expand = (pattern, values) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), pattern);
const planeTitle = (plane) => expand(config.browserTitle.plane, { plane: config.planes[plane].shortName, description: config.planes[plane].description });
const pageExpression = config.browserTitle.page.replace("{page}", '${pageTitle}').replace("{plane}", '${iamProductName}');
const statusExpression = (status) => config.browserTitle.status.replace("{plane}", "${label}").replace("{status}", status);

async function synchronize(relative, transform) {
  const path = join(root, relative);
  const current = await readFile(path, "utf8");
  const expected = transform(current);
  if (check && current !== expected) throw new Error(`Plane presentation is stale: ${relative}`);
  if (!check && current !== expected) await writeFile(path, expected);
}

await synchronize("stack/config/iam/themes/neon/login/_iam-context.ftl", (text) => {
  let result = text;
  for (const plane of planes) {
    const name = config.planes[plane].shortName;
    result = result.replace(new RegExp(`<#assign iamBrowserTitle = "${name} [^"]+">`, "g"), `<#assign iamBrowserTitle = "${planeTitle(plane)}">`);
  }
  return result.replace(/<#return pageTitle \+ "[^"]*" \+ iamProductName>/, `<#return "${pageExpression}">`);
});

const objectRows = planes.map((plane) => `        ${plane}: { label: "${config.planes[plane].shortName}", description: "${config.planes[plane].description}" },`).join("\n");
await synchronize("deploy/compose/instance/config/nginx/status.html", (text) => text
  .replace(/      const products = \{\n[\s\S]*?\n      \};/, `      const products = {\n${objectRows}\n      };`)
  .replace(/document\.title = maintenance \? `[^`]+` : `[^`]+`;/, `document.title = maintenance ? \`${statusExpression("Maintenance")}\` : \`${statusExpression("Service unavailable")}\`;`));

const arrayRows = planes.map((plane) => `${plane}: ["${config.planes[plane].shortName}", "${config.planes[plane].description}"]`).join(", ");
await synchronize("deploy/compose/platform/outage/status.html", (text) => text
  .replace(/const products = \{ [^\n]+ \};/, `const products = { ${arrayRows} };`)
  .replace(/document\.title = `[^`]+Platform unavailable`;/, `document.title = \`${statusExpression("Platform unavailable")}\`;`));

const legacyRows = planes.map((plane) => `      ${plane}: { name: "${config.planes[plane].shortName}", wordmark: "/brand/${plane}-advertising.svg", icon: "/brand/${plane}-icon.png", audience: "${plane === "mesh" ? "partner" : plane === "studio" ? "platform" : "tenant"}" }`).join(",\n");
await synchronize("stack/config/gateway/fallback/status.html", (text) => text
  .replace(/    const products = \{\n[\s\S]*?\n    \};/, `    const products = {\n${legacyRows}\n    };`)
  .replace(/document\.title = product\.name \+ "[^"]*Maintenance";/, `document.title = product.name + " Maintenance";`)
  .replace(/document\.title = product\.name \+ "[^"]*Service unavailable";/, `document.title = product.name + " Service unavailable";`));

console.log(`${check ? "Verified" : "Synchronized"} plane presentation from ${sourcePath.slice(root.length + 1)}.`);
