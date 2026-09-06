#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const repositoryRevision = currentGitRevision(repositoryRoot);
const strict = process.argv.includes("--strict");
const evidenceDirectory = resolve(
  repositoryRoot,
  argumentValue("--evidence-dir=") ?? "artifacts/authorization-wave0",
);
const outputArgument = argumentValue("--output=");
const dispositionArtifactCheck = runCommand(
  process.execPath,
  ["tooling/scripts/policy/authorization-data-disposition.mjs", "--check"],
  repositoryRoot,
);
const inventoryArtifactCheck = runCommand(
  process.execPath,
  [
    tsxCli,
    "tooling/scripts/policy/verify-authorization-inventory.ts",
    "--check",
    "--json",
    "--structural-only",
  ],
  repositoryRoot,
);
const authorizationInvalidationArtifactCheck = await staticInvalidationContract();

const checks = [];
const inventory = await optionalJson(
  resolve(repositoryRoot, "governance/config/governance/authorization-inventory.v1.json"),
);
const disposition = await requiredJson(
  resolve(
    repositoryRoot,
    "governance/config/governance/authorization-data-disposition-inventory.v1.json",
  ),
  "data-disposition inventory",
);
const recovery = await requiredJson(
  resolve(
    repositoryRoot,
    "governance/config/governance/authorization-migration-recovery-contract.v1.json",
  ),
  "migration recovery contract",
);
const rollout = await requiredJson(
  resolve(repositoryRoot, "governance/config/governance/authorization-rollout-contract.json"),
  "authorization rollout contract",
);
const highRisk = await requiredJson(
  resolve(
    repositoryRoot,
    "governance/config/governance/authorization-high-risk-action-catalog.v1.json",
  ),
  "high-risk action catalog",
);

check(
  "architecture_decisions_frozen",
  "static",
  await adrDecisionStatus(),
  "The ADR must lock ownership, precedence, Admin semantics, and the zero-Mesh-data boundary.",
);

if (!inventory) {
  check(
    "no_unknown_authorization_source_or_static_writer",
    "static",
    "pending",
    "Generate governance/config/governance/authorization-inventory.v1.json.",
  );
  check(
    "zero_mesh_specific_data_neon_boundary_implemented",
    "static",
    "fail",
    "A freshly recomputed boundary inventory is required.",
  );
} else {
  const inventoryUnknowns = collectInventoryUnknowns(inventory);
  check(
    "no_unknown_authorization_source_or_static_writer",
    "static",
    inventoryArtifactCheck.passed && inventoryUnknowns.length === 0
      ? "pass"
      : "fail",
    inventoryArtifactCheck.passed && inventoryUnknowns.length === 0
      ? "Freshly recomputed inventory reports no drift or unknown/unowned/unclassified source or writer."
      : `Inventory blockers: ${[
          ...inventoryUnknowns,
          ...(!inventoryArtifactCheck.passed
            ? [`recomputation=${inventoryArtifactCheck.detail}`]
            : []),
        ].join(", ")}`,
  );
  const knownSourceAnomalies = inventory?.gates?.knownSourceAnomalies;
  check(
    "known_authorization_source_anomalies_resolved",
    "static",
    Array.isArray(knownSourceAnomalies) && knownSourceAnomalies.length === 0
      ? "pass"
      : "fail",
    !Array.isArray(knownSourceAnomalies)
      ? "Inventory gate knownSourceAnomalies is missing or invalid."
      : knownSourceAnomalies.length > 0
      ? `${knownSourceAnomalies.length} owned catalog/reference anomalies require repair or retirement.`
      : "No owned source anomaly remains.",
  );
  const meshBoundaryFindings =
    inventory?.gates?.zeroMeshNeonBoundaryFindings;
  check(
    "zero_mesh_specific_data_neon_boundary_implemented",
    "static",
    Array.isArray(meshBoundaryFindings) && meshBoundaryFindings.length === 0
      ? "pass"
      : "fail",
    !Array.isArray(meshBoundaryFindings)
      ? "Inventory gate zeroMeshNeonBoundaryFindings is missing or invalid."
      : meshBoundaryFindings.length > 0
      ? `${meshBoundaryFindings.length} owned legacy table/seed/reader/configuration or RLS-bypass findings still violate the target boundary.`
      : "No Mesh-specific Neon source, cross-plane fallback, or RLS-bypassing Mesh runtime identity remains.",
  );
}

