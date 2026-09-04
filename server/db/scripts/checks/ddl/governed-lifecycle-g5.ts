#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const failures: string[] = [];
const registry = JSON.parse(
  await readFile(
    resolve(root, "ddl/governed-lifecycle-g5-readiness.v1.json"),
    "utf8",
  ),
) as {
  scenarios: Array<{
    scenario: string;
    status: string;
    owner: string;
    evidence: string;
    exitGate: string;
  }>;
};
const expected = new Set([
  "buyer_requested_supplier",
  "supplier_self_registration",
  "internal_only_business_partner",
  "customer_onboarding",
  "internal_workforce",
  "external_worker_iam",
  "clean_and_supported_upgrade_certification",
]);
for (const row of registry.scenarios) {
  if (!expected.delete(row.scenario))
    failures.push(`unexpected or duplicate G5 scenario: ${row.scenario}`);
  for (const key of ["status", "owner", "evidence", "exitGate"] as const)
    if (!row[key].trim()) failures.push(`${row.scenario} has no ${key}`);
}
for (const scenario of expected)
  failures.push(`missing G5 scenario: ${scenario}`);

const tables = await readFile(
  resolve(root, "ddl/planes/studio/trustiam/03_tables.sql"),
  "utf8",
);
const migration = await readFile(
  resolve(
    root,
    "migrations/20260903_studio_external_worker_identity_projection.sql",
  ),
  "utf8",
);
const manifest = await readFile(
  resolve(root, "migrations/manifests/studio.txt"),
  "utf8",
);
const saga = await readFile(
  resolve(root, "../packages/platform/iam/src/identity-saga.ts"),
  "utf8",
);
const neonFunctions = await readFile(
  resolve(root, "ddl/planes/neon/document/07_functions.sql"),
  "utf8",
);
const neonTriggers = await readFile(
  resolve(root, "ddl/planes/neon/document/08_triggers.sql"),
  "utf8",
);
const neonMigration = await readFile(
  resolve(
    root,
    "migrations/20260903_neon_external_worker_iam_projection_command.sql",
  ),
  "utf8",
);
const liveProbe = await readFile(
  resolve(
    root,
    "scripts/tests/integration/external-worker-iam-projection-command.sql",
  ),
  "utf8",
);
const studioConsumer = await readFile(
  resolve(
    root,
    "../packages/platform/iam/src/external-worker-identity-intent.ts",
  ),
  "utf8",
);
const delivery = await readFile(
  resolve(
    root,
    "../packages/platform/iam/src/external-worker-identity-delivery.ts",
  ),
  "utf8",
);
const composition = await readFile(
  resolve(root, "../apps/platform-host/src/composition/register-platform.ts"),
  "utf8",
);
const crossPlaneProbe = await readFile(
  resolve(
    root,
    "scripts/tests/integration/external-worker-iam-cross-plane.mjs",
  ),
  "utf8",
);
const sagaMigration = await readFile(
  resolve(root, "migrations/20260903_studio_identity_saga_attempt.sql"),
  "utf8",
);
const sagaRepository = await readFile(
  resolve(root, "../packages/platform/iam/src/kysely-identity-saga.ts"),
  "utf8",
);
const keycloakProvider = await readFile(
  resolve(root, "../packages/platform/iam/src/keycloak-identity-provider.ts"),
  "utf8",
);
const hostConfig = await readFile(
  resolve(root, "../apps/platform-host/src/config/index.ts"),
  "utf8",
);
const keycloakProbe = await readFile(
  resolve(root, "scripts/tests/integration/keycloak-identity-provider.mjs"),
  "utf8",
);
const combinedCleanProbe = await readFile(
  resolve(root, "scripts/tests/integration/certify-g5-clean-three-plane.mjs"),
  "utf8",
);
const internalWorkforceCommand = await readFile(
  resolve(root, "ddl/planes/neon/document/07_internal_workforce_iam.sql"),
  "utf8",
);
const internalWorkforceProbe = await readFile(
  resolve(
    root,
    "scripts/tests/integration/internal-workforce-iam-projection-command.sql",
  ),
  "utf8",
);
const internalWorkforceCrossPlaneProbe = await readFile(
  resolve(
    root,
    "scripts/tests/integration/internal-workforce-iam-cross-plane.mjs",
  ),
  "utf8",
);
const businessPartnerMaterializer = await readFile(
  resolve(
    root,
    "ddl/planes/neon/master/07_g5_business_partner_materializer.sql",
  ),
  "utf8",
);
const businessPartnerMigration = await readFile(
  resolve(
    root,
    "migrations/20260904_neon_governed_business_partner_scenario_materializer.sql",
  ),
  "utf8",
);
const businessPartnerMatrix = await readFile(
  resolve(
    root,
    "scripts/tests/integration/governed-business-partner-scenario-matrix.sql",
  ),
  "utf8",
);
const businessPartnerUpgrade = await readFile(
  resolve(
    root,
    "scripts/tests/integration/certify-g5-business-partner-supported-upgrade.mjs",
  ),
  "utf8",
);
const businessPartnerReport = JSON.parse(
  await readFile(
    resolve(
      root,
      "../../docs/architecture/reports/g5-business-partner-scenario-certification.json",
    ),
    "utf8",
  ),
) as {
  passed: boolean;
  scenarios: Record<string, string>;
  controls: Record<string, boolean | number>;
  independentOpenGate: string;
};
for (const source of [tables, migration]) {
  if (!/relationship_kind\s+IN\s*\([^)]*'external_worker'/i.test(source))
    failures.push("Studio identity projection does not admit external_worker");
  if (!/worker_engagement:%/.test(source))
    failures.push("Studio identity projection is not engagement correlated");
  if (
    !/UNIQUE\s*\(authority_tenant_id,\s*source_plane,\s*source_tenant_id,\s*relationship_kind,\s*source_ref\)/is.test(
      source,
    )
  )
    failures.push(
      "Studio identity projection lacks source-coordinate uniqueness",
    );
}
if (
  !/Duplicate identity source coordinates require reconciliation/.test(
    migration,
  )
)
  failures.push("supported upgrade lacks duplicate-source preflight");
