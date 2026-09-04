#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Disposition = "accepted" | "merged" | "rejected";
interface Review {
  relation: string;
  disposition: Disposition;
  existingAuthoritiesReviewed: string[];
  identityProof: string;
  lifecycleProof: string;
  cardinalityProof: string;
  retentionProof: string;
  implementation: string;
}

const databaseRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const reviewPath = resolve(
  databaseRoot,
  "ddl/governed-entity-lifecycle-minimal-schema-review.v1.json",
);
const document = JSON.parse(await readFile(reviewPath, "utf8")) as {
  schemaVersion: number;
  authority: string;
  relations: Review[];
};
const expected = new Set([
  "document.entity_case",
  "document.entity_case_command_evidence",
  "document.entity_case_validation",
  "document.entity_case_materialization",
  "snapshot.entity_case_snapshot_lineage",
  "governance.cycle_subject",
  "metadata.entity_surface_component_binding",
  "governance.authority_register",
  "mesh.network_relationship_capability",
]);
const failures: string[] = [];

if (document.schemaVersion !== 1)
  failures.push("review schemaVersion must be 1");
try {
  await access(resolve(repositoryRoot, document.authority));
} catch {
  failures.push(`authority does not exist: ${document.authority}`);
}
if (document.relations.length !== expected.size)
  failures.push(`expected exactly ${expected.size} relation dispositions`);
for (const review of document.relations) {
  if (!expected.delete(review.relation))
    failures.push(`unexpected or duplicate relation: ${review.relation}`);
  if (!["accepted", "merged", "rejected"].includes(review.disposition))
    failures.push(`${review.relation} has invalid disposition`);
  if (review.existingAuthoritiesReviewed.length === 0)
    failures.push(`${review.relation} reviewed no existing authority`);
  for (const proof of [
    "identityProof",
    "lifecycleProof",
    "cardinalityProof",
    "retentionProof",
    "implementation",
  ] as const) {
    if (review[proof].trim().length < 40)
      failures.push(`${review.relation} has inadequate ${proof}`);
  }
  if (
    review.disposition !== "accepted" &&
    !/merge|reject/i.test(review.implementation)
  )
    failures.push(`${review.relation} has no executable non-table disposition`);
}
for (const relation of expected)
  failures.push(`missing relation disposition: ${relation}`);

const authorityRegister = document.relations.find(
  ({ relation }) => relation === "governance.authority_register",
);
if (
  authorityRegister?.disposition !== "merged" ||
  !authorityRegister.implementation.includes(
    "runtime_meta.applied_release_payload",
  )
) {
  failures.push(
    "authority register must reuse the immutable applied-release payload authority",
  );
}

