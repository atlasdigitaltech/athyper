#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sqlExt = new Set([".sql"]);
const serviceExt = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const ignoredDirs = new Set(["node_modules", ".git", ".next", "dist", ".turbo"]);

function toPosix(path) {
  return path.split(sep).join("/");
}

function* walk(root, extensions = sqlExt) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (ignoredDirs.has(entry)) continue;
    const abs = join(root, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      yield* walk(abs, extensions);
      continue;
    }
    if (extensions.has(extname(entry))) yield abs;
  }
}

const violations = [];
const allowedBusinessNetworkServiceRefs = new Set([
  "server/packages/services/iam/context/context-resolver.service.ts",
  "server/packages/services/iam/discovery/discovery.service.ts",
]);

function isAllowedBusinessNetworkServiceRef(rel) {
  return rel.includes("/legacy/")
    || rel.includes("/compat/")
    || allowedBusinessNetworkServiceRefs.has(rel);
}

for (const meshDdlDir of ["mesh", "mesh_log", "mesh_control"]) {
  for (const abs of walk(join(repoRoot, "server", "db", "ddl", meshDdlDir))) {
    const rel = toPosix(relative(repoRoot, abs));
    const source = readFileSync(abs, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const normalized = line.replace(/--.*$/, "");
      if (/\bREFERENCES\s+(master|control|document|ledger|log|event|governance|snapshot|aggregate)\./i.test(normalized)) {
        violations.push(`${rel}:${index + 1} Mesh DDL must not FK to Neon-owned schemas`);
      }
    });
  }
}

const athyperNetworkAllowed = [
  "server/db/ddl/master/01i_tables_party_master.sql",
  "server/db/ddl/master/01m_bp_core_hardening.sql",
  "server/db/seed/tenants/neon/010_demo/network/001_buyer_networks.sql",
  "server/db/seed/tenants/neon/020_technostat/network/001_buyer_networks.sql",
  "server/db/seed/tenants/neon/030_cirrusatlantic/network/001_buyer_networks.sql",
];

for (const abs of walk(join(repoRoot, "server", "db"))) {
  const rel = toPosix(relative(repoRoot, abs));
  const source = readFileSync(abs, "utf8");
  if (!source.includes("athyper_network")) continue;
  if (!athyperNetworkAllowed.includes(rel)) {
    violations.push(`${rel} contains athyper_network outside the approved legacy/backcompat paths`);
  }
}

for (const abs of walk(join(repoRoot, "server", "packages", "services"), serviceExt)) {
  const rel = toPosix(relative(repoRoot, abs));
  if (isAllowedBusinessNetworkServiceRef(rel)) continue;

  const source = readFileSync(abs, "utf8");
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\bmaster\.business_network(?:_membership|_membership_role)?\b|\bbusiness_network(?:_membership|_membership_role)?\b/i.test(line)) {
      violations.push(`${rel}:${index + 1} legacy master.business_network* references must live under legacy/ or compat/ paths`);
    }
  });
}

if (violations.length > 0) {
  console.error(["NEON/MESH boundary violations:", ...violations.map((v) => `- ${v}`)].join("\n"));
  process.exit(1);
}

console.log("NEON/MESH boundary checks verified.");
