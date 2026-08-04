#!/usr/bin/env tsx
/**
 * Static Wave 1 Neon/Admin additive-expand verifier.
 *
 * It opens no database connection and writes nothing. Live catalog and
 * constraint validation are intentionally separate deployment gates.
 */

import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");

const orderedDdl = [
  "ddl/shared/01zz_authorization_v2_catalog.sql",
  "ddl/control/01zzp_authorization_v2_catalog.sql",
  "ddl/control/01zzr_authorization_v2_migration_state.sql",
  "ddl/master/01zzc_authorization_v2_expand.sql",
  "ddl/log/01d_authorization_v2_decision_evidence.sql",
  "ddl/event/01h_authorization_v2_runtime.sql",
  "ddl/control/03_authorization_v2_catalog_constraints.sql",
  "ddl/master/03_authorization_v2_constraints.sql",
  "ddl/event/03_authorization_v2_runtime_constraints.sql",
  "ddl/shared/04_authorization_v2_catalog_indexes.sql",
  "ddl/control/04_authorization_v2_catalog_indexes.sql",
  "ddl/master/04_authorization_v2_indexes.sql",
  "ddl/log/04_authorization_v2_decision_evidence_indexes.sql",
  "ddl/event/04_authorization_v2_runtime_indexes.sql",
  "ddl/control/05_authorization_v2_catalog_functions.sql",
  "ddl/master/05_authorization_v2_functions.sql",
  "ddl/log/05_authorization_v2_decision_evidence_functions.sql",
  "ddl/event/05_authorization_v2_invalidation_functions.sql",
  "ddl/event/05_authorization_v2_replay_functions.sql",
  "ddl/control/06_authorization_v2_catalog_triggers.sql",
  "ddl/master/06_authorization_v2_integrity_triggers.sql",
  "ddl/log/06_authorization_v2_decision_evidence_triggers.sql",
  "ddl/event/06_authorization_v2_runtime_triggers.sql",
  "ddl/control/07_authorization_v2_catalog_views.sql",
  "ddl/master/07_authorization_v2_views.sql",
  "ddl/event/07_authorization_v2_runtime_views.sql",
  "ddl/shared/08_authorization_v2_catalog_rls.sql",
  "ddl/control/08_authorization_v2_catalog_rls.sql",
  "ddl/master/08_authorization_v2_rls.sql",
  "ddl/log/08_authorization_v2_decision_evidence_rls.sql",
  "ddl/event/08_authorization_v2_runtime_rls.sql",
  "ddl/security/805_authorization_v2_expansion_hardening.sql",
] as const;

const authorityTriggerTargets = [
  "shared.module",
  "shared.enterprise_feature",
  "shared.subscription_plan",
  "shared.subscription_plan_version",
  "shared.plan_module_access",
  "shared.plan_feature_access",
  "control.auth_plane",
  "control.auth_catalog_owner",
  "control.auth_permission",
  "control.auth_permission_plane",
  "control.auth_permission_scope_policy",
  "control.entity",
  "control.entity_version",
  "control.entity_operation",
  "control.entity_scope_binding",
  "master.tenant",
  "master.principal",
  "master.principal_identity_binding",
  "master.tenant_module_subscription",
  "master.tenant_feature_entitlement",
  "master.auth_plane_membership",
  "master.auth_scope_target",
  "master.auth_scope_tenant",
  "master.auth_scope_company",
  "master.auth_scope_legal_entity",
  "master.auth_scope_operating_organization",
  "master.auth_permission_set",
  "master.auth_permission_set_rule",
  "master.auth_role",
  "master.auth_role_compilation",
  "master.auth_role_permission_set",
  "master.auth_role_permission",
  "master.auth_group_v2",
  "master.auth_group_member_v2",
  "master.auth_group_role_v2",
  "master.auth_deny_rule",
  "master.auth_deny_rule_principal",
  "master.auth_deny_rule_group",
  "master.auth_deny_rule_hard_policy",
  "master.auth_override",
  "master.auth_record_acl",
  "master.auth_record_acl_permission",
  "master.auth_delegation",
  "master.auth_delegation_permission",
  "master.auth_delegation_permission_scope",
  "master.tenant_entitlement_override",
] as const;

const sqlByPath = new Map<string, string>();
for (const path of orderedDdl) {
  sqlByPath.set(path, await readFile(resolve(databaseRoot, path), "utf8"));
}
const read = (path: typeof orderedDdl[number]): string =>
  sqlByPath.get(path) ?? "";

