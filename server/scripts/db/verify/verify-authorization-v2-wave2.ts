#!/usr/bin/env tsx
/**
 * Static Wave 2 catalog gate. Opens no database connection.
 */

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ExactEntityOperationResolver } from
  "@athyper/svc-iam";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../../../db");
const repositoryRoot = resolve(databaseRoot, "../..");

interface Report {
  status: string;
  counts: {
    sourceTuples: number;
    operations: number;
    permissions: number;
    contextualAliases: number;
    referenceSources: number;
    highRiskOperations: number;
  };
  gates: Record<string, boolean | string>;
  readAudit: string[];
  failures: string[];
}

interface Compiled {
  catalogId: string;
  resolutionMode: string;
  referenceSources: Array<{ kind: string; relation: string }>;
  operations: Array<{
    operationId: string;
    permissionId: string;
    entityCode: string;
    operationCode: string;
    canonicalPermissionCode: string;
    operationKind: string;
    riskTier: string;
    requiresMfa: boolean;
    requiresSod: boolean;
    shareable: boolean;
    delegable: boolean;
    planes: string[];
    definitionSha256: string;
  }>;
}

let failures = 0;
function expect(condition: unknown, message: string): void {
  if (condition) process.stdout.write(`PASS ${message}\n`);
  else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const requiredReferenceKinds = new Set([
  "entity_operation",
  "surface",
  "action",
  "transition",
  "flow",
  "flow_step",
  "flow_field",
  "field_security",
  "relation",
]);

for (const catalogId of ["neon-admin", "mesh"] as const) {
  const generated = resolve(
    databaseRoot,
    `catalog/${catalogId}/compiled`,
  );
  const report = await json<Report>(
    resolve(generated, "verification-report.v1.json"),
  );
  const compiled = await json<Compiled>(
    resolve(generated, "compiled-catalog.v1.json"),
  );

  expect(report.status === "pass", `${catalogId} compiler report passes`);
  expect(
    report.failures.length === 0,
    `${catalogId} compiler report has no failures`,
  );
  expect(
    report.counts.operations === report.counts.permissions,
    `${catalogId} operation/permission counts are one-to-one`,
  );
  expect(
    compiled.operations.length === report.counts.operations,
    `${catalogId} compiled operation count matches its report`,
  );
  expect(
    new Set(compiled.operations.map((row) => row.operationId)).size
      === compiled.operations.length,
    `${catalogId} operation IDs are unique`,
  );
  expect(
    new Set(compiled.operations.map((row) => row.permissionId)).size
      === compiled.operations.length,
    `${catalogId} permission IDs are unique`,
  );
  expect(
    new Set(compiled.operations.map((row) => row.canonicalPermissionCode)).size
      === compiled.operations.length,
    `${catalogId} canonical permission codes are unique`,
  );
  expect(
    compiled.resolutionMode === "exact_permission_id",
    `${catalogId} resolution mode is exact permission ID`,
  );
  expect(
    compiled.operations.every((row) =>
      row.canonicalPermissionCode.endsWith(
        `.${row.entityCode.toLowerCase()}.${row.operationCode.toLowerCase()}`,
      )
    ),
    `${catalogId} permissions bind the exact entity/operation tuple`,
  );
  expect(
    compiled.operations
      .filter((row) => row.operationKind === "mutation")
      .every((row) => row.canonicalPermissionCode.includes(".")),
    `${catalogId} has no generic mutation verb authority`,
  );
  expect(
    compiled.operations
      .filter((row) => row.riskTier === "high" || row.riskTier === "critical")
      .every((row) =>
        typeof row.requiresMfa === "boolean"
        && typeof row.requiresSod === "boolean"
        && typeof row.shareable === "boolean"
        && typeof row.delegable === "boolean"
      ),
    `${catalogId} high-risk metadata is complete`,
  );

  const referenceKinds = new Set(
    compiled.referenceSources.map((source) => source.kind),
  );
  if (catalogId === "neon-admin") {
    const permissionSeedPath = resolve(
      repositoryRoot,
      "server/db/ddl/planes/neon/authz/12_compiled_permission_reference_seed.sql",
    );
    const permissionSeedSource = await readFile(permissionSeedPath, "utf8");
    const permissionSeedSet = new Set(
      Array.from(
        permissionSeedSource.matchAll(
          /\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'/g,
        ),
        (match) => match[1]!,
      ),
    );
    expect(
      permissionSeedSet.size > 0,
      "Neon/Authz compiled SQL includes permission seed rows",
    );
    expect(
      compiled.operations.every((operation) =>
        permissionSeedSet.has(operation.canonicalPermissionCode),
      ),
      "Neon/Admin compiled permission catalog matches the replacement seed payload by canonical permission code",
    );
    expect(
      [...requiredReferenceKinds].every((kind) => referenceKinds.has(kind)),
      "Neon/Admin maps operation, surface, action, transition, flow, field, and relation sources",
    );
    expect(
      compiled.operations.length >= 1,
      "Neon/Admin compiled catalog includes legacy permissions",
    );
  } else {
    expect(
      JSON.stringify(report.readAudit) === JSON.stringify([
        "catalog/authorization-catalog-semantic-contract.v1.json",
        "catalog/mesh/catalog.v1.json",
      ]),
      "Mesh compiler read audit is sealed to contract plus Mesh manifest",
    );
    expect(
      report.gates.meshCompiledWithoutNeonCatalogRead === true,
      "Mesh compilation reports no Neon catalog read",
    );
    expect(
      compiled.referenceSources.every((source) =>
        source.relation.startsWith("mesh_control.")
      ),
      "Mesh compiled references are Mesh-local",
    );
  }
}

const inferenceInventory = await json<{
  canonicalPaths: string[];
  knownLegacyReaders: string[];
}>(resolve(
  repositoryRoot,
  "config/governance/authorization-wave2-legacy-inference-inventory.v1.json",
));
expect(
  inferenceInventory.knownLegacyReaders.length > 0,
  "legacy suffix/token inference is explicitly inventoried",
);

const inferencePatterns = [
  /\bpermission(?:Code|_code)\b[^\n]{0,180}\.split\s*\(/i,
  /\bpermission(?:Code|_code)\b[^\n]{0,180}\.endsWith\s*\(/i,
  /\.endsWith\s*\([^\n]{0,120}\bpermission(?:Code|_code)\b/i,
  /\btokenize\s*\(\s*(?:operation\.)?permission(?:Code|_code)\b/i,
];
  const canonicalSources: string[] = [];
for (const relativeRoot of inferenceInventory.canonicalPaths) {
  const root = resolve(repositoryRoot, relativeRoot);
  canonicalSources.push(...await collectSources(root));
}
for (const path of canonicalSources) {
  const source = await readFile(path, "utf8");
  for (const pattern of inferencePatterns) {
    expect(
      !pattern.test(source),
      `${path.slice(repositoryRoot.length + 1)} contains no permission token/suffix inference`,
    );
  }
}

for (const path of [
  "server/db/ddl/planes/neon/authz/12_compiled_permission_reference_seed.sql",
  "server/db/ddl/planes/athyper/authz/12_compiled_permission_reference_seed.sql",
  "server/db/ddl/planes/athyper/control/12_lookup_reference_entrypoint.sql",
  "server/db/ddl/planes/neon/control/12_lookup_reference_entrypoint.sql",
  "server/db/ddl/planes/mesh/control/12_lookup_reference_entrypoint.sql",
] as const) {
  const source = await readFile(resolve(repositoryRoot, path), "utf8");
  if (path.includes("lookup_reference_entrypoint.sql")) {
    expect(
      source.includes("\\ir "),
      `${path} references seed packs through manifest includes`,
    );
  } else {
    expect(
      source.includes("-- seed-contract-version:"),
      `${path} carries a seed pack contract header`,
    );
    expect(
      source.includes("seed-assertions"),
      `${path} carries explicit seed assertions`,
    );
  }
}

const exactFixture = {
  catalogOwnerId: "owner",
  entityId: "entity",
  operationCode: "approve",
  permissionId: "permission",
  planeCode: "neon",
} as const;
const exactResolver = new ExactEntityOperationResolver([exactFixture]);
expect(
  exactResolver.requireExact({
    catalogOwnerId: "owner",
    entityId: "entity",
    operationCode: "approve",
    planeCode: "neon",
  }).permissionId === "permission",
  "canonical resolver returns the exact tuple permission",
);
expect(
  exactResolver.resolveExact({
    catalogOwnerId: "owner",
    entityId: "entity",
    operationCode: "approve_extra",
    planeCode: "neon",
  }) === undefined,
  "canonical resolver performs no suffix fallback",
);
expect(
  exactResolver.resolveExact({
    catalogOwnerId: "owner",
    entityId: "entity",
    operationCode: "approve",
    planeCode: "admin",
  }) === undefined,
  "canonical resolver performs no cross-plane fallback",
);

const digest = createHash("sha256");
for (const path of canonicalSources.sort()) {
  digest.update(await readFile(path));
}
process.stdout.write(`Wave 2 canonical source sha256=${digest.digest("hex")}\n`);

if (failures > 0) {
  process.stderr.write(`Wave 2 verification failed: ${failures} gate(s)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Wave 2 static catalog verification passed\n");
}

async function collectSources(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await collectSources(path));
    else if (
      entry.isFile()
      && /\.(?:ts|tsx|js|mjs|json|sql)$/.test(entry.name)
    ) {
      result.push(path);
    }
  }
  return result;
}