check(
  "authorization_rollout_default_safe",
  "static",
  rollout?.defaultMode === "legacy" &&
    rollout?.percentageRolloutAllowed === false &&
    rollout?.decisionComposition === "select_one_never_union" &&
    rollout?.policySources?.mesh?.authority === "mesh"
      ? "pass"
      : "fail",
  "Rollout must default to legacy, prohibit percentage rollout/union, and keep Mesh policy Mesh-local.",
);

check(
  "every_declared_table_and_object_has_one_disposition",
  "static",
  dispositionArtifactCheck.passed &&
    disposition?.gates?.everyDiscoveredTableHasOneDisposition === true &&
    disposition?.gates?.everyExternalObjectHasOneDisposition === true
      ? "pass"
      : "fail",
  dispositionArtifactCheck.passed
    ? "The deterministic DDL/runtime/external-object inventory contains no unclassified object."
    : `Disposition inventory is stale or invalid: ${dispositionArtifactCheck.detail}`,
);

check(
  "every_table_and_object_disposition_approved",
  "approval",
  disposition?.gates?.allDispositionsApproved === true ? "pass" : "pending",
  disposition?.gates?.allDispositionsApproved === true
    ? "Disposition policy contains named approval evidence."
    : "Data, retention, security, and operations approval is still required.",
);

check(
  "atomic_plane_cohort_flags_available",
  "static",
  await rolloutStaticStatus(rollout),
  "Exact plane/cohort legacy, shadow, and enforce controls must exist and ship legacy.",
);

check(
  "authorization_change_capture_baseline_present",
  "static",
  authorizationInvalidationArtifactCheck.passed
    ? "pass"
    : "fail",
  authorizationInvalidationArtifactCheck.passed
    ? "The common plane-local authorization invalidation outbox, epoch capture, immutable evidence, and trigger installation contracts are present."
    : `Invalidation verifier blockers: ${authorizationInvalidationArtifactCheck.detail}`,
);

check(
  "high_risk_action_selection_contract_present",
  "static",
  highRisk?.selection?.includeEverySelectedPermission === true &&
    highRisk?.selection?.riskLevels?.includes("high") &&
    highRisk?.selection?.riskLevels?.includes("critical")
      ? "pass"
      : "fail",
  "The capture contract must select every active high/critical permission from the live catalog; live completeness is certified by the corpus gate.",
);

const recoveryApproved = recoveryApprovalComplete(recovery, repositoryRevision);
check(
  "rollback_owner_and_observation_window_approved",
  "approval",
  recoveryApproved ? "pass" : "pending",
  recoveryApproved
    ? "All recovery contracts contain owners, objectives, triggers, and approved observation windows."
    : "Recovery contract still has unassigned owners, objectives, triggers, or observation windows.",
);

const goldenPath = resolve(evidenceDirectory, "golden-decision-corpus.json");
const golden = await optionalJson(goldenPath);
const goldenArtifactCheck = golden
  ? runCommand(
      process.execPath,
      [
        tsxCli,
        "scripts/verify/verify-authorization-golden-corpus.ts",
        `--corpus=${goldenPath}`,
        "--strict",
      ],
      resolve(repositoryRoot, "server/db"),
    )
  : null;
if (!golden) {
  check(
    "all_active_users_in_identity_inventory",
    "live_evidence",
    "pending",
    `Capture ${goldenPath}.`,
  );
  check(
    "golden_corpus_complete",
    "live_evidence",
    "pending",
    "Run the golden corpus exporter against Neon and Mesh at recorded snapshot boundaries.",
  );
} else {
  check(
    "all_active_users_in_identity_inventory",
    "live_evidence",
    golden?.coverage?.gates?.activeNeonPrincipalInventoryNonEmpty === true &&
      golden?.coverage?.gates?.activeNeonUserInventoryNonEmpty === true &&
      golden?.coverage?.gates?.everyActiveNeonPrincipalIncluded === true &&
      golden?.coverage?.gates?.everyActiveNeonUserIncluded === true &&
      golden?.coverage?.gates?.everyActivePrincipalHasIdentityBinding === true &&
      golden?.coverage?.gates?.activeMeshPrincipalInventoryNonEmpty === true &&
      golden?.coverage?.gates?.activeMeshUserInventoryNonEmpty === true &&
      golden?.coverage?.gates?.everyActiveMeshPrincipalHasIdentityBinding === true &&
      golden?.coverage?.gates?.identityAuthorityReconciled === true &&
      goldenArtifactCheck?.passed === true
      ? "pass"
      : "fail",
    "Every enabled external user and active Neon/Mesh principal must reconcile to an exact preserved plane-local identity binding.",
  );
  check(
    "golden_corpus_complete",
    "live_evidence",
    goldenArtifactCheck?.passed === true ? "pass" : "fail",
    goldenArtifactCheck?.passed === true
      ? "The independent strict verifier recomputed all 24 identity/action/engine/context/provenance gates."
      : `Golden corpus verification failed: ${goldenArtifactCheck?.detail ?? "unreported"}.`,
  );
}