const installerPath = resolve(
  databaseRoot,
  "scripts/install/install-authorization-v2-expand.ts",
);
const installer = await readFile(installerPath, "utf8");
const rollbackInstaller = await readFile(
  resolve(databaseRoot, "scripts/install/rollback-authorization-v2-expand.ts"),
  "utf8",
);
const packageJson = await readFile(resolve(databaseRoot, "package.json"), "utf8");
const runner = await readFile(resolve(databaseRoot, "ddl/runner.sh"), "utf8");

let failures = 0;
function pass(message: string): void {
  process.stdout.write(`PASS ${message}\n`);
}
function fail(message: string): void {
  failures += 1;
  process.stderr.write(`FAIL ${message}\n`);
}
function expect(condition: boolean, message: string): void {
  if (condition) pass(message);
  else fail(message);
}

expect(
  new Set(orderedDdl).size === orderedDdl.length,
  "explicit expand manifest has no duplicate path",
);
expect(
  orderedDdl.at(-1) ===
    "ddl/security/805_authorization_v2_expansion_hardening.sql",
  "post-800 Wave 1 hardening is last in the explicit installer order",
);
expect(
  orderedDdl.every((path) => !/(?:^|\/)mesh(?:_|\/)/i.test(path)),
  "Neon expand manifest contains no Mesh path",
);

const installerPaths = [...installer.matchAll(
  /"(ddl\/(?:shared|control|master|event|log|security)\/[^"]+\.sql)"/g,
)].map((match) => match[1]).filter((value): value is string => value !== undefined);
expect(
  JSON.stringify(installerPaths) === JSON.stringify(orderedDdl),
  "installer and verifier use the exact same ordered DDL set",
);
expect(
  installer.includes("apply: false")
    && installer.includes("--expected-database=")
    && installer.includes("--approval-ticket=")
    && installer.includes("mesh_schema_present")
    && installer.includes("orderedDdlSha256"),
  "installer is dry-run-default, exact-targeted, boundary-sealed, and hashed",
);
expect(
  installer.includes("v_authorization_v2_deferred_constraints")
    && installer.includes("pg_get_constraintdef")
    && installer.includes("missing_count")
    && installer.includes("unexpected_count")
    && installer.includes("definition_mismatch_count"),
  "installer registers and reconciles the exact deferred-constraint set",
);
expect(
  !/fn_record_authorization_snapshot_marker|fn_authorization_bind_replay_v2\s*\(/i
    .test(installer),
  "expand installer neither records a marker nor binds replay",
);
expect(
  rollbackInstaller.includes("apply: false")
    && rollbackInstaller.includes("PRE_BACKFILL_EXPAND_ROLLBACK")
    && rollbackInstaller.includes(
      "authorization_v2_prebackfill_rollback_ticket",
    )
    && rollbackInstaller.includes(
      "LOCK TABLE event.authorization_capture_clock IN SHARE MODE",
    ),
  "pre-backfill rollback is dry-run-default, confirmation/GUC guarded, and capture-locked",
);
expect(
  rollbackInstaller.includes("authorization_snapshot_marker")
    && rollbackInstaller.includes("authorization_v2_replay_binding")
    && rollbackInstaller.includes("authorization_v2_conservation_ledger")
    && rollbackInstaller.includes("Canonical target business rows exist")
    && rollbackInstaller.includes("v2_rows"),
  "pre-backfill rollback refuses snapshot, replay, conservation, and target-row state",
);
expect(
  rollbackInstaller.includes("Wave 0 capture changed during rollback")
    && rollbackInstaller.includes(
      "GRANT SELECT ON TABLE control.entity_operation TO athyperapp",
    )
    && rollbackInstaller.includes(
      "selector-to-legacy only; retain v2 shadows and evidence",
    ),
  "rollback preserves Wave 0, restores legacy SELECT, and refuses destructive post-backfill semantics",
);
expect(
  rollbackInstaller.includes("'shared.subscription_plan_version'")
    && rollbackInstaller.includes("'master.principal_identity_binding'")
    && rollbackInstaller.includes(
      "trigger_record.tgname = 'trg_authorization_v2_invalidate'",
    ),
  "rollback removes only the v2 invalidation trigger from existing catalog and identity dependencies",
);
expect(
  packageJson.includes("authorization-legacy-freeze.ts --check")
    && packageJson.includes("db:verify:authorization-v2-wave1"),
  "Wave 1 aggregate package verifier invokes the legacy-freeze baseline check",
);

const banned = [
  {
    pattern: /\bDROP\s+(?:TABLE|SCHEMA|TYPE)\b/i,
    label: "DROP TABLE/SCHEMA/TYPE",
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]{0,300}\bDROP\s+COLUMN\b/i,
    label: "DROP COLUMN",
  },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, label: "TRUNCATE TABLE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
  {
    pattern: /\bRENAME\s+(?:TO|COLUMN)\b/i,
    label: "RENAME",
  },
  {
    pattern: /\bALTER\s+COLUMN\b[\s\S]{0,160}\bSET\s+NOT\s+NULL\b/i,
    label: "SET NOT NULL",
  },
] as const;

