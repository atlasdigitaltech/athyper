import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packagesRoot = process.argv[2];
const runtimeRoot = process.argv[3];
if (!packagesRoot) throw new Error("Usage: prepare-server-runtime-packages.mjs <packages-root>");

function packageFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (entry === "node_modules" || entry === "dist") continue;
    if (statSync(path).isDirectory()) files.push(...packageFiles(path));
    else if (entry === "package.json") files.push(path);
  }
  return files;
}

function productionTarget(value) {
  if (typeof value === "string") {
    return value.startsWith("./src/") ? value.replace(/^\.\/src\//u, "./dist/").replace(/\.ts$/u, ".js") : value;
  }
  if (Array.isArray(value)) return value.map(productionTarget);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, productionTarget(child)]));
  }
  return value;
}

let updated = 0;
let copied = 0;
for (const packageFile of packageFiles(packagesRoot)) {
  const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
  const before = JSON.stringify(manifest.exports);
  manifest.exports = productionTarget(manifest.exports);
  if (JSON.stringify(manifest.exports) !== before) {
    manifest.files = [...new Set([...(manifest.files ?? []), "dist"] )];
    writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    updated += 1;
  }
  if (runtimeRoot && manifest.name) {
    const sourceDist = join(packageFile, "..", "dist");
    const deployedPackage = join(runtimeRoot, "node_modules", manifest.name);
    if (existsSync(sourceDist) && existsSync(deployedPackage)) {
      const deployedDist = join(deployedPackage, "dist");
      rmSync(deployedDist, { recursive: true, force: true });
      cpSync(sourceDist, deployedDist, { recursive: true });
      copied += 1;
    }
  }
}
if (!runtimeRoot && updated === 0) throw new Error("No server workspace exports were prepared for production.");
if (runtimeRoot && copied === 0) throw new Error("No compiled server workspace packages were copied into the runtime.");
console.log(runtimeRoot
  ? `Copied ${copied} compiled server workspace packages into the runtime.`
  : `Prepared ${updated} server workspace package manifests for production deployment.`);