const neonLegacyWrites = await firstOptionalJson([
  resolve(evidenceDirectory, "neon-authorization-legacy-writes.json"),
  resolve(evidenceDirectory, "authorization-legacy-writes-neon.json"),
  resolve(evidenceDirectory, "authorization-legacy-writes.json"),
]);
const meshLegacyWrites = await optionalJson(
  resolve(evidenceDirectory, "mesh-authorization-legacy-writes.json"),
);
if (!neonLegacyWrites || !meshLegacyWrites) {
  const missingPlanes = [
    ...(!neonLegacyWrites ? ["neon"] : []),
    ...(!meshLegacyWrites ? ["mesh"] : []),
  ];
  check(
    "no_unknown_live_authorization_writer",
    "live_evidence",
    "pending",
    `Run the plane-local legacy-write telemetry reports after capture is installed for: ${missingPlanes.join(", ")}.`,
  );
  check(
    "authorization_change_capture_live_health",
    "live_evidence",
    "pending",
    `Capture exact source/trigger/stream health for: ${missingPlanes.join(", ")}.`,
  );
} else {
  const neonWriterResult = writerEvidenceResult(neonLegacyWrites, "neon");
  const meshWriterResult = writerEvidenceResult(meshLegacyWrites, "mesh");
  const writerResults = [neonWriterResult, meshWriterResult];
  check(
    "no_unknown_live_authorization_writer",
    "live_evidence",
    writerResults.every((result) => result.writerPassed) ? "pass" : "fail",
    writerResults.every((result) => result.writerPassed)
      ? "Neon and Mesh report zero unknown or ambiguous authorization writers."
      : `Writer blockers: ${writerResults
          .filter((result) => !result.writerPassed)
          .map((result) => `${result.plane}=${result.blockers.join("|")}`)
          .join(", ")}.`,
  );
  check(
    "authorization_change_capture_live_health",
    "live_evidence",
    writerResults.every((result) => result.capturePassed) ? "pass" : "fail",
    writerResults.every((result) => result.capturePassed)
      ? "Both planes reconcile exact source sets, ENABLE ALWAYS triggers, clocks, and transaction envelopes."
      : `Capture blockers: ${writerResults
          .filter((result) => !result.capturePassed)
          .map((result) => `${result.plane}=${result.blockers.join("|")}`)
          .join(", ")}.`,
  );
}

const neonDataQuality = await firstOptionalJson([
  resolve(evidenceDirectory, "neon-authorization-data-quality.json"),
  resolve(evidenceDirectory, "authorization-data-quality-neon.json"),
  resolve(evidenceDirectory, "authorization-data-quality.json"),
]);
const meshDataQuality = await optionalJson(
  resolve(evidenceDirectory, "mesh-authorization-data-quality.json"),
);
if (!neonDataQuality || !meshDataQuality) {
  const missingPlanes = [
    ...(!neonDataQuality ? ["neon"] : []),
    ...(!meshDataQuality ? ["mesh"] : []),
  ];
  check(
    "all_cross_tenant_anomalies_classified",
    "live_evidence",
    "pending",
    `Run the plane-local data-quality reports and approve every deterministic finding fingerprint for: ${missingPlanes.join(", ")}.`,
  );
} else {
  const dataQualityResults = [
    dataQualityEvidenceResult(neonDataQuality, "neon"),
    dataQualityEvidenceResult(meshDataQuality, "mesh"),
  ];
  check(
    "all_cross_tenant_anomalies_classified",
    "live_evidence",
    dataQualityResults.every((result) => result.passed) ? "pass" : "fail",
    dataQualityResults.every((result) => result.passed)
      ? "All Neon tenant and Mesh account-boundary findings are classified, approved, and fully checked."
      : `Data-quality blockers: ${dataQualityResults
          .filter((result) => !result.passed)
          .map((result) => `${result.plane}=${result.blockers.join("|")}`)
          .join(", ")}.`,
  );
}