const canonicalSources = await Promise.all([
  readFile(resolve(databaseRoot, "ddl/common/document/03_tables.sql"), "utf8"),
  readFile(
    resolve(databaseRoot, "ddl/common/governance/03_tables.sql"),
    "utf8",
  ),
  readFile(resolve(databaseRoot, "ddl/common/snapshot/03_tables.sql"), "utf8"),
  readFile(
    resolve(databaseRoot, "ddl/planes/studio/metadata/03_tables.sql"),
    "utf8",
  ),
]);
const canonical = canonicalSources.join("\n");
const coreMigration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_common_governed_entity_case_foundation.sql",
  ),
  "utf8",
);
const componentMigration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_studio_entity_surface_component_binding.sql",
  ),
  "utf8",
);
const migrationManifests = await Promise.all(
  ["studio", "neon", "mesh"].map((plane) =>
    readFile(
      resolve(databaseRoot, `migrations/manifests/${plane}.txt`),
      "utf8",
    ),
  ),
);
const upgradeProbe = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/governed-entity-case-foundation.mjs",
  ),
  "utf8",
);
const caseFunctions = await readFile(
  resolve(databaseRoot, "ddl/common/document/07_functions.sql"),
  "utf8",
);
const draftProbe = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/governed-entity-case-draft-command.sql",
  ),
  "utf8",
);
const commandMigration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_common_governed_entity_case_draft_command.sql",
  ),
  "utf8",
);
const concurrencyProbe = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/governed-entity-case-concurrency.mjs",
  ),
  "utf8",
);
const lifecycleMigration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_common_governed_entity_case_lifecycle_command.sql",
  ),
  "utf8",
);
const lifecycleProbe = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/governed-entity-case-lifecycle-command.sql",
  ),
  "utf8",
);
const internalPartnerMaterializer = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_neon_governed_internal_business_partner_materializer.sql",
  ),
  "utf8",
);
const governedContract = await readFile(
  resolve(
    repositoryRoot,
    "server/packages/contracts/master-data/src/governed-internal-business-partner.ts",
  ),
  "utf8",
);
const governedService = await readFile(
  resolve(
    repositoryRoot,
    "server/packages/services/master-data/src/governed-internal-business-partner-service.ts",
  ),
  "utf8",
);
const governedRepository = await readFile(
  resolve(
    repositoryRoot,
    "server/packages/services/master-data/src/kysely-governed-internal-business-partner-repository.ts",
  ),
  "utf8",
);
const governedRoutes = await readFile(
  resolve(
    repositoryRoot,
    "server/packages/services/master-data/src/governed-internal-business-partner-routes.ts",
  ),
  "utf8",
);
const hostComposition = await readFile(
  resolve(
    repositoryRoot,
    "server/apps/platform-host/src/composition/register-services.ts",
  ),
  "utf8",
);
const governedHttpProbe = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/governed-internal-business-partner-http.mjs",
  ),
  "utf8",
);
const cleanHarness = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/certify-g5-clean-three-plane.mjs",
  ),
  "utf8",
);
const usageObserver = await readFile(
  resolve(
    databaseRoot,
    "scripts/operations/record-governed-internal-business-partner-usage.ts",
  ),
  "utf8",
);
const usageLedger = JSON.parse(
  await readFile(
    resolve(
      repositoryRoot,
      "config/governance/governed-internal-business-partner-usage-observations.v1.json",
    ),
    "utf8",
  ),
) as {
  schemaVersion: number;
  observationPolicy: string;
  observations: Array<{ gate?: { removalEligible?: boolean } }>;
};
const supportedUpgradeHttpHarness = await readFile(
  resolve(
    databaseRoot,
    "scripts/tests/integration/certify-g1-supported-upgrade-http.mjs",
  ),
  "utf8",
);
for (const relation of document.relations.filter(
  (row) =>
    row.disposition === "accepted" &&
    row.relation !== "mesh.network_relationship_capability",
)) {
  if (!canonical.includes(`CREATE TABLE ${relation.relation} (`))
    failures.push(
      `${relation.relation} accepted disposition is absent from canonical DDL`,
    );
}
for (const token of [
  "entity_contract_id uuid NOT NULL",
  "entity_contract_hash char(64) NOT NULL",
  "form_template_release_id uuid",
  "form_template_release_no bigint",
  "form_template_hash char(64)",
  "current_snapshot_id uuid NOT NULL",
])
  if (!canonical.includes(token))
    failures.push(`entity case pinning is missing ${token}`);
if (/CREATE TABLE governance\.authority_register/.test(canonical))
  failures.push(
    "merged authority register was incorrectly implemented as a table",
  );
if (
  /CREATE TABLE document\.entity_case[\s\S]{0,1800}(payload|data) jsonb/i.test(
    canonical,
  )
)
  failures.push("entity case head contains a proposal payload");
for (const relation of [
  "document.entity_case",
  "document.entity_case_command_evidence",
  "document.entity_case_validation",
  "document.entity_case_materialization",
  "governance.cycle_subject",
  "snapshot.entity_case_snapshot_lineage",
])
  if (!coreMigration.includes(`CREATE TABLE ${relation} (`))
    failures.push(`${relation} is absent from supported-upgrade construction`);
if (
  !componentMigration.includes(
    "CREATE TABLE metadata.entity_surface_component_binding (",
  )
)
  failures.push(
    "surface component binding is absent from supported-upgrade construction",
  );
for (const [index, manifest] of migrationManifests.entries())
  if (!manifest.includes("20260903_common_governed_entity_case_foundation.sql"))
    failures.push(
      `${["studio", "neon", "mesh"][index]} omits the shared G1 upgrade migration`,
    );
for (const [index, manifest] of migrationManifests.entries())
  if (
    !manifest.includes("20260903_common_governed_entity_case_draft_command.sql")
  )
    failures.push(
      `${["studio", "neon", "mesh"][index]} omits the shared G1 draft-command migration`,
    );
