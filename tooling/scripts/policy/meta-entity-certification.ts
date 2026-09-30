export type CertificationStatus = "PASS" | "FAIL" | "PENDING";

export interface MetaEntityCertificationDefinition {
  schemaVersion: 1;
  requiredCriteria: string[];
  gates: Array<{
    id: string;
    dependsOn: string[];
    criteria: string[];
    unlocks: string[];
  }>;
  criteria: Array<{
    id: string;
    statement: string;
    evidence: string[];
  }>;
}

export interface MetaEntityCertificationSnapshot {
  schemaVersion: 1;
  releaseId: string;
  evaluatedAt: string;
  criteria: Record<string, {
    status: CertificationStatus;
    evidence: string[];
  }>;
}

export interface MetaEntityCertificationDecision {
  decision: "CERTIFIED" | "NOT_CERTIFIED";
  failures: string[];
  gates: Record<string, "READY" | "BLOCKED">;
}

export function validateCertificationDefinition(
  definition: MetaEntityCertificationDefinition,
): string[] {
  const failures: string[] = [];
  const criterionIds = new Set(definition.criteria.map((criterion) => criterion.id));
  const gateIds = new Set(definition.gates.map((gate) => gate.id));
  if (definition.schemaVersion !== 1) failures.push("Unsupported definition schemaVersion.");
  if (criterionIds.size !== definition.criteria.length) failures.push("Criterion IDs must be unique.");
  if (gateIds.size !== definition.gates.length) failures.push("Gate IDs must be unique.");
  for (const id of definition.requiredCriteria) {
    if (!criterionIds.has(id)) failures.push(`Required criterion '${id}' is not defined.`);
  }
  for (const criterion of definition.criteria) {
    if (!criterion.statement.trim()) failures.push(`${criterion.id}: statement is required.`);
    if (criterion.evidence.length === 0) failures.push(`${criterion.id}: evidence contract is empty.`);
  }
  for (const gate of definition.gates) {
    for (const dependency of gate.dependsOn) {
      if (!gateIds.has(dependency)) failures.push(`${gate.id}: unknown dependency '${dependency}'.`);
    }
    for (const criterion of gate.criteria) {
      if (!criterionIds.has(criterion)) failures.push(`${gate.id}: unknown criterion '${criterion}'.`);
    }
    for (const unlocked of gate.unlocks) {
      if (!gateIds.has(unlocked)) failures.push(`${gate.id}: unknown unlock '${unlocked}'.`);
    }
  }
  if (hasDependencyCycle(definition)) failures.push("Certification gate dependency graph contains a cycle.");
  return failures;
}

export function evaluateMetaEntityCertification(
  definition: MetaEntityCertificationDefinition,
  snapshot: MetaEntityCertificationSnapshot,
): MetaEntityCertificationDecision {
  const failures = validateCertificationDefinition(definition);
  const gates: Record<string, "READY" | "BLOCKED"> = {};
  if (snapshot.schemaVersion !== 1) failures.push("Unsupported snapshot schemaVersion.");
  if (!snapshot.releaseId.trim()) failures.push("releaseId is required.");
  if (Number.isNaN(Date.parse(snapshot.evaluatedAt))) failures.push("evaluatedAt must be an ISO timestamp.");

  for (const id of definition.requiredCriteria) {
    const result = snapshot.criteria[id];
    const criterion = definition.criteria.find((item) => item.id === id);
    if (!result) {
      failures.push(`${id}: result is missing.`);
    } else if (result.status !== "PASS") {
      failures.push(`${id}: status is ${result.status}.`);
    } else if (result.evidence.length === 0) {
      failures.push(`${id}: PASS requires evidence.`);
    } else {
      const missingEvidence = criterion?.evidence.filter(
        (required) => !result.evidence.includes(required),
      ) ?? [];
      if (missingEvidence.length > 0) {
        failures.push(`${id}: missing required evidence ${missingEvidence.join(", ")}.`);
      }
    }
  }
  for (const id of Object.keys(snapshot.criteria)) {
    if (!definition.requiredCriteria.includes(id)) failures.push(`${id}: result is not defined.`);
  }

  const unresolved = new Set(definition.gates.map((gate) => gate.id));
  while (unresolved.size > 0) {
    let progressed = false;
    for (const gate of definition.gates) {
      if (!unresolved.has(gate.id)) continue;
      if (gate.dependsOn.some((dependency) => unresolved.has(dependency))) continue;
      const dependenciesReady = gate.dependsOn.every((dependency) => gates[dependency] === "READY");
      const criteriaPass = gate.criteria.every((id) => {
        const result = snapshot.criteria[id];
        const criterion = definition.criteria.find((item) => item.id === id);
        return result?.status === "PASS"
          && (criterion?.evidence.every((required) => result.evidence.includes(required)) ?? false);
      });
      gates[gate.id] = dependenciesReady && criteriaPass ? "READY" : "BLOCKED";
      unresolved.delete(gate.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  return {
    decision: failures.length === 0
      && definition.gates.every((gate) => gates[gate.id] === "READY")
      ? "CERTIFIED"
      : "NOT_CERTIFIED",
    failures,
    gates,
  };
}

function hasDependencyCycle(definition: MetaEntityCertificationDefinition): boolean {
  const dependencies = new Map(definition.gates.map((gate) => [gate.id, gate.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return definition.gates.some((gate) => visit(gate.id));
}