const liveNeonDisposition = await firstOptionalJson([
  resolve(evidenceDirectory, "data-disposition-coverage-neon.json"),
  resolve(evidenceDirectory, "data-disposition-coverage.json"),
  resolve(evidenceDirectory, "authorization-data-disposition-live-neon.json"),
  resolve(evidenceDirectory, "authorization-data-disposition-live.json"),
]);
const liveMeshDisposition = await firstOptionalJson([
  resolve(evidenceDirectory, "data-disposition-coverage-mesh.json"),
  resolve(evidenceDirectory, "authorization-data-disposition-live-mesh.json"),
]);
if (!liveNeonDisposition || !liveMeshDisposition) {
  const missingPlanes = [
    ...(!liveNeonDisposition ? ["neon"] : []),
    ...(!liveMeshDisposition ? ["mesh"] : []),
  ];
  check(
    "live_database_and_object_disposition_coverage",
    "live_evidence",
    "pending",
    `Capture pg_class, runtime partitions, and external-object evidence for: ${missingPlanes.join(", ")}.`,
  );
} else {
  const neonResult = dispositionEvidenceResult(liveNeonDisposition, "neon");
  const meshResult = dispositionEvidenceResult(liveMeshDisposition, "mesh");
  const planeResults = [neonResult, meshResult];
  check(
    "live_database_and_object_disposition_coverage",
    "live_evidence",
    planeResults.every((result) => result.passed) ? "pass" : "fail",
    planeResults.every((result) => result.passed)
      ? "Every live Neon/Mesh table, partition, and registered external object has one approved disposition."
      : `Disposition blockers: ${planeResults
          .filter((result) => !result.passed)
          .map((result) => `${result.plane}=${result.blockers.join("|")}`)
          .join(", ")}.`,
  );
}

const correlationInputs = [
  golden,
  neonLegacyWrites,
  meshLegacyWrites,
  neonDataQuality,
  meshDataQuality,
  liveNeonDisposition,
  liveMeshDisposition,
];
if (correlationInputs.some((value) => !value)) {
  check(
    "plane_evidence_source_identity_and_watermark_reconciled",
    "live_evidence",
    "pending",
    "Golden, writer, data-quality, and disposition evidence is required from both planes before source boundaries can be reconciled.",
  );
} else {
  const neonCorrelation = planeEvidenceResult("neon", {
    golden: {
      sourceDatabaseId: golden?.capture?.neon?.source_database_id,
      contractVersion: golden?.capture?.neon?.capture_contract_version,
      watermark: golden?.capture?.neon?.capture_watermark,
      databaseName: golden?.capture?.neon?.database_name,
    },
    writer: {
      sourceDatabaseId: neonLegacyWrites?.clock?.source_database_id,
      contractVersion: neonLegacyWrites?.clock?.capture_contract_version,
      watermark: neonLegacyWrites?.clock?.current_watermark,
      databaseName: neonLegacyWrites?.clock?.database_name,
    },
    dataQuality: {
      sourceDatabaseId: neonDataQuality?.database?.source_database_id,
      contractVersion: neonDataQuality?.database?.capture_contract_version,
      watermark: neonDataQuality?.database?.current_watermark,
      databaseName: neonDataQuality?.database?.database_name,
    },
    disposition: {
      sourceDatabaseId:
        liveNeonDisposition?.authorizationCapture?.sourceDatabaseId,
      contractVersion:
        liveNeonDisposition?.authorizationCapture?.contractVersion,
      watermark: liveNeonDisposition?.authorizationCapture?.currentWatermark,
      databaseName: liveNeonDisposition?.database?.database_name,
    },
  });
  const meshCorrelation = planeEvidenceResult("mesh", {
    golden: {
      sourceDatabaseId: golden?.capture?.mesh?.source_database_id,
      contractVersion: golden?.capture?.mesh?.capture_contract_version,
      watermark: golden?.capture?.mesh?.capture_watermark,
      databaseName: golden?.capture?.mesh?.database_name,
    },
    writer: {
      sourceDatabaseId: meshLegacyWrites?.clock?.source_database_id,
      contractVersion: meshLegacyWrites?.clock?.capture_contract_version,
      watermark: meshLegacyWrites?.clock?.current_watermark,
      databaseName: meshLegacyWrites?.databaseIdentity?.database_name,
    },
    dataQuality: {
      sourceDatabaseId:
        meshDataQuality?.captureProvenance?.source_database_id,
      contractVersion:
        meshDataQuality?.captureProvenance?.capture_contract_version,
      watermark: meshDataQuality?.captureProvenance?.current_watermark,
      databaseName: meshDataQuality?.databaseIdentity?.database_name,
    },
    disposition: {
      sourceDatabaseId:
        liveMeshDisposition?.authorizationCapture?.sourceDatabaseId,
      contractVersion:
        liveMeshDisposition?.authorizationCapture?.contractVersion,
      watermark: liveMeshDisposition?.authorizationCapture?.currentWatermark,
      databaseName: liveMeshDisposition?.database?.database_name,
    },
  });
  const crossPlaneBlockers = [
    ...neonCorrelation.blockers.map((blocker) => `neon:${blocker}`),
    ...meshCorrelation.blockers.map((blocker) => `mesh:${blocker}`),
    ...(neonCorrelation.sourceDatabaseId &&
    meshCorrelation.sourceDatabaseId &&
    neonCorrelation.sourceDatabaseId === meshCorrelation.sourceDatabaseId
      ? ["cross_plane:source_database_id_not_distinct"]
      : []),
    ...(neonCorrelation.databaseName &&
    meshCorrelation.databaseName &&
    neonCorrelation.databaseName === meshCorrelation.databaseName
      ? ["cross_plane:database_name_not_distinct"]
      : []),
  ];
  check(
    "plane_evidence_source_identity_and_watermark_reconciled",
    "live_evidence",
    crossPlaneBlockers.length === 0 ? "pass" : "fail",
    crossPlaneBlockers.length === 0
      ? "Every artifact binds to one distinct plane-local source UUID; decision/data-quality boundaries match and later evidence has not moved backwards."
      : `Evidence correlation blockers: ${crossPlaneBlockers.join(", ")}.`,
  );
}

