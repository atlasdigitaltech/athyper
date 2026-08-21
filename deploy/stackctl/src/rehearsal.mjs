import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadModel } from "./model.mjs";
import { createPlan } from "./plan.mjs";
import { qualificationRoot } from "./qualification.mjs";
import { readYaml } from "./io.mjs";
import { createValidator } from "./schema.mjs";

function digest(reference) {
  return String(reference).match(/@sha256:([a-f0-9]{64})$/u)?.[1] ?? null;
}

export function createRehearsalPlan(repoRoot, targetInstance, sourceInstance) {
  const contractPath = join(repoRoot, "deploy/rehearsals/stg.yaml");
  const validate = createValidator(repoRoot);
  const contract = validate(readYaml(contractPath), contractPath);
  if (contract.spec.targetInstance !== targetInstance || contract.spec.sourceInstance !== sourceInstance) {
    throw new Error(`Rehearsal contract permits only ${contract.spec.sourceInstance} -> ${contract.spec.targetInstance}.`);
  }

  const sourceModel = loadModel(repoRoot, sourceInstance);
  const targetModel = loadModel(repoRoot, targetInstance);
  if (sourceModel.instance.spec.mode !== "qa" || targetModel.instance.spec.mode !== "staging") {
    throw new Error("Staging rehearsal promotion requires a QA source and staging target.");
  }
  if (targetModel.instance.spec.dataPolicy !== "sanitized") {
    throw new Error("Staging rehearsal target must enforce the sanitized data policy.");
  }

  const sourceDeployment = createPlan(repoRoot, sourceInstance);
  const targetDeployment = createPlan(repoRoot, targetInstance);
  const sourceImages = new Map(sourceModel.imageSet.spec.images.map(({ id, reference }) => [id, reference]));
  const targetImages = new Map(targetModel.imageSet.spec.images.map(({ id, reference }) => [id, reference]));
  const comparisons = contract.spec.promotion.requiredImageIds.map((id) => {
    const sourceReference = sourceImages.get(id) ?? null;
    const targetReference = targetImages.get(id) ?? null;
    const sourceDigest = digest(sourceReference);
    const targetDigest = digest(targetReference);
    return {
      id,
      sourceReference,
      targetReference,
      match: Boolean(sourceDigest && targetDigest && sourceDigest === targetDigest && !/^0{64}$/u.test(sourceDigest)),
    };
  });
  const revisionMatch = sourceModel.imageSet.spec.sourceRevision === targetModel.imageSet.spec.sourceRevision
    && !/^0{40}$/u.test(sourceModel.imageSet.spec.sourceRevision);

  const evidence = {
    sanitizedDataManifest: join(qualificationRoot(), contract.spec.data.manifest),
    preMigrationBackup: join(qualificationRoot(), contract.spec.migration.backupReceipt),
    restoreDrill: join(qualificationRoot(), contract.spec.migration.restoreReceipt),
  };
  const blockers = [
    ...sourceDeployment.blockers.map((message) => `QA source: ${message}`),
    ...targetDeployment.blockers.map((message) => `STG target: ${message}`),
  ];
  const evidenceDocuments = {};
  for (const comparison of comparisons) {
    if (!comparison.match) blockers.push(`Promotion digest mismatch or absence: ${comparison.id}.`);
  }
  if (!revisionMatch) blockers.push("QA and STG source revisions are absent, placeholders, or different.");
  for (const [id, path] of Object.entries(evidence)) {
    if (!existsSync(path)) {
      blockers.push(`Required rehearsal evidence is absent: ${id} (${path}).`);
      continue;
    }
    try {
      evidenceDocuments[id] = validate(JSON.parse(readFileSync(path, "utf8")), path);
    } catch (error) {
      blockers.push(`Rehearsal evidence is invalid: ${id} (${error.message}).`);
    }
  }
  const backup = evidenceDocuments.preMigrationBackup;
  const restore = evidenceDocuments.restoreDrill;
  const sanitized = evidenceDocuments.sanitizedDataManifest;
  for (const [id, timestamp] of [
    ["sanitized data", sanitized?.spec.createdAt],
    ["pre-migration backup", backup?.spec.createdAt],
    ["restore drill", restore?.spec.restoredAt],
  ]) {
    if (timestamp && !Number.isFinite(Date.parse(timestamp))) {
      blockers.push(`Rehearsal evidence has an invalid ${id} timestamp.`);
    }
  }
  if (backup && backup.spec.sourceRevision !== targetModel.imageSet.spec.sourceRevision) {
    blockers.push("Pre-migration backup source revision does not match the STG image set.");
  }
  if (backup && restore && restore.spec.backupSha256 !== backup.spec.database.sha256) {
    blockers.push("Restore drill did not consume the recorded pre-migration backup checksum.");
  }
  if (backup && restore
    && Number.isFinite(Date.parse(restore.spec.restoredAt))
    && Number.isFinite(Date.parse(backup.spec.createdAt))
    && Date.parse(restore.spec.restoredAt) <= Date.parse(backup.spec.createdAt)) {
    blockers.push("Restore drill timestamp does not follow the pre-migration backup timestamp.");
  }

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StagingRehearsalPlan",
    metadata: { sourceInstance, targetInstance },
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length ? "blocked" : "ready-for-explicit-authorization",
    blockers,
    promotion: {
      rebuildAllowed: false,
      exactDigestMatch: comparisons.every(({ match }) => match),
      sourceRevisionMatch: revisionMatch,
      images: comparisons,
    },
    dataPolicy: {
      classification: "sanitized",
      prohibitedContent: contract.spec.data.prohibitedContent,
      manifest: evidence.sanitizedDataManifest,
    },
    integrationPolicy: contract.spec.integrations,
    isolation: {
      project: targetModel.instance.spec.composeProject,
      protectedProjects: ["athyper-dev", "athyper-qa"],
      hostBindings: targetModel.instance.spec.debugPorts,
      domainSuffix: targetModel.instance.spec.domainSuffix,
      receipt: join(qualificationRoot(), "stg", "active-instance-receipt.json"),
    },
    evidence,
    stages: [
      { id: "verify-exact-qa-digests", effect: "read-only" },
      { id: "verify-sanitized-data-manifest", effect: "read-only" },
      { id: "verify-default-deny-integrations", effect: "read-only" },
      { id: "capture-pre-migration-backup", effect: "mutating-stg-backup-only", execution: "deferred-until-backup-runner-exists" },
      { id: "verify-backup-receipt", effect: "read-only" },
      { id: "run-stg-migration", effect: "mutating-stg-only", execution: "deferred-until-migration-runner-exists" },
      { id: "run-stg-smoke-suite", effect: "mutating-stg-only", execution: "deferred-until-test-runner-exists" },
      { id: "restore-backup-into-disposable-target", effect: "mutating-disposable-restore-only", execution: "deferred-until-restore-runner-exists" },
      { id: "verify-restore-receipt", effect: "read-only" },
      { id: "verify-dev-and-qa-fingerprints-unchanged", effect: "read-only" },
    ],
    actions: ["No action: this command only validates and emits the STG rehearsal contract."],
  };
}
