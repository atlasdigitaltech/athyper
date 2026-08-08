#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateWave9Certification,
  type Wave9CertificationEvidence,
  type Wave9CertificationManifest,
} from "../contraction/certification.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const args = process.argv.slice(2);
const manifestPath = option("--manifest");
const evidencePath = option("--evidence");
if (Boolean(manifestPath) !== Boolean(evidencePath)) {
  throw new Error("--manifest and --evidence must be supplied together");
}

const files = {
  contract: "config/governance/authorization-wave9-contraction-contract.v1.json",
  localDecision:
    "config/governance/authorization-wave9-development-clean-reset-decision.v1.json",
  removal:
    "config/governance/authorization-wave9-legacy-removal-manifest.v1.json",
  evaluator: "server/db/scripts/contraction/certification.ts",
  test: "server/db/scripts/__tests__/certification-contraction.test.ts",
  report:
    "server/db/scripts/reports/report-authorization-repository-readiness.ts",
  preflight:
    "server/db/scripts/reports/capture-contraction-preflight.ts",
  executor:
    "server/db/scripts/migrate/apply-authorization-v2-tombstone.ts",
  neonSql:
    "server/db/migrations/contraction/neon/001_authorization_v2_tombstone.sql",
  meshSql:
    "server/db/migrations/contraction/mesh/001_authorization_v2_tombstone.sql",
  sentinel:
    "server/db/scripts/rehearsal/install-clean-build-sentinel.ts",
  cleanCapture:
    "server/db/scripts/reports/capture-clean-baseline.ts",
  resetGuard: "server/db/scripts/safe-provision.ts",
  markDisposable: "server/db/scripts/mark-disposable-database.ts",
  neonResetWrapper:
    "stack/scripts/db/transaction/neon/seed-db-dev-reset.bat",
  meshResetWrapper:
    "stack/scripts/db/transaction/mesh/seed-db-dev-reset.bat",
  runbook:
    "docs/runbooks/authorization-v2-wave9-contraction-clean-baseline.md",
  localRunbook:
    "docs/runbooks/authorization-v2-wave9-development-clean-reset.md",
  wave8: "config/governance/authorization-wave8-rehearsal-contract.v1.json",
} as const;
const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) =>
    [key, await readFile(resolve(repositoryRoot, path), "utf8")] as const
  ),
)) as Record<keyof typeof files, string>;
const failures: string[] = [];

requireTokens("Wave 9 contract", source.contract, [
  '"blocked_pending_wave8_certification"',
  '"development_clean_reset"',
  '"approvalLabel": "LOCAL-AUTH-V2-RESET"',
  '"productionCertificationClaimed": false',
  '"cascadeDropsAllowed": false',
  '"buildFromZeroDeletionAllowedBeforeTombstoneReceipt": false',
  '"authorized": false',
]);
requireTokens("local clean-reset decision", source.localDecision, [
  '"productionTraffic": false',
  '"businessDataMigrationRequired": false',
  '"rollbackRetentionRequired": false',
  '"databaseDataMayBeDestroyed": true',
  '"keycloakUsersMustBePreserved": true',
  '"deterministic_canonical_seed_packs"',
  '"productionCertificationClaimed": false',
]);
requireTokens("removal manifest", source.removal, [
  '"master.principal_persona"',
  '"shared.persona_permission"',
  '"shared.persona"',
  '"master.access_grant"',
  '"master.delegation_grant"',
  '"master.business_network"',
  '"control.auth_permission_alias_v2"',
  '"mesh_control.auth_permission_alias_v2"',
]);
for (const [label, sql] of [
  ["Neon tombstone", source.neonSql],
  ["Mesh tombstone", source.meshSql],
] as const) {
  requireTokens(label, sql, [
    "authorization_contraction_receipt_v2",
    "RESTRICT",
    "conflicting Wave 9",
  ]);
  if (/\bCASCADE\b/i.test(sql)) failures.push(`${label} contains CASCADE`);
}
requireTokens("guarded executor", source.executor, [
  "checked_in_contract_not_authorized",
  "DROP_LEGACY_AUTHORIZATION_",
  "pg_advisory_xact_lock",
  "exact database identity or plane boundary mismatch",
  "remainingLegacyObjects: 0",
]);
requireTokens("live preflight", source.preflight, [
  "pg_describe_object",
  "externalDependencyFindings",
  "activeApprovedLegacyWriters",
  "observation_complete",
  "reverse_projector_status",
]);
requireTokens("clean-build sentinel", source.sentinel, [
  "pg_event_trigger_ddl_commands",
  "create_observation",
  "INSTALL_WAVE9_SENTINEL_",
]);
requireTokens("clean-baseline capture", source.cleanCapture, [
  "legacyObjectsCreated",
  "legacyObjectsRemaining",
  "tombstoneMigrationExecuted",
  "unexpectedUnvalidatedConstraints",
]);
requireTokens("local reset guard", source.resetGuard, [
  '"development_clean_reset"',
  '"LOCAL-AUTH-V2-RESET"',
  'row.environment_class !== "disposable_local"',
  "opposite_schema_count",
  "schema_fingerprint_sha256",
]);
requireTokens("disposable marker", source.markDisposable, [
  "--execution-profile=development_clean_reset",
  "--approval-label=LOCAL-AUTH-V2-RESET",
  "--environment=disposable_local",
  "opposite-plane schema detected",
]);
for (const [label, wrapper] of [
  ["Neon reset wrapper", source.neonResetWrapper],
  ["Mesh reset wrapper", source.meshResetWrapper],
] as const) {
  requireTokens(label, wrapper, [
    "ATHYPER_DISPOSABLE_ENVIRONMENT",
    "--execution-profile=development_clean_reset",
    "--approval-label=LOCAL-AUTH-V2-RESET",
    "--expected-database=",
    "--acknowledge-destructive-reset=",
  ]);
}
requireTokens("certification evaluator", source.evaluator, [
  "wave8_certification_missing_or_mismatched",
  "repository_contraction_incomplete",
  "mesh_authority_remains_in_neon",
  "clean_baseline_not_certified",
  "canonical_rollback_not_certified",
]);
requireTokens("runbook", source.runbook, [
  "Do not contract before Wave 8",
  "Tombstone deployed databases",
  "Delete build-from-zero legacy definitions",
  "Final clean baseline",
]);
requireTokens("local clean-reset runbook", source.localRunbook, [
  "development_clean_reset",
  "LOCAL-AUTH-V2-RESET",
  "MARK_DISPOSABLE_NEON",
  "MARK_DISPOSABLE_MESH",
  "Do not run the IAM reset",
  "does not complete production",
]);