const summary = {
  pass: checks.filter((item) => item.status === "pass").length,
  pending: checks.filter((item) => item.status === "pending").length,
  fail: checks.filter((item) => item.status === "fail").length,
};
const report = {
  schemaVersion: 1,
  strict,
  evidenceDirectory,
  summary,
  productionReady: summary.pending === 0 && summary.fail === 0,
  checks,
};

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (outputArgument) {
  await writeFile(resolve(repositoryRoot, outputArgument), rendered, "utf8");
}
process.stdout.write(rendered);
if (summary.fail > 0 || (strict && summary.pending > 0)) process.exitCode = 1;

function check(id, category, status, detail) {
  checks.push({ id, category, status, detail });
}

async function adrDecisionStatus() {
  const path = resolve(
    repositoryRoot,
    "docs/architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md",
  );
  const text = await readFile(path, "utf8").catch(() => "");
  const required = [
    "Decision 1: physical ownership",
    "Decision 2: zero Mesh-specific-data Neon boundary",
    "Decision 4: evaluator precedence",
    "Decision 5: Admin entitlement semantics",
  ];
  return required.every((value) => text.includes(value)) ? "pass" : "fail";
}

async function rolloutStaticStatus(value) {
  const service = await readFile(
    resolve(repositoryRoot, "server/packages/platform/control-admin/src/authorization-management-service.ts"),
    "utf8",
  ).catch(() => "");
  return value?.supportedModes?.join(",") === "legacy,shadow,enforce" &&
    value?.initialSnapshots?.neon?.defaultMode === "legacy" &&
    value?.initialSnapshots?.studio?.defaultMode === "legacy" &&
    value?.initialSnapshots?.mesh?.defaultMode === "legacy" &&
    value?.failureBehavior?.missingOrMismatchedCertification === "legacy" &&
    ["goldenCorpusSha256", "sourceDatabaseId", "minimumAppliedWatermark"]
      .every((field) => value?.requiredApprovalFields?.includes(field)) &&
    service.includes('options.mutationsEnabled ?? false') &&
    service.includes('selected.mode === "legacy"') &&
    service.includes('selected.mode === "shadow"') &&
    service.includes("requireQualifiedWriterSwitch(writerSwitch)") &&
    service.includes("provider.forExactPlane(planeKey)") &&
    service.includes("state.sourceWatermark !== state.appliedWatermark") &&
    service.includes("state.goldenCorpusSha256")
    ? "pass"
    : "fail";
}

