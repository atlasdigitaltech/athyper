import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
// Post-reorg the records HTTP routes live directly under src/ (records-routes.ts,
// entity-list-routes.ts, transfer/transfer-routes.ts, …) rather than a routes/
// directory. Ratchet the whole service source — identity parsing is forbidden
// anywhere in it, not just the route files.
const SCOPE = "server/packages/services/records/src";
const routesRoot = resolve(root, SCOPE);
const baselinePath = resolve(
  root,
  "config/governance/records-identity-boundary.json",
);
const args = new Set(process.argv.slice(2));

const patterns = {
  verifyBearer: /\bverifyBearer\s*\(/g,
  resolveTenantId: /\bresolveTenantId\s*\(/g,
  directOrgHeader:
    /(?:req\.)?headers\s*\[\s*["']x-org["']\s*\]|req\.get\(\s*["']x-org["']\s*\)/gi,
  principalResolution:
    /\b(?:resolvePrincipalIdWithJit|resolvePrincipalIdOrNull|resolvePrincipalId|principalResolver)\s*\(/g,
};

const files = collect(routesRoot).filter(
  (file) => !file.includes("__tests__") && !file.endsWith(".test.ts"),
);
const counts = Object.fromEntries(
  Object.entries(patterns).map(([name, pattern]) => [
    name,
    count(files, pattern),
  ]),
);
const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
const current = {
  schemaVersion: 1,
  scope: SCOPE,
  counts,
  total,
  files: files.length,
};

if (args.has("--write-baseline")) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Wrote ${baselinePath}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const failures = [];
for (const [name, value] of Object.entries(counts)) {
  const allowed = Number(baseline.counts?.[name] ?? 0);
  if (value > allowed)
    failures.push(`${name} increased from ${allowed} to ${value}`);
}
if (failures.length > 0) {
  console.error(
    [
      "Records identity-boundary ratchet failed:",
      ...failures,
      "Migrate a call site or update the baseline only after review.",
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Records identity-boundary ratchet passed (${total} tracked matches across ${files.length} route files).`,
  );
}

function collect(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function count(paths, pattern) {
  return paths.reduce(
    (sum, file) =>
      sum + (readFileSync(file, "utf8").match(pattern)?.length ?? 0),
    0,
  );
}
