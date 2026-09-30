import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readYaml } from "./io.mjs";
import { qualificationRoot as defaultQualificationRoot } from "./qualification.mjs";
import { createValidator } from "./schema.mjs";

const requiredGateIds = Object.freeze([
  "database", "domain-service", "cross-plane", "security-privacy", "ux", "operations", "ownership",
]);

const measurementThresholds = Object.freeze({
  requestFailureRate: "requestFailureRateMax",
  requestP95Milliseconds: "requestP95MillisecondsMax",
  outboxLagSeconds: "outboxLagSecondsMax",
  quarantineCount: "quarantineCountMax",
  iamDrift: "iamDriftMax",
  meshDrift: "meshDriftMax",
  readinessFailures: "readinessFailuresMax",
});

function imageDigests(imageSet) {
  return Object.fromEntries(imageSet.spec.images.map(({ id, reference }) => {
    const digest = String(reference).match(/@sha256:([a-f0-9]{64})$/u)?.[1];
    return [id, digest ?? null];
  }));
}

function sameRecord(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

export function verifyBusinessPartnerCertification(repoRoot, options = {}) {
  const validate = createValidator(repoRoot);
  const contractPath = options.contractPath ?? join(repoRoot, "deploy/releases/business-partner-p9.yaml");
  const contract = validate(readYaml(contractPath), contractPath);
  const blockers = [];
  const gateIds = contract.spec.gates.map(({ id }) => id);
  if (new Set(gateIds).size !== requiredGateIds.length || requiredGateIds.some((id) => !gateIds.includes(id))) {
    blockers.push("Certification contract must declare each P9 gate exactly once.");
  }
  if (new Set(contract.spec.requiredOwners).size !== contract.spec.requiredOwners.length) {
    blockers.push("Certification owner roles must be unique.");
  }

  const imageSetPath = join(repoRoot, contract.spec.sourceImageSet);
  let actualImages = {};
  try {
    const imageSet = validate(readYaml(imageSetPath), imageSetPath);
    actualImages = imageDigests(imageSet);
    if (imageSet.spec.sourceRevision !== contract.spec.sourceRevision) blockers.push("Qualified image-set revision differs from the P9 contract.");
    if (!sameRecord(actualImages, contract.spec.images)) blockers.push("Qualified image digests differ from the P9 contract.");
  } catch (error) {
    blockers.push(`Qualified image set is invalid: ${error.message}.`);
  }

  for (const runbook of contract.spec.runbooks) {
    if (!existsSync(join(repoRoot, runbook))) blockers.push(`Required runbook is absent: ${runbook}.`);
  }

  const root = options.qualificationRoot ?? defaultQualificationRoot();
  const gates = [];
  const evidenceDocuments = new Map();
  for (const gate of contract.spec.gates) {
    const path = join(root, gate.evidence);
    const gateBlockers = [];
    let document;
    if (!existsSync(path)) {
      gateBlockers.push(`Evidence is absent: ${path}.`);
    } else {
      try {
        document = validate(JSON.parse(readFileSync(path, "utf8")), path);
      } catch (error) {
        gateBlockers.push(`Evidence is invalid: ${error.message}.`);
      }
    }
    if (document) {
      evidenceDocuments.set(gate.id, document);
      const { spec } = document;
      if (spec.gate !== gate.id) gateBlockers.push(`Evidence gate is ${spec.gate}; expected ${gate.id}.`);
      if (spec.environment !== gate.environment) gateBlockers.push(`Evidence environment is ${spec.environment}; expected ${gate.environment}.`);
      if (spec.sourceRevision !== contract.spec.sourceRevision) gateBlockers.push("Evidence source revision differs from the P9 contract.");
      if (!sameRecord(spec.images, contract.spec.images)) gateBlockers.push("Evidence image digests differ from the P9 contract.");
      if (!Number.isFinite(Date.parse(spec.recordedAt))) gateBlockers.push("Evidence timestamp is invalid.");
      for (const check of gate.requiredChecks) {
        if (spec.checks[check] !== true) gateBlockers.push(`Required check did not pass: ${check}.`);
      }
      if (gate.id === "operations") {
        for (const [measurement, threshold] of Object.entries(measurementThresholds)) {
          const value = spec.measurements?.[measurement];
          if (!Number.isFinite(value)) gateBlockers.push(`Canary measurement is absent: ${measurement}.`);
          else if (value > contract.spec.thresholds[threshold]) gateBlockers.push(`Canary measurement exceeds ${threshold}: ${value}.`);
        }
        if (!spec.canary) gateBlockers.push("Canary cohort evidence is absent.");
        else {
          if (spec.canary.cohortPercent !== contract.spec.canary.cohortPercent) gateBlockers.push("Canary cohort differs from the contract.");
          if (spec.canary.observationMinutes < contract.spec.canary.minimumObservationMinutes) gateBlockers.push("Canary observation window is too short.");
        }
        if (!spec.rollback) gateBlockers.push("Exact rollback evidence is absent.");
        else if (spec.rollback.retainedImageSetSha256 !== spec.rollback.restoredImageSetSha256) gateBlockers.push("Rollback did not restore the exact retained image-set revision.");
      }
      if (gate.id === "ownership") {
        const approvals = spec.approvals ?? [];
        const roles = approvals.map(({ role }) => role);
        const names = approvals.map(({ name }) => name.trim().toLocaleLowerCase("en"));
        for (const role of contract.spec.requiredOwners) {
          if (roles.filter((value) => value === role).length !== 1) gateBlockers.push(`Exactly one named approval is required for owner role: ${role}.`);
        }
        if (new Set(names).size !== names.length) gateBlockers.push("Each owner approval must identify a distinct person.");
        for (const approval of approvals) {
          if (!Number.isFinite(Date.parse(approval.recordedAt))) gateBlockers.push(`Owner approval timestamp is invalid: ${approval.role}.`);
        }
      }
    }
    blockers.push(...gateBlockers.map((message) => `${gate.id}: ${message}`));
    gates.push({ id: gate.id, environment: gate.environment, path, status: gateBlockers.length ? "blocked" : "passed", blockers: gateBlockers });
  }

  const stagingTimes = contract.spec.gates
    .filter(({ environment }) => environment === "staging")
    .map(({ id }) => Date.parse(evidenceDocuments.get(id)?.spec.recordedAt ?? ""))
    .filter(Number.isFinite);
  const operationsTime = Date.parse(evidenceDocuments.get("operations")?.spec.recordedAt ?? "");
  const ownership = evidenceDocuments.get("ownership");
  const ownershipTime = Date.parse(ownership?.spec.recordedAt ?? "");
  if (stagingTimes.length && Number.isFinite(operationsTime) && operationsTime < Math.max(...stagingTimes)) {
    blockers.push("operations: Production canary evidence predates staging qualification.");
  }
  if (Number.isFinite(operationsTime) && Number.isFinite(ownershipTime) && ownershipTime < operationsTime) {
    blockers.push("ownership: Release ownership evidence predates production canary evidence.");
  }
  for (const approval of ownership?.spec.approvals ?? []) {
    if (Number.isFinite(operationsTime) && Date.parse(approval.recordedAt) < operationsTime) {
      blockers.push(`ownership: Approval predates production canary evidence: ${approval.role}.`);
    }
  }

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "BusinessPartnerReleaseCertificationReport",
    metadata: { id: contract.metadata.id },
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length ? "blocked" : "certified",
    sourceRevision: contract.spec.sourceRevision,
    images: contract.spec.images,
    gates,
    blockers,
  };
}