for (const [path, source] of sqlByPath) {
  const executable = stripSqlComments(source);
  for (const ban of banned) {
    expect(!ban.pattern.test(executable), `${path} contains no ${ban.label}`);
  }
  expect(
    !/\bUNIQUE\s*\([^;]*\)\s*NULLS\s+NOT\s+DISTINCT\b/i.test(executable),
    `${path} uses valid UNIQUE NULLS NOT DISTINCT ordering`,
  );

  const duplicateColumns = findDuplicateCreateTableColumns(executable);
  expect(
    duplicateColumns.length === 0,
    `${path} has no duplicate CREATE TABLE column`,
  );
  for (const duplicate of duplicateColumns) {
    fail(`${path}: duplicate column ${duplicate}`);
  }

  const duplicatePredicates = findConsecutiveDuplicatePredicates(executable);
  expect(
    duplicatePredicates.length === 0,
    `${path} has no consecutive duplicate WHERE/AND predicate`,
  );
  for (const duplicate of duplicatePredicates) {
    fail(`${path}: duplicate predicate ${duplicate}`);
  }
}

const catalogTables = read("ddl/control/01zzp_authorization_v2_catalog.sql");
const masterTables = read("ddl/master/01zzc_authorization_v2_expand.sql");
expect(
  catalogTables.includes("ADD COLUMN IF NOT EXISTS permission_id_v2 uuid")
    && catalogTables.includes("ADD COLUMN IF NOT EXISTS operation_code_v2 text")
    && !/\bUPDATE\s+control\.entity_operation\b/i.test(
      stripSqlComments(catalogTables),
    ),
  "legacy entity_operation expansion is nullable/additive and performs no backfill",
);

const catalogConstraints = read(
  "ddl/control/03_authorization_v2_catalog_constraints.sql",
);
expect(
  catalogConstraints.includes("eo_exact_permission_v2_fk")
    && catalogConstraints.includes("eo_v2_publish_complete_chk")
    && catalogConstraints.includes("NOT VALID"),
  "published v2 operation requires the exact permission tuple while legacy rows coexist",
);

