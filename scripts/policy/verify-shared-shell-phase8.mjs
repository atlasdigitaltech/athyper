import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), failures = [];
const planes = {
  neon: { registry: "packages/planes/neon/navigation/src/index.ts", ddl: "server/db/ddl/planes/neon/master/12_platform_catalog_reference_seed.sql" },
  mesh: { registry: "packages/planes/mesh/shell/src/navigation.ts", ddl: "server/db/ddl/planes/mesh/master/12_platform_catalog_reference_seed.sql" },
  studio: { registry: "packages/planes/studio/shell/src/navigation.ts", ddl: "server/db/ddl/planes/studio/master/12_platform_catalog_reference_seed.sql" },
};
const iconSource = readFileSync(resolve(root, "packages/platform/foundation/icons/src/index.tsx"), "utf8"), iconKeys = new Set([...iconSource.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]));
for (const [plane, definition] of Object.entries(planes)) {
  const registry = readFileSync(resolve(root, definition.registry), "utf8"), ddl = readFileSync(resolve(root, definition.ddl), "utf8");
  const routes = [...registry.matchAll(/moduleCode:\s*"([^"]+)"[\s\S]*?href:\s*"([^"]+)"[\s\S]*?iconKey:\s*"([^"]+)"[\s\S]*?requiredPermissions:\s*\[([^\]]*)\][\s\S]*?requiredFeatures:\s*\[([^\]]*)\]/g)];
  if (!routes.length) failures.push(`${plane} has no typed routes`);
  for (const [, moduleCode, href, iconKey, permissions, features] of routes) {
    if (!ddl.includes(`'${moduleCode}'`)) failures.push(`${plane} route references DDL-unknown module ${moduleCode}`);
    if (!iconKeys.has(iconKey)) failures.push(`${plane} route references unknown icon ${iconKey}`);
    const page = href === "/" ? resolve(root, "apps", plane, "app/(shell)/page.tsx") : resolve(root, "apps", plane, "app/(shell)", href.slice(1), "page.tsx");
    if (!existsSync(page)) failures.push(`${plane} route ${href} has no app page`);
    const ddlRoot = resolve(root, "server/db/ddl/planes", plane), ddlCorpus = collectSql(ddlRoot);
    for (const code of quoted(permissions)) if (!ddlCorpus.includes(code)) failures.push(`${plane} route permission is unknown to DDL: ${code}`);
    for (const code of quoted(features)) if (!ddlCorpus.includes(code)) failures.push(`${plane} route feature is unknown to DDL: ${code}`);
  }
  if (/apps-backup|packages-backup/.test(registry)) failures.push(`${plane} registry references backup code`);
}
const shell = ["core.ts", "client.tsx", "index.tsx", "styles.css"].map((file) => readFileSync(resolve(root, "packages/platform/shell/shell/src", file), "utf8")).join("\n");
for (const required of ["main-content", "Skip to main content", "unknown-active-module", "requiredPermissions", "requiredFeatures", "prefers-reduced-motion", "aria-modal", "api/auth/logout"]) if (!shell.includes(required)) failures.push(`shared shell is missing ${required}`);
if (/apps-backup|packages-backup/.test(shell)) failures.push("shared shell references backup code");
if (failures.length) { console.error(`Phase 8 shell policy failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("Phase 8 shell policy passed for route ownership, DDL modules, app pages, icons, purity, and shell accessibility contracts.");
function quoted(value) { return [...value.matchAll(/"([^"]+)"/g)].map((match) => match[1]); }
function collectSql(directory) { let result = ""; for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); result += entry.isDirectory() ? collectSql(path) : entry.name.endsWith(".sql") ? readFileSync(path, "utf8") : ""; } return result; }