for (const [index, manifest] of migrationManifests.entries())
  if (
    !manifest.includes(
      "20260903_common_governed_entity_case_lifecycle_command.sql",
    )
  )
    failures.push(
      `${["studio", "neon", "mesh"][index]} omits the shared G1 lifecycle-command migration`,
    );
if (
  !migrationManifests[0]!.includes(
    "20260903_studio_entity_surface_component_binding.sql",
  )
)
  failures.push("Studio omits the component-binding upgrade migration");
for (const token of [
  "relforcerowsecurity",
  "entity_case_contract_fk",
  "entity_case_materialization_fingerprint_uq",
  "entity_case_command_evidence_immutable",
  "entity_surface_component_binding_pointer_chk",
  "G1_GOVERNED_ENTITY_CASE_SUPPORTED_UPGRADE_OK",
])
  if (!upgradeProbe.includes(token))
    failures.push(`supported-upgrade live probe is missing ${token}`);
for (const token of [
  "document.fn_entity_case_three_way_merge",
  "document.fn_validate_entity_case_payload",
  "document.trg_guard_entity_case_mutation",
  "document.command_entity_case_draft",
  "entity.case.draft.write",
  "snapshot.fn_capture_entity",
  "ENTITY_CASE_MERGE_CONFLICT",
  "event.command_execution",
  "document.entity_case_command_evidence",
  "event.outbox",
])
  if (!caseFunctions.includes(token))
    failures.push(`governed draft command is missing ${token}`);
for (const token of [
  "g1-draft-create-0001",
  "g1-draft-revise-0002",
  "g1-draft-merge-0003",
  "g1-draft-conflict-0004",
  "g1-draft-invalid-0005",
  "direct case mutation accepted",
  "ROLLBACK;",
  "G1_GOVERNED_ENTITY_CASE_DRAFT_COMMAND_ROLLBACK_OK",
])
  if (!draftProbe.includes(token))
    failures.push(`governed draft command probe is missing ${token}`);
for (const token of [
  "document.fn_entity_case_three_way_merge",
  "document.fn_validate_entity_case_payload",
  "document.trg_guard_entity_case_mutation",
  "document.command_entity_case_draft",
  "DROP TRIGGER IF EXISTS entity_case_command_guard",
  "COMMIT;",
])
  if (!commandMigration.includes(token))
    failures.push(`supported-upgrade draft command is missing ${token}`);
for (const token of [
  "Promise.all",
  "merge-left",
  "merge-right",
  "conflict-left",
  "conflict-right",
  "exact-replay",
  "session_replication_role = replica",
  "G1_GOVERNED_ENTITY_CASE_LIVE_CONCURRENCY_OK",
])
  if (!concurrencyProbe.includes(token))
    failures.push(`live concurrency probe is missing ${token}`);
for (const token of [
  "document.command_entity_case_lifecycle",
  "entity.case.lifecycle",
  "entity.case.submit",
  "entity.case.decision",
  "submitted_from",
  "decided_from",
  "governance.cycle_subject",
  "completion_evidence",
  "p_actor_id=current.created_by",
  "COMMIT;",
])
  if (!lifecycleMigration.includes(token))
    failures.push(`supported-upgrade lifecycle command is missing ${token}`);
for (const token of [
  "g1-life-submit-0001",
  "g1-life-approve-0001",
  "g1-life-reject-0002",
  "maker approved own case",
  "stale decision accepted",
  "wrong tenant accepted",
  "empty rejection reason accepted",
  "ROLLBACK;",
  "G1_GOVERNED_ENTITY_CASE_LIFECYCLE_ROLLBACK_OK",
])
  if (!lifecycleProbe.includes(token))
    failures.push(`governed lifecycle probe is missing ${token}`);
for (const token of [
  "master.command_materialize_internal_business_partner_case",
  "control.command_business_partner_lifecycle",
  "neon.internal_business_partner",
  "document.entity_case_materialization",
  "materialized_from",
  "target_authority_type",
  "BUSINESS_PARTNER_CREATED",
  "Materialized Business Partner snapshot violates the pinned contract",
  "COMMIT;",
])
  if (!internalPartnerMaterializer.includes(token))
    failures.push(`internal Business Partner materializer is missing ${token}`);
if (internalPartnerMaterializer.includes("mesh."))
  failures.push(
    "internal-only Business Partner materializer depends on MESH state",
  );
if (
  !migrationManifests[1]!.includes(
    "20260903_neon_governed_internal_business_partner_materializer.sql",
  )
)
  failures.push(
    "NEON omits the internal Business Partner materializer migration",
  );
