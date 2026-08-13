import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const failures = [];
const apps = ["neon", "mesh", "studio"];
const files = ["global-error.tsx", "error.tsx", "not-found.tsx", "loading.tsx", "(public)/loading.tsx", "(shell)/error.tsx", "(shell)/loading.tsx"];
for (const app of apps) for (const file of files) {
  const path = resolve(root, "apps", app, "app", ...file.split("/"));
  if (!existsSync(path)) failures.push(`${app} is missing app/${file}`);
  else {
    const source = readFileSync(path, "utf8");
    if (!source.includes("@athyper/platform-shell-app-foundation")) failures.push(`${app}/app/${file} does not delegate to app foundation`);
    if (/backup/i.test(source)) failures.push(`${app}/app/${file} imports a backup source`);
  }
}
for (const file of ["packages/platform/shell/app-foundation/src/boundaries.tsx", "packages/platform/shell/app-foundation/src/error-taxonomy.ts"]) {
  const source = readFileSync(resolve(root, file), "utf8");
  if (/apps-backup|packages-backup/.test(source)) failures.push(`${file} references a backup root`);
}
const boundaries = readFileSync(resolve(root, "packages/platform/shell/app-foundation/src/boundaries.tsx"), "utf8");
for (const unsafe of ["error.message", "error.stack", "problem.detail", "JSON.stringify(error)"]) if (boundaries.includes(unsafe)) failures.push(`boundary renders or reports unsafe data: ${unsafe}`);
for (const feature of ["role=\"alert\"", "aria-live=\"assertive\"", "aria-live=\"polite\"", "clearLocalPrincipalState", "GlobalAppErrorBoundary"]) if (!boundaries.includes(feature)) failures.push(`boundary foundation is missing ${feature}`);
if (failures.length) { console.error(`Phase 7 boundary policy failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("Phase 7 boundary policy passed for Neon, Mesh, Studio, redaction, accessibility, and provider independence.");