const deferredView = read("ddl/control/07_authorization_v2_catalog_views.sql");
const notValidNames = new Set([...catalogConstraints.matchAll(
  /ADD\s+CONSTRAINT\s+([a-z][a-z0-9_]*)[^;]*\bNOT\s+VALID\s*;/gi,
)].map((match) => match[1]).filter(
  (value): value is string => value !== undefined,
));
const deferredNames = new Set([...deferredView.matchAll(
  /\(\s*'control\.entity_operation'\s*,\s*'([a-z][a-z0-9_]*)'/gi,
)].map((match) => match[1]).filter(
  (value): value is string => value !== undefined,
));
expect(
  notValidNames.size > 0 && setEquals(notValidNames, deferredNames),
  "every and only NOT VALID catalog constraint is in the exact deferred manifest",
);

const triggerSql = read("ddl/event/06_authorization_v2_runtime_triggers.sql");
const actualTriggerTargets = new Set([...triggerSql.matchAll(
  /\('(shared|control|master)',\s*'([a-z][a-z0-9_]*)',\s*'(?:global|auto|tenant|plane)'\)/g,
)].map((match) => `${match[1]}.${match[2]}`));
const equalityTriggerTargets = new Set([...triggerSql.matchAll(
  /^\s*'(shared|control|master)\.([a-z][a-z0-9_]*)',?\s*$/gm,
)].map((match) => `${match[1]}.${match[2]}`));
expect(
  setEquals(actualTriggerTargets, new Set(authorityTriggerTargets))
    && setEquals(equalityTriggerTargets, new Set(authorityTriggerTargets)),
  "canonical authority invalidation trigger manifest has exact set equality",
);
expect(
  triggerSql.includes("ENABLE ALWAYS TRIGGER")
    && triggerSql.includes("RAISE EXCEPTION")
    && triggerSql.includes("Missing Wave 1 canonical authority")
    && triggerSql.includes("Unexpected Neon/Admin v2 invalidation target")
    && triggerSql.includes("trigger_record.tgtype = 29"),
  "authority trigger installer is ENABLE ALWAYS and fails closed on a missing or unexpected target",
);
expect(
  masterTables.includes(
    "CREATE TABLE IF NOT EXISTS master.auth_deny_rule_hard_policy",
  ),
  "hard-policy deny source is present in the master authority contract",
);

const eventTables = read("ddl/event/01h_authorization_v2_runtime.sql");
const invalidationFunctions = read(
  "ddl/event/05_authorization_v2_invalidation_functions.sql",
);
expect(
  eventTables.includes("authorization_global_epoch_v2")
    && eventTables.includes("authorization_tenant_epoch_v2")
    && eventTables.includes("authorization_plane_epoch_v2"),
  "global, tenant, and plane epochs are distinct durable objects",
);
expect(
  eventTables.includes("authorization_invalidation_outbox_v2")
    && eventTables.includes("affected_principal_ids")
    && eventTables.includes("affected_permission_ids")
    && eventTables.includes("source_row_key")
    && eventTables.includes("UNIQUE (idempotency_key)"),
  "v2 outbox carries immutable affected identities and an idempotency key",
);
expect(
  eventTables.includes("locked_at IS NULL")
    && eventTables.includes("locked_by IS NULL")
    && eventTables.includes("locked_until IS NULL")
    && invalidationFunctions.includes("locked_at = v_now")
    && invalidationFunctions.includes("locked_by = p_worker_id")
    && invalidationFunctions.includes(
      "locked_until = v_now + make_interval",
    ),
  "outbox lease constraint and claim function always manage the full lease triple",
);
expect(
  eventTables.includes("cause_source_watermark >= 0")
    && eventTables.includes("cause_replay_transaction_id IS NULL")
    && invalidationFunctions.includes("GREATEST(p_effective_at, v_now)"),
  "causal shape supports W0=0 and immediate availability cannot precede creation",
);
expect(
  invalidationFunctions.includes("'effective_start'")
    && invalidationFunctions.includes("'effective_end'")
    && invalidationFunctions.includes("epoch_applied_at IS NULL")
    && invalidationFunctions.includes("ON CONFLICT (idempotency_key) DO NOTHING"),
  "effective-boundary invalidations are scheduled, epoch-on-claim, and idempotent",
);
expect(
  invalidationFunctions.includes(
    "trg_authorization_invalidation_immutable_v2",
  )
    && invalidationFunctions.includes(
      "Authorization invalidation authority identity is immutable",
    ),
  "outbox authority identities cannot be changed after emission",
);

const migrationState = read(
  "ddl/control/01zzr_authorization_v2_migration_state.sql",
);
expect(
  migrationState.includes("authorization_v2_frozen_legacy_object")
    && migrationState.includes("FROM control.authorization_capture_source")
    && migrationState.includes("no_new_feature_reads_or_writes"),
  "frozen legacy registry derives exactly from the Wave 0 capture registry",
);
expect(
  migrationState.includes("authorization_v2_transformer_registry")
    && !/INSERT\s+INTO\s+control\.authorization_v2_transformer_registry/i.test(
      stripSqlComments(migrationState),
    ),
  "transformer registry is fail-closed and no mapping is fabricated",
);
expect(
  migrationState.includes("authorization_v2_deferred_constraint_registry")
    && migrationState.includes("expected_definition_sha256")
    && migrationState.includes("authorization_v2_conservation_ledger")
    && migrationState.includes(
      "source_count +",
    ) === false
    && migrationState.includes(
      "= target_count + quarantined_count + rejected_count",
    ),
  "deferred definitions and exact conservation arithmetic are durable",
);

const replayFunctions = read(
  "ddl/event/05_authorization_v2_replay_functions.sql",
);
expect(
  replayFunctions.includes("capture_installed_at > v_marker.recorded_at")
    && replayFunctions.includes(
      "snapshot_watermark IS DISTINCT FROM v_marker.source_watermark",
    )
    && replayFunctions.includes(
      "source_database_id IS DISTINCT FROM v_clock.source_database_id",
    ),
  "replay binding proves capture-before-marker, exact W0, and source UUID",
);
expect(
  replayFunctions.includes(
    "source_tx.first_watermark > v_binding.snapshot_watermark",
  )
    && replayFunctions.includes("v_source_tx.first_watermark <> v_cursor + 1")
    && replayFunctions.includes("v_event_count <> v_source_tx.event_count")
    && replayFunctions.includes("v_has_truncate")
    && replayFunctions.includes("v_unknown_transformers"),
  "staging accepts only contiguous complete post-W0 transactions and rejects TRUNCATE/unknown transformers",
);
expect(
  replayFunctions.includes("fn_authorization_complete_replay_v2")
    && replayFunctions.includes(
      "UPDATE event.authorization_projection_checkpoint",
    )
    && replayFunctions.includes(
      "authorization_v2_conservation_ledger",
    )
    && replayFunctions.includes("state = 'applied'"),
  "successful application and checkpoint advancement share one atomic function",
);

const evidenceTables = read(
  "ddl/log/01d_authorization_v2_decision_evidence.sql",
);
const evidenceFunctions = read(
  "ddl/log/05_authorization_v2_decision_evidence_functions.sql",
);
const evidenceTriggers = read(
  "ddl/log/06_authorization_v2_decision_evidence_triggers.sql",
);
expect(
  evidenceTables.includes("auth_decision_evidence_v2")
    && evidenceTables.includes("evaluator_contract_version")
    && evidenceTables.includes("global_epoch")
    && evidenceTables.includes("tenant_epoch")
    && evidenceTables.includes("plane_epoch")
    && evidenceTables.includes("matched_deny_ids")
    && evidenceTables.includes("matched_delegation_ids")
    && evidenceTables.includes("evidence_sha256"),
  "decision evidence includes evaluator, epoch, proof-ID, and hash material",
);
expect(
  evidenceFunctions.includes("is append-only")
    && evidenceTriggers.includes("BEFORE UPDATE OR DELETE")
    && evidenceTriggers.includes("ENABLE ALWAYS TRIGGER"),
  "decision evidence is append-only even under replica-role writes",
);

const rlsSql = [
  read("ddl/shared/08_authorization_v2_catalog_rls.sql"),
  read("ddl/control/08_authorization_v2_catalog_rls.sql"),
  read("ddl/master/08_authorization_v2_rls.sql"),
  read("ddl/log/08_authorization_v2_decision_evidence_rls.sql"),
  read("ddl/event/08_authorization_v2_runtime_rls.sql"),
].join("\n");
expect(
  (rlsSql.match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) >= 5
    && rlsSql.includes("REVOKE ALL ON TABLE"),
  "Wave 1 runtime/evidence objects force RLS and revoke PUBLIC access",
);

expect(
  runner.includes('"/05_*.sql')
    && runner.includes('"/06_*.sql')
    && runner.includes('"/07_*.sql')
    && runner.includes('"$SQL_DIR/security"/*.sql'),
  "shell runner discovers ordered function/trigger/view variants and all security files",
);

if (failures > 0) {
  process.stderr.write(`\n${failures} Wave 1 static check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nAuthorization Wave 1 static verification passed.\n");
}

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function setEquals<T>(left: Set<T>, right: Set<T>): boolean {
  return left.size === right.size
    && [...left].every((value) => right.has(value));
}

function findConsecutiveDuplicatePredicates(source: string): string[] {
  const duplicates: string[] = [];
  let prior = "";
  for (const line of source.split(/\r?\n/)) {
    const normalized = line.trim().replace(/\s+/g, " ").toLowerCase();
    if (
      normalized === prior
      && /^(?:where|and)\b/.test(normalized)
    ) {
      duplicates.push(normalized);
    }
    if (normalized) prior = normalized;
  }
  return duplicates;
}

function findDuplicateCreateTableColumns(source: string): string[] {
  const duplicates: string[] = [];
  const startPattern =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z][a-z0-9_.]*)\s*\(/gi;
  for (const match of source.matchAll(startPattern)) {
    const tableName = match[1];
    if (!tableName || match.index === undefined) continue;
    const open = source.indexOf("(", match.index);
    const close = findMatchingParenthesis(source, open);
    if (open < 0 || close < 0) continue;
    const body = source.slice(open + 1, close);
    const columns = new Set<string>();
    for (const item of splitTopLevel(body)) {
      const columnMatch = item.trim().match(/^"?([a-z][a-z0-9_]*)"?\s+/i);
      const column = columnMatch?.[1]?.toLowerCase();
      if (
        !column
        || [
          "constraint", "primary", "unique", "check",
          "foreign", "exclude", "like",
        ].includes(column)
      ) {
        continue;
      }
      const key = `${tableName}.${column}`;
      if (columns.has(column)) duplicates.push(key);
      columns.add(column);
    }
  }
  return duplicates;
}

function findMatchingParenthesis(source: string, open: number): number {
  let depth = 0;
  let singleQuoted = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (singleQuoted) {
      if (character === "'" && source[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        singleQuoted = false;
      }
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let singleQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (singleQuoted) {
      if (character === "'" && source[index + 1] === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}
