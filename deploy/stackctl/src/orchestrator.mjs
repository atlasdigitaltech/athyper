import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hostQualificationPath, qualificationRoot } from "./qualification.mjs";
import { readYaml } from "./io.mjs";
import { createValidator } from "./schema.mjs";

const RUNTIME_GATES = Object.freeze({
  phase8DevParity: "DEV functional parity",
  phase9QaIsolation: "two repeatable QA isolation cycles",
  phase10StgRehearsal: "STG backup/migration/restore rehearsal",
});

function loadJsonEvidence(path, validate, blockers, label, evidenceIo) {
  if (!evidenceIo.exists(path)) {
    blockers.push(`${label} evidence is absent: ${path}.`);
    return null;
  }
  try {
    return validate(JSON.parse(evidenceIo.read(path, "utf8")), path);
  } catch (error) {
    blockers.push(`${label} evidence is invalid: ${error.message}.`);
    return null;
  }
}

export function assessOrchestrator(repoRoot, evidence = {}) {
  const validate = createValidator(repoRoot);
  const contractPath = join(repoRoot, "deploy/orchestration/k3s-decision.yaml");
  const contract = validate(readYaml(contractPath), contractPath);
  const blockers = [];
  const qualificationPath = evidence.qualificationPath ?? hostQualificationPath();
  const evidenceRoot = evidence.qualificationRoot ?? qualificationRoot();
  const evidenceIo = {
    exists: evidence.exists ?? existsSync,
    read: evidence.read ?? readFileSync,
    readYaml: evidence.readYaml ?? readYaml,
  };
  if (!evidenceIo.exists(qualificationPath)) {
    blockers.push(`Machine phase evidence is absent: ${qualificationPath}.`);
  } else {
    try {
      const phaseDocument = evidenceIo.readYaml(qualificationPath);
      if (!phaseDocument || typeof phaseDocument !== "object") throw new Error("expected a YAML mapping");
      const phaseStatus = phaseDocument.status ?? {};
      for (const [id, label] of Object.entries(RUNTIME_GATES)) {
        if (!String(phaseStatus[id] ?? "absent").startsWith("complete-runtime")) {
          blockers.push(`${label} has not passed (${id}=${String(phaseStatus[id] ?? "absent")}).`);
        }
      }
    } catch (error) {
      blockers.push(`Machine phase evidence is invalid: ${error.message}.`);
    }
  }

  const composeAcceptancePath = join(evidenceRoot, contract.spec.composeAcceptanceEvidence);
  const topologyRequirementPath = join(evidenceRoot, contract.spec.topologyRequirementEvidence);
  const composeAcceptance = loadJsonEvidence(
    composeAcceptancePath,
    validate,
    blockers,
    "Compose acceptance",
    evidenceIo,
  );
  const topologyRequirement = loadJsonEvidence(
    topologyRequirementPath,
    validate,
    blockers,
    "Approved multi-host topology requirement",
    evidenceIo,
  );
  for (const [label, timestamp] of [
    ["Compose acceptance", composeAcceptance?.metadata.recordedAt],
    ["Topology approval", topologyRequirement?.metadata.approvedAt],
  ]) {
    if (timestamp && !Number.isFinite(Date.parse(timestamp))) {
      blockers.push(`${label} timestamp is invalid.`);
    }
  }

  const eligible = blockers.length === 0;
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "OrchestratorAssessment",
    metadata: { contract: contract.metadata.id },
    readOnly: true,
    executionAuthorized: false,
    status: eligible ? "eligible-for-k3s-design-review" : "deferred",
    recommendation: eligible
      ? "Begin an explicitly approved remote K3s architecture design review; do not deploy automatically."
      : "Keep Docker Compose as the active single-host orchestrator.",
    blockers,
    evidence: {
      machinePhases: qualificationPath,
      composeAcceptance: composeAcceptancePath,
      topologyRequirement: topologyRequirementPath,
    },
    policy: {
      currentOrchestrator: contract.spec.currentOrchestrator,
      candidateOrchestrator: contract.spec.candidateOrchestrator,
      laptopK3sAllowed: false,
      dockerDesktopKubernetesAllowed: false,
      automaticMigrationAllowed: false,
      requiredRuntimeGates: Object.values(RUNTIME_GATES),
      approvedMultiHostNeedRequired: true,
    },
    prohibitedOutputsWhileDeferred: [
      "K3s installation",
      "Kubernetes manifests or Helm releases presented as deployable",
      "Docker Desktop Kubernetes enablement",
      "cluster credentials, tokens, or kubeconfig",
      "workload or persistent-volume mutation",
    ],
    actions: ["No action: this command only assesses the Compose-to-K3s decision gate."],
  };
}
