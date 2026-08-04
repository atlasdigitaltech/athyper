import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(packageRoot, "../../../..");
const roots = [
  resolve(workspaceRoot, "packages/shared/data-integration/meta-entity-authoring-contracts/src"),
  resolve(workspaceRoot, "packages/products/admin/meta-entity-runtime/src"),
  resolve(workspaceRoot, "packages/products/admin/meta-entity-studio-ui/src"),
  resolve(workspaceRoot, "server/packages/services/meta-entity-authoring/src"),
  resolve(workspaceRoot, "server/db/seed/meta-entity"),
].filter(existsSync);

const forbidden = [
  /control\.entity_/i,
  /control\.field_group/i,
  /MetaEntityContractV2/i,
  /MetaEntityContractV21/i,
  /setup\/metadata/i,
  /services\/metadata/i,
];
const inspectedExtensions = new Set([".ts", ".tsx", ".sql"]);
const violations = [];

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(path);
      continue;
    }
    if (!inspectedExtensions.has(extname(entry.name))) continue;
    const source = readFileSync(path, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(`${path}: ${pattern}`);
    }
  }
}

for (const root of roots) inspect(root);

if (violations.length) {
  throw new Error(`Meta Entity clean-room boundary failed:\n${violations.join("\n")}`);
}

process.stdout.write("Meta Entity clean-room boundary passed.\n");