async function staticInvalidationContract() {
  const [tables, functions, triggers] = await Promise.all([
    readFile(
      resolve(repositoryRoot, "server/db/ddl/common/event/03_tables.sql"),
      "utf8",
    ).catch(() => ""),
    readFile(
      resolve(repositoryRoot, "server/db/ddl/common/event/07_functions.sql"),
      "utf8",
    ).catch(() => ""),
    readFile(
      resolve(repositoryRoot, "server/db/ddl/common/authz/08_triggers.sql"),
      "utf8",
    ).catch(() => ""),
  ]);
  const missing = [
    [tables, "CREATE TABLE event.authorization_invalidation_outbox"],
    [tables, "global_epoch"],
    [tables, "tenant_epoch"],
    [tables, "plane_epoch"],
    [functions, "event.fn_authorization_emit_invalidation"],
    [functions, "FOR UPDATE SKIP LOCKED"],
    [triggers, "event.trg_capture_authorization_invalidation"],
    [triggers, "AFTER INSERT OR UPDATE OR DELETE ON authz.%I"],
  ].filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
  return {
    passed: missing.length === 0,
    detail: missing.length === 0 ? "current plane-local invalidation contract verified" : `missing ${missing.join(", ")}`,
  };
}

function collectInventoryUnknowns(value) {
  const requiredGates = [
    "unknownSources",
    "unknownWriters",
    "unownedObjects",
    "unclassifiedWriters",
    "missingDefinitions",
    "generatedArtifactFailures",
    "unknownCaptureSources",
    "staleCaptureSourceRegistrations",
    "duplicateCaptureSources",
    "crossPlaneCaptureSources",
    "unknownKeycloakRestWriters",
    "staleKeycloakRestWriterRules",
  ];
  const blockers = requiredGates
    .filter((name) => !Array.isArray(value?.gates?.[name]))
    .map((name) => `${name}=missing_or_invalid`);
  const candidates = [
    value?.summary?.gates,
    value?.gates,
  ].filter(Boolean);
  const pattern = /(unknown|unowned|unclassified|stale)/i;
  for (const candidate of candidates) {
    for (const [name, result] of Object.entries(candidate)) {
      if (!pattern.test(name)) continue;
      if (Array.isArray(result) && result.length > 0) blockers.push(`${name}=${result.length}`);
      else if (typeof result === "number" && result > 0) blockers.push(`${name}=${result}`);
      else if (result === false) blockers.push(`${name}=false`);
    }
  }
  return blockers;
}

function recoveryApprovalComplete(value, expectedRevision) {
  if (
    value?.status !== "approved" ||
    !nonBlank(expectedRevision) ||
    value?.lastReviewedRevision !== expectedRevision ||
    !Array.isArray(value?.invariants) ||
    value.invariants.length === 0
  ) return false;
  const requiredContractIds = [
    "resolver-read-switch",
    "authorization-writer-switch",
    "fresh-database-business-move",
    "fresh-mesh-database-move",
  ];
  if (
    !Array.isArray(value?.contracts) ||
    value.contracts.length !== requiredContractIds.length ||
    new Set(value.contracts.map((contract) => contract?.id)).size !==
      requiredContractIds.length ||
    !requiredContractIds.every((id) =>
      value.contracts.some((contract) => contract?.id === id)
    )
  ) return false;
  const global = value?.globalApproval;
  if (
    !approvedText(global?.changeOwner) ||
    !approvedText(global?.rollbackOwner) ||
    !approvedText(global?.securityApprover) ||
    !approvedText(global?.dataOwnerApprover) ||
    !approvedText(global?.operationsApprover) ||
    !approvedText(global?.ticket) ||
    !validPastDate(global?.approvedAt)
  ) return false;
  return value.contracts.every((contract) =>
    contract?.approval?.status === "approved" &&
    contract?.approval?.approvedBy?.length > 0 &&
    contract.approval.approvedBy.every(approvedText) &&
    validPastDate(contract?.approval?.approvedAt) &&
    approvedText(contract?.approval?.ticket) &&
    approvedText(contract?.strategy) &&
    (
      !Array.isArray(contract?.allowedStrategies) ||
      contract.allowedStrategies.includes(contract.strategy)
    ) &&
    approvedText(contract?.sourceWriter) &&
    contract?.targetWritable === false &&
    approvedText(contract?.rpo?.target) &&
    nonNegativeInteger(contract?.rpo?.maximumDataLossSeconds) &&
    approvedText(contract?.rpo?.basis) &&
    approvedText(contract?.rto?.target) &&
    positiveInteger(contract?.rto?.maximumRecoveryMinutes) &&
    contract?.rto?.approvalStatus === "approved" &&
    approvedText(contract?.freezeMaximum) &&
    nonNegativeInteger(contract?.freezeMaximumSeconds) &&
    approvedText(contract?.maximumCaptureLag) &&
    nonNegativeInteger(contract?.maximumCaptureLagTransactions) &&
    Array.isArray(contract?.promotionEvidence) &&
    contract.promotionEvidence.length > 0 &&
    contract.promotionEvidence.every(approvedText) &&
    approvedText(contract?.rollback?.mechanism) &&
    approvedText(contract?.rollback?.owner) &&
    approvedText(contract?.rollback?.trigger) &&
    approvedText(contract?.rollback?.deadline) &&
    positiveInteger(contract?.rollback?.deadlineMinutes) &&
    typeof contract?.rollback?.reverseReplayRequired === "boolean" &&
    approvedText(contract?.observationWindow?.duration) &&
    positiveInteger(contract?.observationWindow?.durationMinutes) &&
    validDate(contract?.observationWindow?.startsAt) &&
    validDate(contract?.observationWindow?.endsAt) &&
    Date.parse(contract.observationWindow.endsAt) >
      Date.parse(contract.observationWindow.startsAt) &&
    Date.parse(contract.observationWindow.endsAt) -
      Date.parse(contract.observationWindow.startsAt) >=
      contract.observationWindow.durationMinutes * 60_000 &&
    contract?.observationWindow?.approvalStatus === "approved"
  );
}

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value) {
  return nonBlank(value) && Number.isFinite(Date.parse(value));
}

