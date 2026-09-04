import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { recordGovernedCompatibilityProductionObservation } from "../../operations/record-governed-compatibility-production-observation.js";
import {
  sha256,
  stable,
  unsignedAttestation,
  validateApprovalPacket,
  type ApprovalPacket,
  type ApprovalRole,
  type Attestation,
} from "../../operations/governed-compatibility-approval.js";

const root = resolve(import.meta.dirname, "../../../../..");
const containsToken = (source: string, token: string) =>
  source.replace(/\s+/gu, "").includes(token.replace(/\s+/gu, ""));
test("G6 retains every compatibility surface while production evidence is empty", async () => {
  const register = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement.v1.json",
      ),
      "utf8",
    ),
  );
  const ledger = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-observations.v1.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    register.surfaces.map((surface: { code: string }) => surface.code).sort(),
    [
      "business_partner_aliases_cache",
      "business_partner_person_group_compatibility",
      "business_partner_request_family",
      "flattened_decision_scope",
      "temporary_implementation_inventory",
      "workforce_iam_projection",
    ].sort(),
  );
  assert.equal(ledger.observations.length, 0);
  assert.equal(
    register.observationPolicy,
    "evidence_checkpoint_no_fixed_duration",
  );
  assert.equal(ledger.observationPolicy, register.observationPolicy);
  assert.deepEqual(register.localDevelopmentPolicy, {
    context: "local_development",
    productionObservationCheckpointRequired: false,
    minimumConsecutiveZeroUsageDays: 0,
    authorizesProductionRetirement: false,
    replacementGate:
      "Fresh source inventory must show zero active consumers; migration, rollback, behavioral probes and clean/supported-upgrade parity remain mandatory.",
  });
  assert.ok(
    register.surfaces.every(
      (surface: { status: string }) =>
        surface.status === "retained_not_removal_eligible",
    ),
  );
});

test("G6 parity and evaluation commands are read-only and fail closed", async () => {
  const capture = await readFile(
    resolve(
      root,
      "server/db/scripts/operations/capture-governed-compatibility-parity.ts",
    ),
    "utf8",
  );
  const evaluate = await readFile(
    resolve(
      root,
      "server/db/scripts/operations/evaluate-governed-compatibility-retirement.ts",
    ),
    "utf8",
  );
  assert.match(capture, /READ ONLY, ISOLATION LEVEL REPEATABLE READ/);
  assert.match(capture, /role_table_grants/);
  assert.match(capture, /role_column_grants/);
  assert.match(capture, /role_routine_grants/);
  assert.match(capture, /pg_get_functiondef/);
  assert.match(capture, /pre_retirement/);
  assert.match(capture, /post_retirement/);
  assert.doesNotMatch(
    capture,
    /\b(?:DROP|ALTER|DELETE|UPDATE|INSERT)\s+(?:TABLE|FROM|INTO|master\.|document\.|control\.)/i,
  );
  for (const token of [
    "observationPolicy",
    "observationPresent",
    "zeroProductionUsage",
    "minimumConsecutiveZeroUsage",
    "activeConsumerReferencesZero",
    "consumerMigrationComplete",
    "rollbackRehearsalPassed",
    "approvalsComplete",
    "cleanUpgradePreParity",
    'executionContext === "production" && allPreflightEligible',
    "localDevelopment || authenticProductionEvidence",
    "destructiveMigrationAuthorized:false",
  ])
    assert.ok(containsToken(evaluate, token), token);
});

test("G6 application readers resolve governed decisions through normalized scopes", async () => {
  const paths = [
    "server/packages/services/master-data/src/kysely-business-partner-360-commercial-controls.ts",
    "server/packages/services/master-data/src/kysely-business-partner-360-repository.ts",
    "server/packages/services/master-data/src/kysely-business-partner-360-role-sections.ts",
    "server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
    "server/packages/services/master-data/src/kysely-business-partner-case-repository.ts",
  ];
  for (const path of paths) {
    const source = await readFile(resolve(root, path), "utf8");
    assert.match(source, /control\.business_partner_decision_scope/, path);
    assert.doesNotMatch(
      source,
      /(?:qualification|preference|designation|review)\.(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)/,
      path,
    );
    assert.doesNotMatch(
      source,
      /SELECT\s+(?:\*|(?:qualification|preference|designation|review)\.\*)\s+FROM\s+control\.(?:business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)/i,
      path,
    );
  }
});

