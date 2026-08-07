#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const failures: string[] = [];

const paths = {
  contract: "config/governance/authorization-wave7-shadow-cutover-contract.v1.json",
  shadow:
    "server/packages/services/iam/authorization-rollout/authorization-shadow-comparison.ts",
  gates:
    "server/packages/services/iam/authorization-rollout/authorization-cutover-gates.ts",
  neonState: "server/db/ddl/common/ops/03_tables.sql",
  neonEvidence: "server/db/ddl/common/ops/03_tables.sql",
  neonConstraints:
    "server/db/ddl/common/ops/05_constraints.sql",
  neonView: "server/db/ddl/common/ops/09_views.sql",
  neonFunctions:
    "server/db/ddl/common/ops/07_functions.sql",
  meshState:
    "server/db/ddl/common/ops/03_tables.sql",
  meshEvidence:
    "server/db/ddl/common/ops/03_tables.sql",
  meshConstraints:
    "server/db/ddl/common/ops/05_constraints.sql",
  meshView:
    "server/db/ddl/common/ops/09_views.sql",
  meshFunctions:
    "server/db/ddl/common/ops/07_functions.sql",
  meshProvision: "server/db/scripts/provision-mesh.ts",
} as const;

const sources = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) =>
    [key, await readFile(resolve(repositoryRoot, path), "utf8")] as const
  )),
) as Record<keyof typeof paths, string>;
const contract = JSON.parse(sources.contract) as Record<string, unknown>;
if (contract.contractId !== "authorization-v2-wave7-shadow-cutover") {
  failures.push("Wave 7 operator contract id is invalid");
}

requireTokens("shadow comparison", sources.shadow, [
  "evaluateLegacy",
  "evaluateV2",
  "evaluateApprovedTargetTruth",
  "deepFreezeShadowInput",
  'authoritative: "legacy"',
  "MANDATORY_COMPARISON_ACTIONS",
  "normalizeDecision",
  "classifyMismatch",
  '"company_scope"',
  '"acl_protected_read"',
]);
for (const mismatch of [
  "capability", "scope", "precedence", "plane", "entitlement",
  "operation_mapping", "delegation", "acl", "data_defect",
]) {
  requireTokens("mismatch taxonomy", sources.shadow, [`"${mismatch}"`]);
}
requireTokens("runtime gates", sources.gates, [
  "partial_source_transaction",
  "conservation_reconciliation_incomplete",
  "legacy_writer_not_sole",
  "writer_switch_requires_zero_lag",
  "rollback_projection_not_tested",
  "observation_window_incomplete",
]);
for (const [name, source] of Object.entries({
  neonState: sources.neonState,
  meshState: sources.meshState,
})) {
  requireTokens(name, source, [
    "DEFAULT 'legacy'",
    "writer_authority",
    "legacy_write_frozen_at",
    "authorization_cutover_cohort_v2",
    "authorization_shadow_mismatch_disposition_v2",
    "authorization_writer_switch_receipt_v2",
    "authorization_target_guard_installation_v2",
  ]);
}
for (const [name, source] of Object.entries({
  neonConstraints: sources.neonConstraints,
  meshConstraints: sources.meshConstraints,
})) {
  requireTokens(name, source, [
    "UNIQUE (id, plane_code)",
    "FOREIGN KEY (comparison_id, plane_code)",
    "ON DELETE RESTRICT",
  ]);
}
for (const [name, source] of Object.entries({
  neonEvidence: sources.neonEvidence,
  meshEvidence: sources.meshEvidence,
})) {
  requireTokens(name, source, [
    "authorization_shadow_comparison_v2",
    "immutable_context_sha256",
    "source_watermark",
    "complete_transaction_projection",
    "legacy_permission_sha256",
    "v2_permission_sha256",
    "target_permission_sha256",
    "authorization_cutover_load_evidence_v2",
    "catalog_version",
    "policy_revision",
    "valid_until",
  ]);
}
for (const [name, source] of Object.entries({
  neonView: sources.neonView,
  meshView: sources.meshView,
})) {
  requireTokens(name, source, [
    "partial_transaction_count",
    "unreconciled_conservation_count",
    "unexplained_high_risk_count",
    "ready_for_shadow_compare",
    "ready_for_read_enforce",
    "ready_for_writer_switch",
    "observation_window_complete",
  ]);
}
for (const [name, source] of Object.entries({
  neonFunctions: sources.neonFunctions,
  meshFunctions: sources.meshFunctions,
})) {
  requireTokens(name, source, [
    "pg_advisory_xact_lock",
    "fn_authorization_freeze_legacy_writes_v2",
    "fn_authorization_switch_writer_v2",
    "fn_authorization_install_legacy_freeze_guards_v2",
    "fn_authorization_install_target_guard_v2",
    "fn_authorization_validate_target_guard_v2",
    "ENABLE ALWAYS TRIGGER",
    "target_to_legacy_projector",
  ]);
}
requireTokens("Mesh provision", sources.meshProvision, [
  "ddl/common/ops/03_tables.sql",
  "ddl/common/ops/03_tables.sql",
  "ddl/common/ops/05_constraints.sql",
  "ddl/common/ops/07_functions.sql",
  "ddl/common/ops/08_triggers.sql",
  "ddl/common/ops/09_views.sql",
  "ddl/common/ops/10_rls.sql",
]);
const meshCombined = [
  sources.meshState,
  sources.meshEvidence,
  sources.meshView,
  sources.meshFunctions,
].join("\n");
if (/\b(?:control|event)\./.test(stripComments(meshCombined))) {
  failures.push("Mesh Wave 7 DDL reads a Neon control/event relation");
}
if (/DATABASE_URL|neon/i.test(stripComments(meshCombined))) {
  failures.push("Mesh Wave 7 DDL contains a Neon configuration dependency");
}
if (/UNION[\s\S]{0,80}(?:legacy|permission|scope)/i.test(sources.shadow)) {
  failures.push("shadow comparison contains a possible old/new union");
}

if (failures.length > 0) {
  throw new Error(`Wave 7 verification failed:\n- ${failures.join("\n- ")}`);
}
process.stdout.write(`${JSON.stringify({
  contractVersion: "wave7.shadow-evaluation-cohort-cutover.v1",
  staticGates: "passed",
  defaultResolver: "legacy",
  defaultWriter: "legacy",
  dualWriterMode: false,
  meshAuthority: "plane-local",
  liveMutationPerformed: false,
  operationalEvidence: "pending",
}, null, 2)}\n`);

function requireTokens(label: string, source: string, tokens: string[]): void {
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${label} missing ${token}`);
  }
}

function stripComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