if (
  !/CREATE TABLE IF NOT EXISTS trustiam\.identity_projection/.test(migration) ||
  !/trustiam_identity_projection_organization_fk/.test(migration) ||
  !/CREATE INDEX IF NOT EXISTS trustiam_identity_projection_reconcile_idx/.test(
    migration,
  )
)
  failures.push(
    "supported upgrade cannot construct the canonical projection on a pre-projection Studio database",
  );
if (
  !manifest.includes("20260903_studio_external_worker_identity_projection.sql")
)
  failures.push("Studio migration manifest omits G5 foundation");
if (!manifest.includes("20260903_studio_identity_saga_attempt.sql"))
  failures.push("Studio migration manifest omits G5 saga authority");
for (const token of [
  "CREATE TABLE IF NOT EXISTS trustiam.identity_saga_attempt",
  "trustiam_identity_saga_attempt_projection_fk",
  "trustiam_identity_saga_attempt_open_uq",
  "identity desired state is fenced by an active saga attempt",
  "trustiam_identity_saga_evidence_insert",
])
  if (!sagaMigration.includes(token))
    failures.push(`supported upgrade saga authority is missing ${token}`);
if (
  !/"external_worker"/.test(saga) ||
  !/IDENTITY_WORKER_ENGAGEMENT_REFERENCE_INVALID/.test(saga)
)
  failures.push("IAM saga lacks external-worker engagement validation");
if (
  /DELETE FROM master\.(person|external_worker)|DELETE FROM document\.worker_engagement/i.test(
    saga,
  )
)
  failures.push("IAM saga mutates external-worker source authority");
