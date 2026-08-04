#!/usr/bin/env tsx
/**
 * Static verifier for the physically separate Mesh Wave 1 additive expansion.
 *
 * It opens no database connection and writes nothing. Live catalog, capture,
 * snapshot, replay, conservation, and rollback evidence remain deployment
 * gates and must be produced with the explicit Mesh-only operator commands.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  meshAuthorizationV2AllTables,
  meshAuthorizationV2AllViews,
  meshAuthorizationV2AuthorityTables,
  meshAuthorizationV2CatalogTables,
  meshAuthorizationV2ForbiddenNeonSchemas,
  meshAuthorizationV2FunctionNames,
  meshAuthorizationV2InvalidationTargets,
  meshAuthorizationV2MigrationTables,
  meshAuthorizationV2OrderedDdl,
  meshAuthorizationV2RequiredSchemas,
  meshAuthorizationV2RuntimeTables,
  meshAuthorizationV2Wave0Sources,
} from "../contracts/mesh-authorization-v2-wave1.js";

const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--help");
if (process.argv.includes("--help")) {
  process.stdout.write("Usage: verify-mesh-authorization-v2-wave1.ts\n");
  process.exit(0);
}
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const sourceByPath = new Map<string, string>();
for (const path of meshAuthorizationV2OrderedDdl) {
  sourceByPath.set(path, await readFile(resolve(databaseRoot, path), "utf8"));
}
const combinedDdl = [...sourceByPath.values()].join("\n");
const executableDdl = stripSqlComments(combinedDdl);

const paths = {
  catalogTables: "ddl/mesh_control/01zz_authorization_v2_catalog.sql",
  migrationTables:
    "ddl/mesh_control/01zzz_authorization_v2_migration_state.sql",
  authorityTables: "ddl/mesh/01zz_authorization_v2_authority.sql",
  runtimeTables: "ddl/mesh_log/01zz_authorization_v2_runtime.sql",
  catalogConstraints:
    "ddl/mesh_control/03_authorization_v2_catalog_constraints.sql",
  authorityConstraints:
    "ddl/mesh/03_authorization_v2_authority_constraints.sql",
  runtimeConstraints:
    "ddl/mesh_log/03_authorization_v2_runtime_constraints.sql",
  catalogFunctions:
    "ddl/mesh_control/05_authorization_v2_catalog_functions.sql",
  authorityFunctions:
    "ddl/mesh/05_authorization_v2_authority_functions.sql",
  invalidationFunctions:
    "ddl/mesh_log/05_authorization_v2_invalidation_functions.sql",
  replayFunctions:
    "ddl/mesh_log/05_authorization_v2_replay_functions.sql",
  evidenceFunctions:
    "ddl/mesh_log/05_authorization_v2_evidence_functions.sql",
  runtimeTriggers:
    "ddl/mesh_log/06_authorization_v2_runtime_triggers.sql",
  catalogViews: "ddl/mesh_control/07_authorization_v2_catalog_views.sql",
  authorityViews: "ddl/mesh/07_authorization_v2_authority_views.sql",
  runtimeViews: "ddl/mesh_log/07_authorization_v2_runtime_views.sql",
  catalogRls: "ddl/mesh_control/08_authorization_v2_catalog_rls.sql",
  migrationRls:
    "ddl/mesh_control/08_authorization_v2_migration_state_rls.sql",
  authorityRls: "ddl/mesh/08_authorization_v2_authority_rls.sql",
  runtimeRls: "ddl/mesh_log/08_authorization_v2_runtime_rls.sql",
} as const;
const read = (path: string): string => sourceByPath.get(path) ?? "";

const installer = await readFile(
  resolve(
    databaseRoot,
    "scripts/install/install-mesh-authorization-v2-expand.ts",
  ),
  "utf8",
);
const rollback = await readFile(
  resolve(
    databaseRoot,
    "scripts/install/rollback-mesh-authorization-v2-expand.ts",
  ),
  "utf8",
);
const replayManager = await readFile(
  resolve(
    databaseRoot,
    "scripts/migrate/manage-mesh-authorization-v2-replay.ts",
  ),
  "utf8",
);
const contract = await readFile(
  resolve(
    databaseRoot,
    "scripts/contracts/mesh-authorization-v2-wave1.ts",
  ),
  "utf8",
);
const wave0Registry = await readFile(
  resolve(
    databaseRoot,
    "ddl/mesh_control/01z_authorization_migration_controls.sql",
  ),
  "utf8",
);
const packageSource = await readFile(
  resolve(databaseRoot, "package.json"),
  "utf8",
);
const provisioner = await readFile(
  resolve(databaseRoot, "scripts/provision-mesh.ts"),
  "utf8",
);
const packageJson = JSON.parse(packageSource) as {
  scripts?: Record<string, string>;
};

let failures = 0;
function expect(condition: boolean, message: string): void {
  if (condition) {
    process.stdout.write(`PASS ${message}\n`);
  } else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

// ---------------------------------------------------------------------------
// Exact additive manifest and physical boundary.
// ---------------------------------------------------------------------------
expect(
  new Set(meshAuthorizationV2OrderedDdl).size
    === meshAuthorizationV2OrderedDdl.length,
  "expand manifest has no duplicate path",
);
expect(
  meshAuthorizationV2OrderedDdl.length === 25
    && meshAuthorizationV2OrderedDdl.every(
      (path) => /^ddl\/(?:mesh_control|mesh|mesh_log)\//.test(path),
    ),
  "expand manifest contains exactly 25 physically Mesh-local DDL files",
);
const phaseNumbers = meshAuthorizationV2OrderedDdl.map((path) => {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return Number(fileName.slice(0, 2));
});
expect(
  phaseNumbers.every(
    (phase, index) => index === 0 || phase >= phaseNumbers[index - 1]!,
  )
    && phaseNumbers.slice(-4).every((phase) => phase === 8),
  "manifest is dependency ordered and all RLS phases are last",
);
expect(
  meshAuthorizationV2OrderedDdl.every(
    (path) => !/(?:authorization_change_capture|01z_authorization)/.test(path),
  ),
  "expand manifest excludes Wave 0 capture installation",
);

const forbiddenDependency = new RegExp(
  String.raw`\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|TABLE|FUNCTION|VIEW|SEQUENCE)\s+(?:${
    meshAuthorizationV2ForbiddenNeonSchemas.join("|")
  })\s*\.`,
  "i",
);
const forbiddenFunctionCall = new RegExp(
  String.raw`\b(?:${
    meshAuthorizationV2ForbiddenNeonSchemas.join("|")
  })\.[a-z][a-z0-9_]*\s*\(`,
  "i",
);
expect(
  !forbiddenDependency.test(executableDdl)
    && !forbiddenFunctionCall.test(executableDdl)
    && !/\btenant_id\b/i.test(executableDdl)
    && !/\bshared\.(?:auth_permission_category|module|permission|role|persona|plan)\b/i
      .test(executableDdl),
  "DDL has no Neon-schema dependency or Neon tenant semantics",
);
expect(
  !/'(?:neon|admin)'\s*(?:,|\)|::|;)/i.test(executableDdl),
  "Mesh DDL publishes no Neon/Admin plane code",
);
expect(
  meshAuthorizationV2RequiredSchemas.join(",")
    === "shared,mesh_control,mesh,mesh_log",
  "required target fingerprint is the narrow Mesh-local schema set",
);

const declaredTables = new Set([...combinedDdl.matchAll(
  /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+((?:mesh_control|mesh|mesh_log)\.[a-z][a-z0-9_]*)/gi,
)].map((match) => match[1]!.toLowerCase()));
expect(
  setEquals(declaredTables, new Set(meshAuthorizationV2AllTables)),
  "every and only the 51 canonical/migration/runtime target tables are declared",
);

const destructivePatterns = [
  { regex: /\bDROP\s+(?:TABLE|SCHEMA|TYPE)\b/i, label: "DROP table/schema/type" },
  {
    regex: /\bALTER\s+TABLE\b[\s\S]{0,300}\bDROP\s+COLUMN\b/i,
    label: "DROP COLUMN",
  },
  {
    regex: /(?:^|;)\s*TRUNCATE\s+(?:TABLE\s+)?[a-z"]/im,
    label: "TRUNCATE statement",
  },
  { regex: /\bDELETE\s+FROM\b/i, label: "DELETE statement" },
  { regex: /\bRENAME\s+(?:TO|COLUMN)\b/i, label: "RENAME" },
  {
    regex: /\bALTER\s+COLUMN\b[\s\S]{0,160}\bSET\s+NOT\s+NULL\b/i,
    label: "SET NOT NULL",
  },
] as const;
for (const [path, source] of sourceByPath) {
  const executable = stripSqlComments(source);
  expect(
    destructivePatterns.every(({ regex }) => !regex.test(executable)),
    `${path} is additive (no destructive/backfill contraction statement)`,
  );
}
const notValidStatements = executableDdl.split(";").filter(
  (statement) => /\bADD\s+CONSTRAINT\b/i.test(statement)
    && /\bNOT\s+VALID\b/i.test(statement),
);
expect(
  notValidStatements.length === 0
    && read(paths.migrationTables).includes(
      "authorization_v2_deferred_constraint_registry",
    ),
  "empty shadow targets install validated constraints and retain an exact empty deferred registry",
);

// ---------------------------------------------------------------------------
// Catalog and account/plane authority integrity.
// ---------------------------------------------------------------------------
const catalogConstraints = read(paths.catalogConstraints);
const catalogFunctions = read(paths.catalogFunctions);
const catalogTriggers = read(
  "ddl/mesh_control/06_authorization_v2_catalog_triggers.sql",
);
expect(
  catalogConstraints.includes(
    "mesh_auth_entity_operation_exact_permission_fk",
  )
    && catalogConstraints.includes(
      "FOREIGN KEY (\n            catalog_owner_id,\n"
      + "            account_scope_key,\n            entity_id,\n"
      + "            operation_code,\n            permission_id",
    )
    && catalogConstraints.includes(
      "mesh_auth_entity_operation_plane_permission_plane_fk",
    ),
  "operation and operation-plane rows structurally reference the exact permission tuple",
);
expect(
  catalogFunctions.includes(
    "cannot publish without one exact active entity and permission",
  )
    && catalogFunctions.includes("permission_row.operation_code = NEW.operation_code")
    && catalogFunctions.includes(
      "permission security metadata mismatch",
    )
    && catalogTriggers.includes("trg_mesh_auth_operation_publish_guard")
    && catalogTriggers.includes("BEFORE INSERT OR UPDATE"),
  "a Mesh operation cannot publish without the exact active permission and metadata",
);
expect(
  read(paths.catalogTables).includes("CHECK (plane_code = 'mesh')")
    && read(paths.catalogTables).includes(
      "'00000000-0000-7000-8000-000000000021'::uuid",
    )
    && read(paths.catalogTables).includes(
      "'product_and_account_eligibility'",
    ),
  "catalog plane is sealed to the one canonical Mesh plane and entitlement semantics",
);

const authorityTables = read(paths.authorityTables);
const authorityConstraints = read(paths.authorityConstraints);
for (const target of meshAuthorizationV2AuthorityTables) {
  const tableName = target.slice(target.indexOf(".") + 1);
  const tableBlock = extractCreateTableBlock(authorityTables, target);
  expect(
    tableBlock.includes("account_id")
      && tableBlock.includes("plane_code")
      && tableBlock.includes("'mesh'"),
    `${target} carries explicit account and Mesh-plane identity`,
  );
  expect(
    authorityConstraints.includes(`'${tableName}'`),
    `${target} is in the exact composite-constraint manifest`,
  );
}
expect(
  (authorityConstraints.match(/FOREIGN KEY \(account_id, plane_code/gi)?.length
    ?? 0) >= 25
    && authorityConstraints.includes(
      "mesh_auth_record_acl_permission_shareable_fk",
    )
    && authorityConstraints.includes(
      "REFERENCES mesh_control.auth_permission (id, is_shareable)",
    )
    && authorityConstraints.includes(
      "mesh_auth_delegation_permission_delegable_fk",
    )
    && authorityConstraints.includes(
      "REFERENCES mesh_control.auth_permission (id, is_delegable)",
    ),
  "cross-account/plane writes and non-shareable/non-delegable grants fail structurally",
);
expect(
  authorityTables.includes("auth_deny_rule_hard_policy")
    && authorityTables.includes("auth_group_v2")
    && authorityTables.includes("auth_record_acl")
    && authorityTables.includes("auth_delegation_permission_scope")
    && authorityTables.includes("account_entitlement_override"),
  "authority covers hard deny, v2 groups, ACL, normalized delegation, and entitlement",
);
expect(
  read(paths.authorityFunctions).includes("publish_auth_permission_set")
    && read(paths.authorityFunctions).includes(
      "publish_auth_role_compilation",
    )
    && read(paths.authorityFunctions).includes(
      "trg_auth_v2_retention_guard",
    )
    && read("ddl/mesh/06_authorization_v2_authority_triggers.sql").includes(
      "ENABLE ALWAYS TRIGGER",
    ),
  "permission-set/role publication and lifecycle/retention guards are installed",
);

// ---------------------------------------------------------------------------
// Capture binding, replay, outbox, evidence, and conservation.
// ---------------------------------------------------------------------------
const frozenSources = new Set([...read(paths.migrationTables).matchAll(
  /'mesh\.([a-z][a-z0-9_]*)'/g,
)].map((match) => `mesh.${match[1]}`));
expect(
  [...meshAuthorizationV2Wave0Sources].every(
    (source) => frozenSources.has(source),
  )
    && meshAuthorizationV2Wave0Sources.length === 8
    && (wave0Registry.match(
      /\(\s*'mesh',\s*'(?:principal|principal_identity_binding|network_account|account_grant|network_relationship|attachment_acl|content_item_access_grant|conversation_participant)'/g,
    )?.length ?? 0) === 8,
  "migration freeze and Wave 0 registry agree on exactly eight Mesh sources",
);
expect(
  read(paths.migrationTables).includes(
    "source_count\n                = target_count + quarantined_count + rejected_count",
  )
    && read(paths.migrationTables).includes("source_sha256")
    && read(paths.migrationTables).includes("target_sha256")
    && !/INSERT\s+INTO\s+mesh_control\.authorization_v2_transformer_registry/i
      .test(executableDdl),
  "conservation is count/hash based and expansion seeds no transformer authority",
);

const runtimeTables = read(paths.runtimeTables);
const invalidationFunctions = read(paths.invalidationFunctions);
const replayFunctions = read(paths.replayFunctions);
const evidenceFunctions = read(paths.evidenceFunctions);
expect(
  runtimeTables.includes("authorization_global_epoch_v2")
    && runtimeTables.includes("authorization_account_epoch_v2")
    && runtimeTables.includes("authorization_plane_epoch_v2")
    && runtimeTables.includes("authorization_invalidation_outbox_v2")
    && runtimeTables.includes("UNIQUE (idempotency_key)")
    && runtimeTables.includes("cause_source_watermark > 0"),
  "global/account/plane epochs and post-W0 causal idempotent outbox are explicit",
);
expect(
  invalidationFunctions.includes("'effective_start'")
    && invalidationFunctions.includes("'effective_end'")
    && invalidationFunctions.includes("ON CONFLICT (idempotency_key) DO NOTHING")
    && invalidationFunctions.includes("locked_until")
    && invalidationFunctions.includes(
      "trg_authorization_invalidation_immutable_v2",
    ),
  "invalidation covers effective boundaries, idempotency, leases, and immutability",
);

const runtimeTriggerTargets = new Set([...read(paths.runtimeTriggers).matchAll(
  /\('(mesh_control|mesh)',\s*'([a-z][a-z0-9_]*)',\s*'(?:global|auto|plane)'\)/g,
)].map((match) => `${match[1]}.${match[2]}`));
expect(
  setEquals(
    runtimeTriggerTargets,
    new Set(meshAuthorizationV2InvalidationTargets),
  )
    && read(paths.runtimeTriggers).includes(
      "trg_authorization_v2_invalidate",
    )
    && read(paths.runtimeTriggers).includes("ENABLE ALWAYS TRIGGER")
    && read(paths.runtimeTriggers).includes(
      "expected 40 ENABLE ALWAYS",
    ),
  "canonical invalidation installer enforces exact 40-target set equality",
);

expect(
  replayFunctions.includes(
    "Durable snapshot marker bisects a captured Mesh transaction",
  )
    && replayFunctions.includes(
      "v_source_tx.first_watermark <> v_cursor + 1",
    )
    && replayFunctions.includes(
      "v_event_count <> v_source_tx.event_count",
    )
    && replayFunctions.includes(
      "v_inserted_count <> v_source_tx.event_count",
    )
    && replayFunctions.includes(
      "Unknown or unapproved Mesh transformer",
    )
    && replayFunctions.includes(
      "replay_tx.first_watermark =\n           v_checkpoint.last_applied_watermark + 1",
    ),
  "replay stages/applies only complete, contiguous, approved source transactions",
);
expect(
  replayFunctions.includes(
    "v_run.capture_installed_at > v_marker.recorded_at",
  )
    && replayFunctions.includes(
      "v_run.snapshot_watermark IS DISTINCT FROM v_marker.source_watermark",
    )
    && replayFunctions.includes(
      "v_run.source_database_id IS DISTINCT FROM v_marker.source_database_id",
    )
    && !/\bsnapshot_watermark\s*>\s*0\b/i.test(replayFunctions),
  "replay binds capture-before-marker, exact source UUID/version, and W0 including zero",
);
expect(
  runtimeTables.includes("auth_decision_evidence_v2")
    && runtimeTables.includes("matched_plane_membership_ids")
    && runtimeTables.includes("matched_deny_ids")
    && runtimeTables.includes("matched_record_acl_ids")
    && runtimeTables.includes("matched_delegation_ids")
    && evidenceFunctions.includes(
      "trg_auth_decision_evidence_v2_prepare",
    )
    && evidenceFunctions.includes(
      "authorization decision evidence is append-only",
    ),
  "decision evidence is complete, server-hashed, partitioned, and append-only",
);

// ---------------------------------------------------------------------------
// Exact functions/views/RLS.
// ---------------------------------------------------------------------------
const declaredFunctionNames = new Set([...combinedDdl.matchAll(
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:mesh_control|mesh|mesh_log)\s*\.\s*([a-z][a-z0-9_]*)\s*\(/gi,
)].map((match) => match[1]!.toLowerCase()));
expect(
  setEquals(
    declaredFunctionNames,
    new Set(meshAuthorizationV2FunctionNames),
  ),
  "function rollback manifest equals every declared Wave 1 function",
);
const declaredViews = new Set([...combinedDdl.matchAll(
  /CREATE\s+OR\s+REPLACE\s+VIEW\s+((?:mesh_control|mesh|mesh_log)\.[a-z][a-z0-9_]*)/gi,
)].map((match) => match[1]!.toLowerCase()));
expect(
  setEquals(declaredViews, new Set(meshAuthorizationV2AllViews))
    && [...sourceByPath.entries()]
      .filter(([path]) => path.includes("/07_"))
      .every(([, source]) => source.includes("security_invoker = true")),
  "view manifest is exact and every operational view is security-invoker",
);

const rlsAssignments = [
  [meshAuthorizationV2CatalogTables, read(paths.catalogRls)],
  [meshAuthorizationV2MigrationTables, read(paths.migrationRls)],
  [meshAuthorizationV2AuthorityTables, read(paths.authorityRls)],
  [meshAuthorizationV2RuntimeTables, read(paths.runtimeRls)],
] as const;
for (const [targets, source] of rlsAssignments) {
  expect(
    targets.every((target) => (
      source.includes(`'${target}'`)
      || source.includes(`'${target.split(".")[1]}'`)
    ))
      && source.includes("ENABLE ROW LEVEL SECURITY")
      && source.includes("FORCE ROW LEVEL SECURITY")
      && source.includes("REVOKE ALL")
      && !/\bGRANT\b[^;]*\bathyperapp\b/i.test(source),
    `${targets[0]!.split(".")[0]} RLS is exact, forced, and admin-only`,
  );
}

// ---------------------------------------------------------------------------
// Operator tooling: strict URL boundary, identity, hash, lock, rollback.
// ---------------------------------------------------------------------------
const operatorScripts = [
  ["installer", installer],
  ["rollback", rollback],
  ["replay manager", replayManager],
] as const;
const expectedEnvNames = new Set([
  "MESH_AUTHORIZATION_V2_DATABASE_URL",
  "MESH_DATABASE_ADMIN_URL",
]);
for (const [label, source] of operatorScripts) {
  const envNames = new Set([...source.matchAll(
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
  )].map((match) => match[1]!));
  expect(
    setEquals(envNames, expectedEnvNames)
      && source.includes("expected-database")
      && source.includes("forbidden_schemas")
      && source.includes("unexpected")
      && source.includes("pg_advisory_xact_lock"),
    `${label} accepts only explicit Mesh URLs and checks identity/boundary/lock`,
  );
}
expect(
  installer.includes("apply: false")
    && installer.includes("orderedDdlSha256")
    && installer.includes("authorization_v2_expand_installation")
    && installer.includes("assertInvalidationManifest")
    && installer.includes("assertRlsManifest")
    && installer.includes("unvalidated_live_count")
    && installer.includes("captureBefore")
    && installer.includes("captureAfter"),
  "installer is dry-run-default, hashed, receipt-based, and reconciles all live manifests",
);
expect(
  !/INSERT\s+INTO\s+mesh_log\.authorization_snapshot_marker/i.test(installer)
    && !/fn_record_authorization_snapshot_marker\s*\(/i.test(installer)
    && !/fn_authorization_bind_replay_v2\s*\(/i.test(installer)
    && !/fn_authorization_stage_replay_v2\s*\(/i.test(installer),
  "expand installer does not install marker/backfill/replay binding or staging",
);
expect(
  rollback.includes("apply: false")
    && rollback.includes(
      "PRE_BACKFILL_MESH_AUTHORIZATION_V2_EXPAND_ROLLBACK",
    )
    && rollback.includes(
      "mesh_authorization_v2_prebackfill_rollback_ticket",
    )
    && rollback.includes(
      "LOCK TABLE\n      mesh_control.authorization_capture_source",
    )
    && rollback.includes("captureAfter")
    && rollback.includes(
      "selector-to-legacy only; retain v2 shadows and evidence",
    ),
  "rollback is pre-backfill-only, confirmation/GUC guarded, and preserves Wave 0",
);
expect(
  rollback.includes("authorization_snapshot_marker")
    && rollback.includes("authorization_v2_replay_binding")
    && rollback.includes("authorization_v2_conservation_ledger")
    && rollback.includes("auth_decision_evidence_v2")
    && rollback.includes("authorization_invalidation_outbox_v2")
    && rollback.includes("assertCanonicalTargetsEmpty")
    && !/DROP\s+TABLE\s+IF\s+EXISTS\s+mesh_(?:control|log)\.authorization_(?:capture|change|snapshot|projection)/i
      .test(rollback),
  "rollback refuses every progressed state and never drops Wave 0 relations",
);
expect(
  rollback.includes("existingDecisionDependencyTargets")
    && rollback.includes(
      "trigger_record.tgname = 'trg_authorization_v2_invalidate'",
    ),
  "rollback removes only the v2 invalidation trigger from existing Mesh decision dependencies",
);
expect(
  replayManager.includes(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  )
    && replayManager.includes("marker.source_watermark")
    && replayManager.includes("BigInt(marker.source_watermark) < 0n")
    && replayManager.includes("partial_transaction_count")
    && replayManager.includes("gap_count")
    && replayManager.includes("source_identity_mismatch_count")
    && replayManager.includes("checkpointAdvanced: false"),
  "replay status/bind/stage tooling is read-safe and proves complete transaction staging",
);

const scripts = packageJson.scripts ?? {};
expect(
  scripts["db:install:mesh-authorization-v2-expand"]
    === "tsx scripts/install/install-mesh-authorization-v2-expand.ts"
    && scripts["db:rollback:mesh-authorization-v2-expand"]
      === "tsx scripts/install/rollback-mesh-authorization-v2-expand.ts"
    && scripts["db:migrate:mesh-authorization-v2-replay"]
      === "tsx scripts/migrate/manage-mesh-authorization-v2-replay.ts"
    && scripts["db:verify:mesh-authorization-v2-wave1"]
      ?.includes("verify-mesh-authorization-v2-wave1.ts") === true
    && scripts["db:verify:authorization-v2-wave1"]
      ?.includes("db:verify:mesh-authorization-v2-wave1") === true,
  "package commands expose Mesh install/rollback/replay and aggregate verification",
);
expect(
  contract.includes("Single repository contract")
    && contract.includes("meshAuthorizationV2OrderedDdl")
    && contract.includes("meshAuthorizationV2Wave0Sources")
    && contract.includes("meshAuthorizationV2InvalidationTargets"),
  "one imported contract freezes ordered DDL, source, and invalidation manifests",
);
const provisionerWave1Paths = [...provisioner.matchAll(
  /"(ddl\/(?:mesh_control|mesh|mesh_log)\/[^"]*authorization_v2[^"]+\.sql)"/g,
)].map((match) => match[1]!).filter((path) => (
  !path.includes("authorization_change_capture")
));
expect(
  setEquals(
    new Set(provisionerWave1Paths),
    new Set(meshAuthorizationV2OrderedDdl),
  )
    && provisionerWave1Paths.every((path, index) => (
      index === 0
      || Number(path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("/") + 3))
        >= Number(
          provisionerWave1Paths[index - 1]!.slice(
            provisionerWave1Paths[index - 1]!.lastIndexOf("/") + 1,
            provisionerWave1Paths[index - 1]!.lastIndexOf("/") + 3,
          ),
        )
    )),
  "fresh Mesh provisioning contains the same 25-file phase-ordered Wave 1 set",
);

if (failures > 0) {
  process.stderr.write(
    `\n${failures} Mesh Wave 1 static verification check(s) failed.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "\nMesh Wave 1 additive authorization static verification passed.\n",
  );
}

function extractCreateTableBlock(source: string, qualifiedName: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${qualifiedName} (`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const next = source.indexOf("CREATE TABLE IF NOT EXISTS ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function setEquals<T>(left: Set<T>, right: Set<T>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}