test("G6 commands own normalized decision-scope creation", async () => {
  const [functions, tables, grants, migration, repository, materializer] =
    await Promise.all([
      readFile(
        resolve(root, "server/db/ddl/planes/neon/control/07_functions.sql"),
        "utf8",
      ),
      readFile(
        resolve(root, "server/db/ddl/planes/neon/control/03_tables.sql"),
        "utf8",
      ),
      readFile(
        resolve(root, "server/db/ddl/planes/neon/control/11_grants.sql"),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/migrations/20260904_neon_normalized_decision_scope_writer_cutover.sql",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/ddl/planes/neon/master/07_g5_business_partner_materializer.sql",
        ),
        "utf8",
      ),
    ]);
  for (const source of [functions, repository, materializer])
    assert.match(source, /command_create_business_partner_decision/);
  assert.match(functions, /app\.normalized_decision_scope_write/);
  assert.match(
    functions,
    /INSERT INTO control\.business_partner_decision_scope/,
  );
  assert.match(
    migration,
    /ALTER COLUMN operating_organization_id DROP NOT NULL/,
  );
  assert.match(
    grants,
    /REVOKE INSERT,UPDATE ON control\.business_partner_qualification/,
  );
  assert.doesNotMatch(
    repository,
    /INSERT INTO control\.(?:business_partner_qualification|supplier_preference_designation|customer_credit_review)/,
  );
  assert.doesNotMatch(
    materializer,
    /INSERT INTO control\.(?:business_partner_qualification|supplier_preference_designation)/,
  );
  assert.match(tables, /CREATE TABLE control\.business_partner_decision_scope/);
});

test("G6 invitation cutover permits exactly one governed or historical request coordinate", async () => {
  const [tables, constraints, indexes, migration, backfill] = await Promise.all(
    [
      readFile(
        resolve(root, "server/db/ddl/planes/neon/document/03_tables.sql"),
        "utf8",
      ),
      readFile(
        resolve(root, "server/db/ddl/planes/neon/document/05_constraints.sql"),
        "utf8",
      ),
      readFile(
        resolve(root, "server/db/ddl/planes/neon/document/06_indexes.sql"),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/migrations/20260904_neon_business_partner_invitation_entity_case_cutover.sql",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/ddl/planes/neon/document/07_g6_business_partner_request_case_backfill.sql",
        ),
        "utf8",
      ),
    ],
  );
  for (const source of [tables, migration]) {
    assert.match(source, /business_partner_invitation[\s\S]*entity_case_id/);
    assert.match(
      source,
      /num_nonnulls\(business_partner_request_id,entity_case_id\)=1/,
    );
    assert.match(
      source,
      /business_partner_invitation_recovery_subject_chk[\s\S]*num_nonnulls\(request_id,entity_case_id\)=1/,
    );
  }
  assert.match(constraints, /business_partner_invitation_entity_case_fk/);
  assert.match(
    constraints,
    /business_partner_invitation_recovery_entity_case_fk/,
  );
  assert.match(indexes, /business_partner_invitation_entity_case_uq/);
  assert.match(backfill, /command_backfill_business_partner_request_cases/);
  assert.match(backfill, /p_entity_contract_hash/);
  assert.match(backfill, /p_form_template_hash/);
  assert.match(backfill, /fn_validate_entity_case_payload/);
  assert.match(backfill, /workflowRequestId/);
  assert.match(backfill, /entity\.case\.legacy_request\.backfilled/);
  assert.doesNotMatch(backfill, /business_partner_bank_account/);
});

test("G6 production observations require deployed metrics and database evidence", async () => {
  const [recorder, evaluator, composition, ledger] = await Promise.all([
    readFile(
      resolve(
        root,
        "server/db/scripts/operations/record-governed-compatibility-production-observation.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "server/db/scripts/operations/evaluate-governed-compatibility-retirement.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "server/apps/platform-host/src/composition/register-services.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-observations.v1.json",
      ),
      "utf8",
    ),
  ]);
  for (const token of [
    'environment!=="production"',
    "deploymentRelease",
    "metricsSourceReference",
    "databaseActivitySourceReference",
    "productionDatabaseIdentity",
    "pg_stat_statements_info",
    "activityQuerySha256",
    "activityResultSha256",
    "countsQuerySha256",
    "countsResultSha256",
    "consumerInventoryPath",
    "inventoryHash",
    "Prometheus returned no compatibility counter series; zero cannot be inferred from absence",
    "minimumConsecutiveZeroUsageDays!==14",
  ])
    assert.ok(containsToken(recorder, token), token);
  assert.doesNotMatch(recorder, /or vector\(0\)/);
  assert.match(composition, /athyper_governed_compatibility_access_total/);
  assert.match(
    composition,
    /business_partner_request_family[\s\S]*business_partner_invitation_legacy_binding/,
  );
  assert.match(evaluator, /authenticProductionEvidence/);
  assert.match(
    evaluator,
    /athyper\.g6-production-compatibility-observation-evidence/,
  );
  assert.match(evaluator, /validateApprovalPacket/);
  assert.match(evaluator, /approvalBoundToObservation/);
  assert.doesNotMatch(evaluator, /approvals\.includes/);
  assert.equal(JSON.parse(ledger).minimumConsecutiveZeroUsageDays, 14);
  assert.deepEqual(JSON.parse(ledger).observations, []);
});

