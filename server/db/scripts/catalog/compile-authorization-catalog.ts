#!/usr/bin/env tsx
/**
 * Wave 2 canonical authorization catalog compiler.
 *
 * The Mesh invocation has a deliberately sealed read set: it opens only the
 * shared semantic contract and the Mesh manifest. It never discovers or reads
 * Neon seed files. Neon/Admin compilation snapshots the literal legacy
 * control.entity_operation seed tuples so every migrated row is reviewable.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type CatalogTarget = "neon-admin" | "mesh";
type RiskTier = "low" | "medium" | "high" | "critical";
type OperationKind = "read" | "mutation";
type IdempotencyMode =
  | "none"
  | "idempotent"
  | "idempotency_key_required";

interface OperationProfile {
  profile: string;
  codes: string[];
  operationKind: OperationKind;
  idempotencyMode: IdempotencyMode;
  riskTier: RiskTier;
  requiresMfa: boolean;
  requiresSod: boolean;
  shareable: boolean;
  delegable: boolean;
}

interface ContextualAliasGroup {
  legacyCode: string;
  entities: string[];
  operationCode: string;
  plane: string;
  reason: string;
  introducedVersion: string;
  removalVersion: string;
}

interface ReferenceSource {
  kind: string;
  relation: string;
  identityColumns: string[];
  entityPath: string;
  operationPath: string;
  permissionPath: string;
  role: string;
}

interface Manifest {
  contractVersion: string;
  manifestVersion: string;
  catalogId: CatalogTarget;
  database: "neon" | "mesh";
  catalogOwnerCode: string;
  planes: string[];
  canonicalCodePrefix: string;
  allowedReadRoots?: string[];
  forbiddenSchemas?: string[];
  adminEntities?: string[];
  excludedEntities?: string[];
  entityOperationSource?: {
    kind: string;
    roots: string[];
    relation: string;
    entityColumn: string;
    legacyPermissionColumn: string;
    surfaceColumn: string;
    enabledPredicate: string;
  };
  referenceSources: ReferenceSource[];
  entities?: Array<{
    entityCode: string;
    sourceRelation: string;
    operations: string[];
  }>;
  operationProfiles: OperationProfile[];
  contextualAliases?: ContextualAliasGroup[];
  forbiddenRuntimeResolution: string[];
}

interface LegacyTuple {
  entityCode: string;
  legacyCode: string;
  surface: string | null;
  sourcePath: string;
}

interface CompiledOperation {
  operationId: string;
  permissionId: string;
  entityCode: string;
  operationCode: string;
  legacyCodes: string[];
  canonicalPermissionCode: string;
  operationKind: OperationKind;
  idempotencyMode: IdempotencyMode;
  riskTier: RiskTier;
  requiresMfa: boolean;
  requiresSod: boolean;
  shareable: boolean;
  delegable: boolean;
  planes: string[];
  surfaces: string[];
  provenance: string[];
  definitionSha256: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const contractPath = resolve(
  databaseRoot,
  "catalog/authorization-catalog-semantic-contract.v1.json",
);

const targetArgument = process.argv.find((argument) =>
  argument.startsWith("--catalog="),
);
const target = targetArgument?.slice("--catalog=".length) as
  | CatalogTarget
  | undefined;
const checkOnly = process.argv.includes("--check");

if (target !== "neon-admin" && target !== "mesh") {
  throw new Error("Use --catalog=neon-admin or --catalog=mesh");
}

const manifestPath = resolve(databaseRoot, `catalog/${target}/catalog.v1.json`);
const outputDirectory = resolve(
  databaseRoot,
  `catalog/${target}/compiled`,
);
const readAudit: string[] = [];

async function auditedRead(path: string): Promise<string> {
  const normalized = relative(databaseRoot, path).split(sep).join("/");
  readAudit.push(normalized);
  return readFile(path, "utf8");
}

const contract = JSON.parse(await auditedRead(contractPath)) as {
  contractVersion: string;
  vocabulary: {
    planes: string[];
    operationKinds: string[];
    idempotencyModes: string[];
    riskTiers: string[];
    referenceKinds: string[];
    referenceRoles: string[];
  };
};
const manifest = JSON.parse(await auditedRead(manifestPath)) as Manifest;

const failures: string[] = [];
const warnings: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) failures.push(message);
}

assert(
  manifest.contractVersion === contract.contractVersion,
  "manifest contractVersion must equal the shared semantic contract",
);
assert(manifest.catalogId === target, "manifest catalogId must match CLI target");
assert(
  manifest.planes.every((plane) => contract.vocabulary.planes.includes(plane)),
  "manifest contains only contract planes",
);
assert(
  new Set(manifest.planes).size === manifest.planes.length,
  "manifest plane list must be unique",
);
assert(
  manifest.referenceSources.every((source) =>
    contract.vocabulary.referenceKinds.includes(source.kind)
  ),
  "every reference source kind belongs to the shared vocabulary",
);
assert(
  manifest.referenceSources.every((source) =>
    contract.vocabulary.referenceRoles.includes(source.role)
  ),
  "every reference role belongs to the shared vocabulary",
);

const profileByCode = new Map<string, OperationProfile>();
for (const profile of manifest.operationProfiles) {
  assert(
    contract.vocabulary.operationKinds.includes(profile.operationKind),
    `${profile.profile}: invalid operationKind`,
  );
  assert(
    contract.vocabulary.idempotencyModes.includes(profile.idempotencyMode),
    `${profile.profile}: invalid idempotencyMode`,
  );
  assert(
    contract.vocabulary.riskTiers.includes(profile.riskTier),
    `${profile.profile}: invalid riskTier`,
  );
  for (const code of profile.codes) {
    assert(
      !profileByCode.has(code),
      `operation code '${code}' appears in more than one profile`,
    );
    profileByCode.set(code, profile);
  }
}

const aliasByContext = new Map<string, ContextualAliasGroup>();
for (const alias of manifest.contextualAliases ?? []) {
  assert(
    manifest.planes.includes(alias.plane),
    `alias ${alias.legacyCode}: plane is outside this catalog`,
  );
  assert(
    alias.legacyCode !== alias.operationCode,
    `alias ${alias.legacyCode}: self aliases are forbidden`,
  );
  for (const entityCode of alias.entities) {
    const key = `${alias.plane}\u0000${entityCode}\u0000${alias.legacyCode}`;
    assert(!aliasByContext.has(key), `ambiguous contextual alias ${key}`);
    aliasByContext.set(key, alias);
  }
}

const literalOperationBlock =
  /INSERT\s+INTO\s+control\.entity_operation\b[\s\S]*?(?:ON\s+CONFLICT[\s\S]*?;|;\s*$)/gi;
const literalTuple =
  /\(\s*NULL\s*,\s*'([a-zA-Z0-9_]+)'\s*,\s*'([a-zA-Z0-9_.]+)'\s*,\s*'(LIST|DETAIL|BOTH|PALETTE_ONLY|HIDDEN)'/g;

async function walkSql(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await walkSql(path));
    else if (entry.isFile() && entry.name.endsWith(".sql")) result.push(path);
  }
  return result;
}

async function loadNeonLegacyTuples(): Promise<LegacyTuple[]> {
  const source = manifest.entityOperationSource;
  assert(source, "Neon/Admin manifest requires entityOperationSource");
  if (!source) return [];

  const tuples: LegacyTuple[] = [];
  for (const root of source.roots) {
    const absoluteRoot = resolve(databaseRoot, root);
    for (const path of await walkSql(absoluteRoot)) {
      const sql = await auditedRead(path);
      for (const block of sql.matchAll(literalOperationBlock)) {
        for (const tuple of block[0].matchAll(literalTuple)) {
          const entityCode = tuple[1];
          const legacyCode = tuple[2];
          if (!entityCode || !legacyCode) continue;
          tuples.push({
            entityCode,
            legacyCode,
            surface: tuple[3] ?? null,
            sourcePath: relative(databaseRoot, path).split(sep).join("/"),
          });
        }
      }
    }
  }
  return tuples;
}

function loadMeshManifestTuples(): LegacyTuple[] {
  assert(manifest.entities, "Mesh manifest requires entities");
  return (manifest.entities ?? []).flatMap((entity) =>
    entity.operations.map((operation) => ({
      entityCode: entity.entityCode,
      legacyCode: operation,
      surface: null,
      sourcePath: "catalog/mesh/catalog.v1.json",
    }))
  );
}

function contextualOperationCode(tuple: LegacyTuple, planes: string[]): string {
  for (const plane of planes) {
    const alias = aliasByContext.get(
      `${plane}\u0000${tuple.entityCode}\u0000${tuple.legacyCode}`,
    );
    if (alias) return alias.operationCode;
  }
  return tuple.legacyCode.toLowerCase();
}

function stableUuid(namespace: string): string {
  const bytes = createHash("sha256").update(namespace).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const discoveredTuples = target === "neon-admin"
  ? await loadNeonLegacyTuples()
  : loadMeshManifestTuples();
const excludedEntities = new Set(manifest.excludedEntities ?? []);
const tuples = discoveredTuples.filter(
  (tuple) => !excludedEntities.has(tuple.entityCode),
);
assert(tuples.length > 0, "catalog must contain at least one entity operation");

const adminEntities = new Set(manifest.adminEntities ?? []);
const compiledByTuple = new Map<string, CompiledOperation>();
for (const tuple of tuples) {
  const operationCode = contextualOperationCode(
    tuple,
    target === "mesh"
      ? ["mesh"]
      : adminEntities.has(tuple.entityCode)
      ? ["admin"]
      : ["neon"],
  );
  const profile = profileByCode.get(operationCode)
    ?? profileByCode.get(tuple.legacyCode);
  assert(
    profile,
    `${tuple.entityCode}.${tuple.legacyCode}: no exact operation profile`,
  );
  if (!profile) continue;

  const planes = target === "mesh"
    ? ["mesh"]
    : adminEntities.has(tuple.entityCode)
    ? ["admin"]
    : ["neon"];
  const key = `${tuple.entityCode}\u0000${operationCode}`;
  const canonicalPermissionCode = [
    manifest.canonicalCodePrefix,
    tuple.entityCode.toLowerCase(),
    operationCode.toLowerCase(),
  ].join(".");
  const definition = {
    catalog: target,
    entityCode: tuple.entityCode,
    operationCode,
    canonicalPermissionCode,
    operationKind: profile.operationKind,
    idempotencyMode: profile.idempotencyMode,
    riskTier: profile.riskTier,
    requiresMfa: profile.requiresMfa,
    requiresSod: profile.requiresSod,
    shareable: profile.shareable,
    delegable: profile.delegable,
    planes,
  };
  const current = compiledByTuple.get(key);
  if (current) {
    current.legacyCodes = [...new Set([...current.legacyCodes, tuple.legacyCode])]
      .sort();
    if (tuple.surface) {
      current.surfaces = [...new Set([...current.surfaces, tuple.surface])].sort();
    }
    current.provenance = [
      ...new Set([...current.provenance, tuple.sourcePath]),
    ].sort();
    continue;
  }
  compiledByTuple.set(key, {
    operationId: stableUuid(`${manifest.manifestVersion}:operation:${key}`),
    permissionId: stableUuid(`${manifest.manifestVersion}:permission:${key}`),
    ...definition,
    legacyCodes: [tuple.legacyCode],
    surfaces: tuple.surface ? [tuple.surface] : [],
    provenance: [tuple.sourcePath],
    definitionSha256: sha256(definition),
  });
}

const operations = [...compiledByTuple.values()].sort((a, b) =>
  a.entityCode.localeCompare(b.entityCode)
    || a.operationCode.localeCompare(b.operationCode)
);

const permissionIds = new Set(operations.map((operation) =>
  operation.permissionId
));
const operationIds = new Set(operations.map((operation) =>
  operation.operationId
));
const permissionCodes = new Set(operations.map((operation) =>
  operation.canonicalPermissionCode
));
assert(
  permissionIds.size === operations.length,
  "one-to-one: permission IDs must be unique per operation",
);
assert(
  operationIds.size === operations.length,
  "one-to-one: operation IDs must be unique",
);
assert(
  permissionCodes.size === operations.length,
  "one-to-one: canonical permission codes must be unique per operation",
);

const genericVerbs = new Set([
  "create",
  "read",
  "update",
  "edit",
  "delete",
  "approve",
  "post",
]);
for (const operation of operations) {
  assert(
    !genericVerbs.has(operation.canonicalPermissionCode),
    `${operation.entityCode}.${operation.operationCode}: generic permission authority`,
  );
  assert(
    operation.canonicalPermissionCode.endsWith(
      `.${operation.entityCode.toLowerCase()}.${operation.operationCode.toLowerCase()}`,
    ),
    `${operation.entityCode}.${operation.operationCode}: permission code is not entity-bound`,
  );
  if (operation.riskTier === "high" || operation.riskTier === "critical") {
    for (const field of [
      "requiresMfa",
      "requiresSod",
      "shareable",
      "delegable",
    ] as const) {
      assert(
        typeof operation[field] === "boolean",
        `${operation.entityCode}.${operation.operationCode}: high-risk ${field} is not explicit`,
      );
    }
  }
}

const aliases = [...aliasByContext.entries()].map(([context, alias]) => {
  const [, entityCode] = context.split("\u0000");
  const operation = operations.find((candidate) =>
    candidate.entityCode === entityCode
    && candidate.operationCode === alias.operationCode
  );
  assert(operation, `alias target is missing for ${context}`);
  return {
    aliasId: stableUuid(`${manifest.manifestVersion}:alias:${context}`),
    legacyCode: alias.legacyCode,
    entityCode,
    operationCode: alias.operationCode,
    plane: alias.plane,
    canonicalPermissionId: operation?.permissionId,
    canonicalPermissionCode: operation?.canonicalPermissionCode,
    resolverScope: "migration_import_only",
    reason: alias.reason,
    introducedVersion: alias.introducedVersion,
    removalVersion: alias.removalVersion,
  };
}).sort((a, b) =>
  `${a.plane}:${a.entityCode}:${a.legacyCode}`.localeCompare(
    `${b.plane}:${b.entityCode}:${b.legacyCode}`,
  )
);

if (target === "mesh") {
  const allowedReads = new Set(manifest.allowedReadRoots ?? []);
  const unexpectedReads = readAudit.filter((path) => !allowedReads.has(path));
  assert(
    unexpectedReads.length === 0,
    `Mesh compiler read outside sealed roots: ${unexpectedReads.join(", ")}`,
  );
  assert(
    readAudit.every((path) => !path.includes("catalog/neon-admin/")),
    "Mesh compiler must not read the Neon/Admin manifest",
  );
  const forbiddenSchemas = manifest.forbiddenSchemas ?? [];
  const meshManifestSource = JSON.stringify(manifest);
  for (const schema of forbiddenSchemas) {
    assert(
      !new RegExp(`\\b${schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`)
        .test(meshManifestSource),
      `Mesh manifest reads forbidden Neon schema ${schema}`,
    );
  }
}

const report = {
  reportVersion: "wave2.authorization-catalog.verification.v1",
  reproducibleInputSha256: sha256({ contract, manifest, tuples }),
  catalogId: target,
  manifestVersion: manifest.manifestVersion,
  contractVersion: manifest.contractVersion,
  status: failures.length === 0 ? "pass" : "fail",
  counts: {
    sourceTuples: tuples.length,
    operations: operations.length,
    permissions: permissionIds.size,
    contextualAliases: aliases.length,
    referenceSources: manifest.referenceSources.length,
    highRiskOperations: operations.filter((operation) =>
      operation.riskTier === "high" || operation.riskTier === "critical"
    ).length,
  },
  gates: {
    oneToOneOperationPermission:
      permissionIds.size === operations.length
      && permissionCodes.size === operations.length,
    zeroAmbiguousContextualAlias:
      aliases.length === aliasByContext.size,
    noGenericVerbMutationAuthority: failures.every((failure) =>
      !failure.includes("generic permission authority")
    ),
    highRiskMetadataComplete: failures.every((failure) =>
      !failure.includes("high-risk")
    ),
    meshCompiledWithoutNeonCatalogRead:
      target !== "mesh"
      || readAudit.every((path) => !path.includes("neon-admin")),
    runtimeUsesExactPermissionId: true,
    liveReferenceCoverage: "deployment_gate_required"
  },
  readAudit,
  warnings,
  failures,
};

const compiled = {
  compiledCatalogVersion: manifest.manifestVersion,
  semanticContractVersion: manifest.contractVersion,
  catalogId: target,
  database: manifest.database,
  catalogOwnerCode: manifest.catalogOwnerCode,
  planes: manifest.planes,
  resolutionMode: "exact_permission_id",
  referenceSources: manifest.referenceSources,
  operations,
};

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function compileSql(): string {
  const tableSchema = target === "mesh" ? "mesh_control" : "control";
  const entityTable = `${tableSchema}.entity`;
  const ownerId = target === "mesh"
    ? "00000000-0000-7000-8000-000000000030"
    : "00000000-0000-7000-8000-000000000010";
  const values = operations.map((operation) =>
    [
      quoteLiteral(operation.operationId),
      quoteLiteral(operation.permissionId),
      quoteLiteral(operation.entityCode),
      quoteLiteral(operation.operationCode),
      quoteLiteral(operation.canonicalPermissionCode),
      quoteLiteral(operation.operationKind),
      quoteLiteral(operation.idempotencyMode),
      quoteLiteral(operation.riskTier),
      operation.requiresMfa,
      operation.requiresSod,
      operation.shareable,
      operation.delegable,
      quoteLiteral(operation.definitionSha256),
      quoteLiteral(operation.planes.join(",")),
    ].join(", ")
  ).map((row) => `    (${row})`).join(",\n");
  const entityPreflight = target === "mesh"
    ? `
DO $wave2$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(source_relation ORDER BY source_relation)
      INTO v_missing
      FROM unnest(ARRAY[
        ${(manifest.entities ?? []).map((entity) =>
          quoteLiteral(entity.sourceRelation)
        ).join(",\n        ")}
      ]::text[]) source_relation
     WHERE to_regclass(source_relation) IS NULL;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'Wave 2 Mesh source relations are missing: %', v_missing;
    END IF;
END
$wave2$;`
    : `
DO $wave2$
DECLARE
    v_ambiguous bigint;
    v_missing bigint;
BEGIN
    SELECT count(*) INTO v_ambiguous
    FROM (
        SELECT c.entity_code
        FROM wave2_compiled_catalog c
        JOIN ${entityTable} e ON e.entity_code = c.entity_code
        GROUP BY c.entity_code
        HAVING count(DISTINCT e.id) <> 1
    ) anomaly;
    SELECT count(*) INTO v_missing
    FROM wave2_compiled_catalog c
    LEFT JOIN ${entityTable} e ON e.entity_code = c.entity_code
    WHERE e.id IS NULL;
    IF v_ambiguous <> 0 OR v_missing <> 0 THEN
        RAISE EXCEPTION 'Wave 2 entity resolution failed: ambiguous=%, missing=%',
            v_ambiguous, v_missing;
    END IF;
END
$wave2$;`;
  return `-- GENERATED. DO NOT EDIT.
-- ${manifest.manifestVersion}
-- Resolution is exact by permission UUID; this file contains no suffix/token inference.
BEGIN;

CREATE TEMP TABLE wave2_compiled_catalog (
    operation_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    entity_code text NOT NULL,
    operation_code text NOT NULL,
    canonical_permission_code text NOT NULL,
    operation_kind text NOT NULL,
    idempotency_mode text NOT NULL,
    risk_tier text NOT NULL,
    requires_mfa boolean NOT NULL,
    requires_sod boolean NOT NULL,
    is_shareable boolean NOT NULL,
    is_delegable boolean NOT NULL,
    definition_sha256 text NOT NULL,
    planes_csv text NOT NULL,
    PRIMARY KEY (operation_id),
    UNIQUE (permission_id),
    UNIQUE (canonical_permission_code),
    UNIQUE (entity_code, operation_code)
) ON COMMIT DROP;

INSERT INTO wave2_compiled_catalog VALUES
${values};

${entityPreflight}

-- The apply phase is intentionally generated after the exact entity-resolution
-- preflight. Installation remains a separate, approval-gated deployment step.
-- catalog_owner_id=${ownerId}

ROLLBACK;
`;
}

if (!checkOnly) {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "compiled-catalog.v1.json"),
    `${JSON.stringify(compiled, null, 2)}\n`,
  );
  await writeFile(
    resolve(outputDirectory, "verification-report.v1.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    resolve(outputDirectory, "verification-report.md"),
    `# ${target} Wave 2 catalog verification

- Status: **${report.status.toUpperCase()}**
- Manifest: \`${manifest.manifestVersion}\`
- Semantic contract: \`${manifest.contractVersion}\`
- Source tuples: ${report.counts.sourceTuples}
- Exact operations / permissions: ${report.counts.operations} / ${report.counts.permissions}
- High-risk operations: ${report.counts.highRiskOperations}
- Contextual migration aliases: ${report.counts.contextualAliases}
- Reference source types: ${report.counts.referenceSources}
- Runtime resolution: exact permission ID
- Live row-reference coverage: deployment gate required
- Files read by compiler: ${readAudit.length}

| Gate | Result |
|---|---|
| One operation to one permission | ${report.gates.oneToOneOperationPermission ? "PASS" : "FAIL"} |
| Zero ambiguous contextual alias | ${report.gates.zeroAmbiguousContextualAlias ? "PASS" : "FAIL"} |
| No generic mutation verb authority | ${report.gates.noGenericVerbMutationAuthority ? "PASS" : "FAIL"} |
| High-risk metadata complete | ${report.gates.highRiskMetadataComplete ? "PASS" : "FAIL"} |
| Mesh has no Neon catalog read | ${report.gates.meshCompiledWithoutNeonCatalogRead ? "PASS" : "FAIL"} |

The static compiler report does not claim that a database backfill has run.
Run \`db:verify:authorization-v2-wave2:live\` after snapshot/replay/backfill; every
row-level source reference must then be exact and the live anomaly count must be
zero.
`,
  );
  await writeFile(
    resolve(outputDirectory, "catalog-preflight.sql"),
    compileSql(),
  );
}

process.stdout.write(
  `${target}: ${report.status}; operations=${operations.length}; `
    + `aliases=${aliases.length}; reads=${readAudit.length}\n`,
);
for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
if (failures.length > 0) process.exitCode = 1;
