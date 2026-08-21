import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

const excluded = [
  /^docs\//,
  /^packages\/product-deprecated\//,
  /^policy\//,
  /^config\/governance\//,
];
const sourceFiles = tracked.filter((file) =>
  /\.(ts|tsx|js|mjs|cjs|sql|json|yaml|yml|env\.example)$/.test(file)
  && file !== "server/scripts/check-meta-entity-hygiene.ts"
  && existsSync(resolve(repoRoot, file))
  && !excluded.some((pattern) => pattern.test(file)),
);

const forbidden = [
  "records_api_disabled",
  "generic_runtime_disabled",
  "ENTITY_QUERY_V1_PILOTS",
  "NEON_ENTITY_QUERY_V1_PILOTS",
  "NEON_ENTITY_QUERY_V1_MODE",
];
const violations: string[] = [];

for (const file of sourceFiles) {
  const contents = readFileSync(resolve(repoRoot, file), "utf8");
  for (const token of forbidden) {
    if (contents.includes(token)) violations.push(`${file}: legacy metadata compatibility token '${token}'`);
  }
}

const duplicatePackages = [
  "packages/shared/api-contracts",
  "packages/shared/metadata-client",
  "packages/shared/runtime-contracts",
  "packages/shared/runtime-shared",
  "packages/shared/business-domain/api-contracts",
  "packages/shared/business-domain/runtime-contracts",
  "packages/shared/business-domain/runtime-shared",
  "packages/shared/platform-auth/runtime-contracts",
  "packages/shared/runtime-domain/api-contracts",
  "packages/shared/runtime-domain/metadata-client",
  "packages/shared/ui-platform/api-contracts",
  "packages/shared/ui-platform/runtime-contracts",
  "packages/shared/ui-platform/runtime-shared",
];
for (const directory of duplicatePackages) {
  if (existsSync(resolve(repoRoot, `${directory}/package.json`))) violations.push(`${directory}: retired duplicate package remains`);
}

const prismaSchemas = tracked.filter((file) => file.endsWith("schema.prisma"));
if (prismaSchemas.length !== 1 || prismaSchemas[0] !== "server/packages/adapters/db/src/prisma/schema.prisma") {
  violations.push(`Prisma schema authority mismatch: ${prismaSchemas.join(", ") || "none"}`);
}

if (violations.length > 0) {
  console.error("Meta-entity repository hygiene failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Meta-entity repository hygiene passed: canonical packages, schema authority, and compatibility flags are clean.");
}