test("G6 approval packets require three independent hash-bound signatures", () => {
  const evidence = Array.from({ length: 7 }, (_, index) => ({
      code: `evidence_${index}`,
      kind: "test",
      source: `evidence/${index}.json`,
      sha256: createHash("sha256").update(String(index)).digest("hex"),
    })),
    evidenceBundleHash = sha256(stable(evidence));
  const assertionKeys: Record<ApprovalRole, string[]> = {
    "surface-owner": ["consumerCutover", "semanticCompatibility"],
    "database-owner": [
      "migration",
      "backup",
      "reconstruction",
      "locks",
      "privileges",
      "rollback",
    ],
    "release-owner": [
      "deploymentWindow",
      "monitoring",
      "abortCriteria",
      "forwardFixPlan",
    ],
  };
  const attestation = (role: ApprovalRole): Attestation => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519"),
      publicKeyPem = publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      keyId = sha256(
        publicKey.export({ type: "spki", format: "der" }) as Buffer,
      ),
      value = {
        schemaVersion: 1,
        kind: "athyper.g6-compatibility-retirement-attestation",
        surfaceCode: "flattened_decision_scope",
        role,
        decision: "approve",
        approver: {
          subject: `subject:${role}`,
          authorityRef: `authority-record:${role}:immutable`,
        },
        issuedAt: "2026-09-04T00:00:00.000Z",
        evidenceBundleHash,
        evidenceHashes: evidence.map((item) => item.sha256).sort(),
        assertions: Object.fromEntries(
          assertionKeys[role].map((key) => [
            key,
            `Substantive ${role} evidence for ${key} has been independently reviewed.`,
          ]),
        ),
        signature: {
          algorithm: "ed25519",
          keyId,
          publicKeyPem,
          valueBase64: "",
        },
      } as Attestation,
      payload = stable(unsignedAttestation(value));
    value.attestationHash = sha256(payload);
    value.signature.valueBase64 = sign(
      null,
      Buffer.from(payload),
      privateKey,
    ).toString("base64");
    return value;
  };
  const packet: ApprovalPacket = {
    schemaVersion: 1,
    kind: "athyper.g6-compatibility-retirement-approval-packet",
    surfaceCode: "flattened_decision_scope",
    owner: "Commercial Governance",
    createdAt: "2026-09-04T00:00:00.000Z",
    evidenceBundleHash,
    evidence,
    attestations: [
      attestation("surface-owner"),
      attestation("database-owner"),
      attestation("release-owner"),
    ],
    status: "approved",
  };
  packet.packetHash = sha256(stable(packet));
  assert.deepEqual(validateApprovalPacket(packet, packet.surfaceCode), []);
  const checkbox = structuredClone(packet);
  checkbox.attestations[0].assertions.consumerCutover = "yes";
  checkbox.packetHash = sha256(stable(checkbox));
  assert.match(
    validateApprovalPacket(checkbox, checkbox.surfaceCode).join(";"),
    /substantive consumerCutover|signature is invalid/,
  );
  const duplicate = structuredClone(packet);
  duplicate.attestations[2].approver.subject =
    duplicate.attestations[0].approver.subject;
  duplicate.packetHash = sha256(stable(duplicate));
  assert.match(
    validateApprovalPacket(duplicate, duplicate.surfaceCode).join(";"),
    /not independent/,
  );
});