for (const source of [neonFunctions, neonMigration]) {
  for (const token of [
    "document.command_worker_engagement_iam_projection",
    "event.command_execution",
    "workforce.external_worker.identity_projection.requested",
    "athyper.trustiam.identity-projection-intent/1",
    "Worker engagement version is stale",
    "Worker engagement was not found in command tenant",
  ])
    if (!source.includes(token))
      failures.push(`NEON external-worker IAM command is missing ${token}`);
  if (
    !/INSERT INTO event\.outbox[\s\S]+UPDATE event\.command_execution[\s\S]+status = 'succeeded'/i.test(
      source,
    )
  )
    failures.push(
      "NEON command does not atomically complete through outbox and command evidence",
    );
  if (
    /DELETE FROM\s+(?:master\.person|master\.external_worker|document\.worker_engagement)/i.test(
      source,
    )
  )
    failures.push("NEON command deletes external-workforce authority");
}
if (
  !/BEFORE UPDATE OF access_status ON document\.worker_engagement[\s\S]+trg_guard_worker_engagement_iam_mutation/.test(
    neonTriggers,
  )
)
  failures.push("worker engagement IAM access state is not command-owned");
for (const token of [
  "g5-live-provision-0001",
  "g5-live-stale-0001",
  "g5-live-rollback-0001",
  "g5-live-suspend-0001",
  "g5-live-terminate-0001",
  "g5-live-cross-tenant-0001",
  "ROLLBACK;",
])
  if (!liveProbe.includes(token))
    failures.push(`G5 live command probe is missing ${token}`);
for (const token of [
  "EXTERNAL_WORKER_INTENT_TENANT_MISMATCH",
  "EXTERNAL_WORKER_INTENT_HASH_INVALID",
  "trustiam.external_worker.intent.consume",
  "trustiam.identity_projection",
  "trustiam-identity-intent",
  '"applied" | "replayed" | "stale" | "conflict"',
])
  if (!studioConsumer.includes(token))
    failures.push(`Studio external-worker intent consumer is missing ${token}`);