let certification:
  | ReturnType<typeof evaluateWave9Certification>
  | undefined;
if (manifestPath && evidencePath) {
  const manifest = JSON.parse(
    await readFile(resolve(manifestPath), "utf8"),
  ) as Wave9CertificationManifest;
  const evidence = JSON.parse(
    await readFile(resolve(evidencePath), "utf8"),
  ) as Wave9CertificationEvidence;
  certification = evaluateWave9Certification(manifest, evidence);
  const contract = JSON.parse(source.contract) as {
    status?: string;
    liveExecution?: { authorized?: boolean };
  };
  const wave8 = JSON.parse(source.wave8) as { status?: string };
  if (contract.status !== "approved" || !contract.liveExecution?.authorized) {
    certification = addBlocker(certification, "wave9_contract_not_approved");
  }
  if (wave8.status !== "approved") {
    certification = addBlocker(
      certification,
      "checked_in_wave8_contract_not_approved",
    );
  }
  if (!certification.passed) failures.push(...certification.blockers);
}

if (failures.length > 0) {
  throw new Error(`Wave 9 verification failed:\n- ${[...new Set(failures)].join("\n- ")}`);
}

const contract = JSON.parse(source.contract) as {
  status: string;
  liveExecution: { authorized: boolean; reason: string };
  executionProfiles?: {
    development_clean_reset?: { authorized?: boolean };
  };
};
process.stdout.write(`${JSON.stringify({
  contractVersion: "wave9.contraction-clean-baseline.v1",
  staticGates: "passed",
  contractStatus: contract.status,
  contractionAuthorized: contract.liveExecution.authorized,
  developmentCleanResetAuthorized:
    contract.executionProfiles?.development_clean_reset?.authorized === true,
  productionCertificationClaimed: false,
  certification: certification ?? "operational_evidence_pending",
  tombstoneExecuted: false,
  repositoryLegacyFilesDeleted: false,
  liveMutationPerformed: false,
}, null, 2)}\n`);

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function requireTokens(label: string, content: string, tokens: string[]): void {
  for (const token of tokens) {
    if (!content.includes(token)) failures.push(`${label} missing ${token}`);
  }
}

function addBlocker(
  result: ReturnType<typeof evaluateWave9Certification>,
  blocker: string,
): ReturnType<typeof evaluateWave9Certification> {
  const blockers = [...new Set([...result.blockers, blocker])].sort();
  return { ...result, passed: false, blockers };
}