test("G6 production recorder rejects manual or non-production zero declarations before I/O", async () => {
  await assert.rejects(
    recordGovernedCompatibilityProductionObservation({
      startedAt: "2026-09-01T00:00:00Z",
      endedAt: "2026-09-02T00:00:00Z",
      deploymentRelease: "release-immutable-1",
      metricsSourceReference: "metrics-source-1",
      databaseActivitySourceReference: "database-source-1",
      productionDatabaseIdentity: "a".repeat(64),
      databaseUrl: "postgresql://invalid",
      prometheusUrl: "http://invalid",
      consumerInventoryPath:
        "docs/architecture/reports/g6/current-consumer-inventory.json",
      databaseBaselinePath:
        "docs/architecture/reports/g6/production-observation-start.json",
      outputPath:
        "config/governance/governed-lifecycle-g6-retirement-observations.v1.json",
      environment: "development",
      confirmation: "RECORD-G6-PRODUCTION-COMPATIBILITY-OBSERVATION",
      now: new Date("2026-09-03T00:00:00Z"),
    }),
    /environment=production/,
  );
});

test("G6 recovery rehearsals are clone-bound, rollback-only and complete", async () => {
  const [runner, sequence, aliasMigration, requestMigration, runbook, example] =
    await Promise.all([
      readFile(
        resolve(
          root,
          "server/db/scripts/operations/rehearse-governed-compatibility-recovery.ts",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/retirements/g6/02_business_partner_aliases_cache.sql",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/retirements/g6/06_business_partner_request_family.sql",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "docs/architecture/plans/governed-lifecycle-g6-recovery-rehearsal.md",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "config/governance/governed-lifecycle-g6-recovery-backup.example.json",
        ),
        "utf8",
      ),
    ]);
  for (const token of [
    "REHEARSE-G6-RECOVERY-ON-ISOLATED-CLONE",
    "pg_control_system()",
    "sourceSystemIdentifier===manifest.cloneSystemIdentifier",
    "forced_rollback",
    "migrationSha256",
    "backupManifestSha256",
    "rtoTargetSeconds",
    "rpoTargetSeconds",
    "business_partner_request_family",
    "business_partner_aliases_cache",
    "flattened_decision_scope",
    "workforce_iam_projection",
    "business_partner_person_group_compatibility",
    "temporary_implementation_inventory",
  ])
    assert.ok(containsToken(runner, token), token);
  assert.match(runner, /throw new RollbackOnly/);
  assert.ok(containsToken(runner, 'flag:"wx"'));
  assert.equal(JSON.parse(sequence).surfaces.length, 6);
  assert.match(aliasMigration, /DROP COLUMN aliases/);
  assert.match(
    requestMigration,
    /DROP TABLE document\.business_partner_request CASCADE/,
  );
  assert.match(runbook, /prohibited against production/);
  assert.match(runbook, /does not by itself authorize retirement/);
  assert.equal(
    JSON.parse(example).kind,
    "athyper.g6-isolated-production-backup-clone",
  );
});

test("G6 retires one hash-bound surface per release without activating staged migrations", async () => {
  const [sequenceSource, manifest, apply, certify] = await Promise.all([
      readFile(
        resolve(
          root,
          "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
        ),
        "utf8",
      ),
      readFile(
        resolve(root, "server/db/migrations/manifests/neon.txt"),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/scripts/operations/apply-governed-compatibility-retirement.ts",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "server/db/scripts/operations/certify-governed-compatibility-retirement.ts",
        ),
        "utf8",
      ),
    ]),
    sequence = JSON.parse(sequenceSource);
  assert.deepEqual(
    sequence.surfaces.map((value: { code: string }) => value.code),
    [
      "temporary_implementation_inventory",
      "business_partner_aliases_cache",
      "flattened_decision_scope",
      "business_partner_person_group_compatibility",
      "workforce_iam_projection",
      "business_partner_request_family",
    ],
  );
  assert.equal(sequence.state.certifiedThroughOrder, 0);
  for (const surface of sequence.surfaces) {
    assert.ok(!manifest.includes(surface.migration));
    await readFile(resolve(root, surface.migration), "utf8");
  }
  for (const token of [
    "validateApprovalPacket",
    "signed packet does not authorize this exact surface migration",
    "certifiedThroughOrder+1",
    "pg_advisory_xact_lock",
    "lock_timeout='5s'",
    "statement_timeout='15min'",
    "ROLLBACK",
    "expected-database-identity-sha256",
    "APPLY-G6-RETIREMENT:",
    'flag:"wx"',
  ])
    assert.ok(containsToken(apply, token), token);
  for (const token of [
    "production-application",
    "clean-application",
    "upgrade-application",
    "negative/replay/tenant/audit/privilege evidence",
    "post_retirement",
    "JSON.stringify(cleanPost.catalog)",
    "JSON.stringify(cleanPost.privileges)",
    "abortRequired:false",
    "forwardFixRequired:false",
  ])
    assert.ok(containsToken(certify, token), token);
});