if (
  !/return this\.run\([\s\S]+insertProjection\([\s\S]+INSERT INTO event\.outbox[\s\S]+UPDATE event\.command_execution/.test(
    studioConsumer,
  ) ||
  !/function insertProjection[\s\S]+INSERT INTO trustiam\.identity_projection/.test(
    studioConsumer,
  )
)
  failures.push(
    "Studio identity projection, acknowledgement and command evidence are not one transaction",
  );
for (const token of [
  "neon-workforce-iam",
  "FOR UPDATE SKIP LOCKED",
  "locked_until",
  "dead_letter",
  "HASH_INVALID",
])
  if (!delivery.includes(token))
    failures.push(`external-worker delivery worker is missing ${token}`);
for (const token of [
  "registerExternalWorkerIdentityDelivery(container)",
  "jobNeonDatabase",
  "jobAthyperDatabase",
  "trustiam-external-worker-intent-delivery",
  "trustiam.external-worker-intent-delivery",
])
  if (!composition.includes(token))
    failures.push(`platform-host delivery wiring is missing ${token}`);
for (const token of [
  "KyselyExternalWorkerIdentityDeliveryRepository",
  "KyselyExternalWorkerIdentityIntentRepository",
  "EXTERNAL_WORKER_INTENT_ORGANIZATION_MISSING",
  "{retry:1}",
  "{applied:1}",
  "attempts:2",
  "throw rollback",
  "G5_EXTERNAL_WORKER_IAM_FULL_THREE_PLANE_ROLLBACK_OK",
  'plane:"studio"',
  'plane:"neon"',
  'plane:"mesh"',
  "targetTransactions={studio:stx,neon:ntx,mesh:mtx}",
])
  if (!crossPlaneProbe.includes(token))
    failures.push(
      `rollback-contained G5 cross-plane probe is missing ${token}`,
    );
for (const token of [
  "new KyselyIdentitySagaRepository",
  "new KyselyPlaneLocalIdentityAuthority",
  "PROVIDER_UNAVAILABLE",
  '"suspended",auth_epoch:1',
  '"deactivated",auth_epoch:2',
  "trustiam-identity-saga",
  "master.external_worker",
  "document.worker_engagement",
  "IdentityReplayService",
  "SOD_REQUIRED",
  "replay_approved_by",
  "SET LOCAL ROLE athyperapp",
])
  if (!crossPlaneProbe.includes(token))
    failures.push(`rollback-contained G5 live saga probe is missing ${token}`);
if (
  !/return this\.run\([\s\S]+appendSagaEvidence/.test(sagaRepository) ||
  !/INSERT INTO event\.outbox[\s\S]+trustiam\.identity\.saga\./.test(
    sagaRepository,
  )
)
  failures.push(
    "identity saga terminal evidence is not transaction-bound to its Studio attempt",
  );
for (const token of [
  "KEYCLOAK_ADMIN_CREDENTIAL_REFERENCE",
  "KEYCLOAK_ADMIN_BASE_URL",
  "KEYCLOAK_ADMIN_CLIENT_ID",
])
  if (!hostConfig.includes(token))
    failures.push(`platform-host provider configuration is missing ${token}`);
for (const token of [
  "KeycloakIdentityProviderAdapter",
  "registerIdentitySagaWorker(container,config)",
  "jobAthyperDatabase",
  "jobNeonDatabase",
  "jobMeshDatabase",
  "trustiam.identity.saga.run",
  "/api/iam/identity-saga-attempts/:attemptId/replay",
  "/api/iam/identity-saga-attempts/:attemptId/evidence",
  "studio.iam.application_projection.replay",
  "studio.iam.application_projection.read",
  "private, no-store",
])
  if (!composition.includes(token))
    failures.push(`platform-host identity saga wiring is missing ${token}`);
for (const token of [
  "class KeycloakIdentityProviderAdapter",
  "secrets.resolve",
  'grant_type:"client_credentials"',
  "/organizations/",
  "body:'{\"enabled\":false}'",
  "KEYCLOAK_PROVIDER_UNAVAILABLE",
  "secretCopy.fill(0)",
])
  if (!keycloakProvider.includes(token))
    failures.push(`Keycloak provider adapter is missing ${token}`);
if (/method:\s*["']DELETE["']/.test(keycloakProvider))
  failures.push(
    "Keycloak provider adapter deletes provider identity instead of revoking it",
  );
for (const token of [
  "KeycloakIdentityProviderAdapter",
  "organizationsEnabled:true",
  "serviceAccountsEnabled:true",
  "realm-admin",
  "ensureMembership",
  "provider.suspend",
  "provider.deprovision",
  "enabled,false",
  "G5_KEYCLOAK_PROVIDER_MUTATION_OK",
])
  if (!keycloakProbe.includes(token))
    failures.push(`disposable Keycloak mutation probe is missing ${token}`);
for (const token of [
  "athyper.environment=disposable_local",
  "business-partner-360-integration-baseline",
  "apply-disposable-ddl-manifest.ts",
  "provision-three-plane.ts",
  "--skip-keycloak",
  "provision-development-business-partner-fixtures.ts",
  "G5_KEYCLOAK_CLIENT_SECRET",
  "external-worker-iam-cross-plane.mjs",
  "internal-workforce-iam-cross-plane.mjs",
  "finally",
  'run("docker",["rm","-f",container]',
  "G5_COMBINED_CLEAN_KEYCLOAK_THREE_PLANE_OK",
])
  if (!combinedCleanProbe.includes(token))
    failures.push(
      `combined clean Keycloak/three-plane probe is missing ${token}`,
    );
for (const token of [
  "document.command_workforce_iam_projection",
  "workforce.employee.iam.project",
  "workforce.employee.identity_projection.requested",
  "'relationship','employer'",
  "'sourceRef','employment:'",
  "'roleCode','workforce.employee'",
  "event.command_execution",
  "event.outbox",
])
  if (!internalWorkforceCommand.includes(token))
    failures.push(`internal-workforce IAM command is missing ${token}`);
for (const token of [
  "g5-internal-command-0001",
  "g5-internal-stale-0001",
  "g5-internal-wrong-tenant-0001",
  "deprovisioned",
  "ROLLBACK;",
  "G5_INTERNAL_WORKFORCE_IAM_COMMAND_ROLLBACK_OK",
])
  if (!internalWorkforceProbe.includes(token))
    failures.push(`internal-workforce live command probe is missing ${token}`);
for (const token of [
  "document.command_workforce_iam_projection",
  "trustiam.internal_workforce.intent.consume",
  "relationship_kind='employer'",
  "KyselyExternalWorkerIdentityDeliveryRepository",
  "KyselyIdentitySagaRepository",
  "KeycloakIdentityProviderAdapter",
  'plane:"studio"',
  'plane:"neon"',
  'plane:"mesh"',
  '"suspended",auth_epoch:1',
  '"deactivated",auth_epoch:2',
  "PROVIDER_UNAVAILABLE",
  "master.employee",
  "master.employment",
  "throw rollback",
  "G5_INTERNAL_WORKFORCE_IAM_FULL_THREE_PLANE_ROLLBACK_OK",
])
  if (!internalWorkforceCrossPlaneProbe.includes(token))
    failures.push(`internal-workforce cross-plane probe is missing ${token}`);
for (const token of [
  "master.command_materialize_business_partner_role_case",
  "entity.case.materialize.business_partner_role",
  "supplier_self_registration",
  "meshRegistrationEvidenceHash",
  "bankDisclosureReceiptId",
  "bounded successful preflight evidence",
  "master.business_partner_operating_organization_assignment",
  "control.business_partner_qualification",
  "control.supplier_preference_designation",
  "snapshot.entity_case_snapshot_lineage",
  "event.command_execution",
  "event.outbox",
])
  if (!businessPartnerMaterializer.includes(token))
    failures.push(`G5 Business Partner materializer is missing ${token}`);
if (/document\.business_partner_request/.test(businessPartnerMaterializer))
  failures.push(
    "G5 materializer depends on legacy Business Partner request storage",
  );
for (const token of [
  "07_g5_business_partner_materializer.sql",
  "entity.case.materialize.business_partner_role",
  "COMMIT;",
])
  if (!businessPartnerMigration.includes(token))
    failures.push(`G5 supported-upgrade migration is missing ${token}`);
for (const token of [
  "buyer_requested_supplier",
  "supplier_self_registration",
  "internal_only_business_partner",
  "customer_onboarding",
  "command_entity_case_draft",
  "command_entity_case_lifecycle",
  "command_materialize_business_partner_role_case",
  "command_materialize_internal_business_partner_case",
  "exact replay failed",
  "wrong-tenant materialization accepted",
  "business_partner_request",
  "ROLLBACK;",
  "G5_BUSINESS_PARTNER_SCENARIO_MATRIX_ROLLBACK_OK",
])
  if (!businessPartnerMatrix.includes(token))
    failures.push(`G5 Business Partner scenario matrix is missing ${token}`);
for (const token of [
  "2026-09-03.v1.json",
  "20260904_neon_governed_lifecycle_g2_hardening.sql",
  "20260904_neon_governed_business_partner_scenario_materializer.sql",
  "test:integration:g5-business-partner-matrix",
  "G5_BUSINESS_PARTNER_SCENARIO_SUPPORTED_UPGRADE_OK",
  "finally",
])
  if (!businessPartnerUpgrade.includes(token))
    failures.push(
      `G5 Business Partner supported-upgrade harness is missing ${token}`,
    );
if (
  !businessPartnerReport.passed ||
  Object.values(businessPartnerReport.scenarios).some(
    (value) => value !== "pass",
  )
)
  failures.push("G5 Business Partner scenario report is not passing");
for (const control of [
  "releasePinnedCase",
  "makerChecker",
  "exactReplay",
  "staleVersionRejected",
  "wrongTenantRejected",
  "boundedSelfRegistrationPreflight",
  "meshExchangeEvidenceRequired",
  "purposeBoundDisclosureEvidenceRequired",
  "normalizedRoleAndScopeAuthorities",
  "atomicSnapshotMaterializationEvidenceOutbox",
] as const)
  if (businessPartnerReport.controls[control] !== true)
    failures.push(`G5 Business Partner report lacks ${control}`);
if (
  businessPartnerReport.controls.legacyBusinessPartnerRequestWrites !== 0 ||
  !businessPartnerReport.independentOpenGate.includes(
    "production evidence-checkpoint ledger remains empty",
  )
)
  failures.push("G5 report weakens the independent compatibility gate");

if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`FAIL ${failure}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS ${registry.scenarios.length} G5 scenarios inventoried; provider wiring, maker-checker/audit evidence and clean/supported-upgrade contracts are covered\n`,
  );
}