for (const token of [
  "entityContractId",
  "entityContractHash",
  "formTemplateReleaseId",
  "formTemplateReleaseNo",
  "formTemplateHash",
  "cycleRunId",
  "cycleTaskId",
])
  if (!governedContract.includes(token))
    failures.push(`governed internal consumer contract is missing ${token}`);
for (const token of [
  "businessPartnerRequestPermissions.create",
  "businessPartnerRequestPermissions.submit",
  "businessPartnerRequestPermissions.decide",
  "businessPartnerRequestPermissions.apply",
  'transactions.run("neon"',
])
  if (!governedService.includes(token))
    failures.push(`governed internal service is missing ${token}`);
for (const token of [
  "document.command_entity_case_draft",
  "document.command_entity_case_lifecycle",
  "master.command_materialize_internal_business_partner_case",
  "GOVERNED_CASE_VERSION_CONFLICT",
  "GOVERNED_CASE_NOT_FOUND",
])
  if (!governedRepository.includes(token))
    failures.push(`governed internal repository is missing ${token}`);
for (const token of [
  "/api/neon/governed-business-partner-cases",
  "governed_internal.${operation}",
  "formTemplateReleaseId",
  "formTemplateHash",
])
  if (!governedRoutes.includes(token))
    failures.push(`governed internal HTTP surface is missing ${token}`);
for (const token of [
  "createGovernedInternalBusinessPartnerCaseService",
  "KyselyGovernedInternalBusinessPartnerCaseRepository",
  "registerGovernedInternalBusinessPartnerRoutes",
  "governed-internal-business-partner.neon",
])
  if (!hostComposition.includes(token))
    failures.push(
      `platform-host governed internal cutover is missing ${token}`,
    );
for (const token of [
  "SAVEPOINT",
  "ROLLBACK TO SAVEPOINT",
  "formTemplateHash:undefined",
  "g1-http-maker",
  "g1-http-stale",
  "wrongTenantActor",
  "document.business_partner_request",
  "G1_GOVERNED_INTERNAL_BUSINESS_PARTNER_HTTP_OK",
])
  if (!governedHttpProbe.includes(token))
    failures.push(`governed internal HTTP probe is missing ${token}`);
if (!cleanHarness.includes("governed-internal-business-partner-http.mjs"))
  failures.push(
    "combined clean harness omits the governed internal HTTP probe",
  );
for (const token of [
  "BEGIN READ ONLY",
  "governed_internal\\\\..*",
  "legacyMutationCalls",
  "consumerMigrationComplete",
  "supportedUpgradeHttpCertified",
  "RECORD-G1-INTERNAL-BP-USAGE-OBSERVATION",
])
  if (!usageObserver.includes(token))
    failures.push(`governed internal usage observer is missing ${token}`);
if (
  usageLedger.schemaVersion !== 1 ||
  usageLedger.observationPolicy !== "evidence_checkpoint_no_fixed_duration" ||
  usageLedger.observations.some((item) => item.gate?.removalEligible === true)
)
  failures.push(
    "governed internal usage ledger is invalid or prematurely removal-eligible",
  );
for (const token of [
  "baseline.gitRevision",
  "forwardMigrations",
  "01_service_roles.sql",
  "applyAdminSql",
  "expandGitSql",
  "expandCurrentSql",
  "restoreMigrationOnlyWorkforceIamProjection",
  "20260829_neon_workforce_lifecycle.sql",
  "governed-entity-case-foundation.mjs",
  "governed-internal-business-partner-http.mjs",
  "G1_GOVERNED_INTERNAL_BUSINESS_PARTNER_SUPPORTED_UPGRADE_HTTP_OK",
  "finally",
])
  if (!supportedUpgradeHttpHarness.includes(token))
    failures.push(`G1 supported-upgrade HTTP harness is missing ${token}`);

if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`FAIL ${failure}\n`));
  process.exitCode = 1;
} else {
  const counts = document.relations.reduce<Record<Disposition, number>>(
    (value, row) => ({
      ...value,
      [row.disposition]: value[row.disposition] + 1,
    }),
    { accepted: 0, merged: 0, rejected: 0 },
  );
  process.stdout.write(
    `PASS all nine G1 relations reviewed: ${counts.accepted} accepted, ${counts.merged} merged, ${counts.rejected} rejected\n`,
  );
}