function validPastDate(value) {
  return validDate(value) && Date.parse(value) <= Date.now();
}

function approvedText(value) {
  return nonBlank(value) &&
    !/\b(?:tbd|todo|pending|unknown|unassigned|placeholder)\b/i.test(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function writerEvidenceResult(report, expectedPlane) {
  const expectedSchema = expectedPlane === "mesh"
    ? "wave0.mesh-authorization-legacy-write-report.v1"
    : "wave0.authorization-legacy-write-report.v1";
  const unknownWriteCount = numericValue(
    report?.summary?.unknownWriteCount ??
      report?.summary?.unknownWriterCount,
  );
  const ambiguousWriterCount = expectedPlane === "neon"
    ? numericValue(report?.summary?.ambiguousWriterBucketCount)
    : 0;
  const expectedSourceCount = numericValue(report?.summary?.expectedSourceCount);
  const registeredSourceCount = numericValue(
    report?.summary?.registeredSourceCount,
  );
  const blockers = [
    ...(report?.schemaVersion !== expectedSchema
      ? [`schema=${report?.schemaVersion ?? "unreported"}`]
      : []),
    ...(report?.plane !== expectedPlane
      ? [`reported_plane=${report?.plane ?? "unreported"}`]
      : []),
    ...(report?.readOnly !== true ? ["not_read_only"] : []),
    ...(unknownWriteCount === 0
      ? []
      : [`unknown_writes=${unknownWriteCount ?? "unreported"}`]),
    ...(ambiguousWriterCount === 0
      ? []
      : [`ambiguous_writers=${ambiguousWriterCount ?? "unreported"}`]),
    ...(
      expectedSourceCount !== null &&
      expectedSourceCount > 0 &&
      registeredSourceCount === expectedSourceCount
        ? []
        : [
            `source_set=${registeredSourceCount ?? "unreported"}/`
              + `${expectedSourceCount ?? "unreported"}`,
          ]
    ),
    ...(report?.gate?.passed === true
      ? []
      : report?.gate?.blockingReasons ?? ["gate_not_passed"]),
  ];
  const writerBlockers = blockers.filter((blocker) =>
    /schema|plane|read_only|unknown|ambiguous/i.test(blocker)
  );
  return {
    plane: expectedPlane,
    writerPassed: writerBlockers.length === 0,
    capturePassed: blockers.length === 0,
    blockers,
  };
}

function dataQualityEvidenceResult(report, expectedPlane) {
  const expectedSchema = expectedPlane === "mesh"
    ? "wave0.mesh-authorization-data-quality-report.v1"
    : "wave0.authorization-data-quality-report.v1";
  const unclassified = numericValue(
    report?.summary?.unclassifiedOrUnresolvedFindingCount ??
      report?.summary?.unclassifiedFindingCount ??
      report?.gate?.unclassifiedFindingCount,
  );
  const blockers = [
    ...(report?.schemaVersion !== expectedSchema
      ? [`schema=${report?.schemaVersion ?? "unreported"}`]
      : []),
    ...(report?.plane !== expectedPlane
      ? [`reported_plane=${report?.plane ?? "unreported"}`]
      : []),
    ...(report?.readOnly !== true ? ["not_read_only"] : []),
    ...(unclassified === 0
      ? []
      : [`unclassified=${unclassified ?? "unreported"}`]),
    ...(report?.gate?.passed === true
      ? []
      : report?.gate?.blockingReasons ?? ["gate_not_passed"]),
  ];
  return {
    plane: expectedPlane,
    passed: blockers.length === 0,
    blockers,
  };
}

function planeEvidenceResult(plane, evidence) {
  const expectedContractVersion = plane === "mesh"
    ? "wave0.mesh-authz-capture.v1"
    : "wave0.authz-capture.v1";
  const entries = Object.entries(evidence);
  const blockers = [];
  for (const [label, boundary] of entries) {
    if (!uuidValue(boundary?.sourceDatabaseId)) {
      blockers.push(`${label}_source_database_id_invalid`);
    }
    if (boundary?.contractVersion !== expectedContractVersion) {
      blockers.push(`${label}_capture_contract_invalid`);
    }
    if (watermarkValue(boundary?.watermark) === null) {
      blockers.push(`${label}_watermark_invalid`);
    }
    if (!nonBlank(boundary?.databaseName)) {
      blockers.push(`${label}_database_name_invalid`);
    }
  }
  const sourceDatabaseIds = new Set(
    entries.map(([, boundary]) => boundary?.sourceDatabaseId).filter(uuidValue),
  );
  const databaseNames = new Set(
    entries.map(([, boundary]) => boundary?.databaseName).filter(nonBlank),
  );
  if (sourceDatabaseIds.size !== 1) blockers.push("source_database_id_mismatch");
  if (databaseNames.size !== 1) blockers.push("database_name_mismatch");

  const goldenWatermark = watermarkValue(evidence.golden?.watermark);
  const dataQualityWatermark = watermarkValue(evidence.dataQuality?.watermark);
  const writerWatermark = watermarkValue(evidence.writer?.watermark);
  const dispositionWatermark = watermarkValue(evidence.disposition?.watermark);
  if (
    goldenWatermark !== null &&
    dataQualityWatermark !== null &&
    goldenWatermark !== dataQualityWatermark
  ) {
    blockers.push("golden_data_quality_watermark_mismatch");
  }
  if (
    goldenWatermark !== null &&
    writerWatermark !== null &&
    writerWatermark < goldenWatermark
  ) {
    blockers.push("writer_watermark_precedes_golden");
  }
  if (
    goldenWatermark !== null &&
    dispositionWatermark !== null &&
    dispositionWatermark < goldenWatermark
  ) {
    blockers.push("disposition_watermark_precedes_golden");
  }
  return {
    plane,
    blockers,
    sourceDatabaseId:
      sourceDatabaseIds.size === 1 ? [...sourceDatabaseIds][0] : null,
    databaseName: databaseNames.size === 1 ? [...databaseNames][0] : null,
  };
}

function uuidValue(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function watermarkValue(value) {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !/^\d+$/.test(String(value))
  ) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function dispositionEvidenceResult(report, expectedPlane) {
  const unknown = numericValue(
    report?.summary?.unmatched ??
      report?.summary?.unclassified ??
      report?.gates?.unmatchedCount,
  );
  const multiple = numericValue(
    report?.summary?.multiplyMatched ??
      report?.gates?.multiplyMatchedCount,
  );
  const blockers = [
    ...(report?.plane !== expectedPlane
      ? [`reported_plane=${report?.plane ?? "unreported"}`]
      : []),
    ...(report?.gate?.passed === true
      ? []
      : report?.gate?.blockingReasons ?? ["gate_not_passed"]),
    ...(unknown === 0 ? [] : [`unmatched=${unknown ?? "unreported"}`]),
    ...(multiple === 0
      ? []
      : [`multiplyMatched=${multiple ?? "unreported"}`]),
  ];
  return {
    plane: expectedPlane,
    passed: blockers.length === 0,
    blockers,
  };
}

async function requiredJson(path, label) {
  const value = await optionalJson(path);
  if (!value) {
    check(`missing_${label.replaceAll(/\W+/g, "_")}`, "static", "fail", `Missing ${path}.`);
  }
  return value;
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function firstOptionalJson(paths) {
  for (const path of paths) {
    const value = await optionalJson(path);
    if (value) return value;
  }
  return null;
}

function argumentValue(prefix) {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  const detail = [
    result.error?.message,
    result.stderr?.trim(),
    result.stdout?.trim(),
  ].filter(Boolean).join(" | ");
  return {
    passed: result.status === 0 && !result.error,
    detail: detail || `exit=${result.status ?? "unknown"}`,
  };
}

function currentGitRevision(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && !result.error ? result.stdout.trim() : null;
}
