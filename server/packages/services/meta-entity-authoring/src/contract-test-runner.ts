import { createHash } from "node:crypto";
import type {
  MetaEntityContractTestCaseDraft,
  MetaEntityDiagnostic,
  MetaEntityPhase2Graph,
} from "@athyper/meta-entity-authoring-contracts";
import { canonicalizeMetaEntityGraph, validateMetaEntityGraph } from "./meta-entity-graph.js";

export const META_ENTITY_CONTRACT_RUNNER_CODE = "athyper.meta_entity.contract_test";
export const META_ENTITY_CONTRACT_RUNNER_VERSION = "1.0.0";

export interface ContractTestExecutionResult {
  testCase: MetaEntityContractTestCaseDraft;
  ordinal: number;
  actualOutcome: "pass" | "fail" | "warning" | "error";
  assertionPassed: boolean;
  diagnostics: readonly MetaEntityDiagnostic[];
  actualOutput: Readonly<Record<string, unknown>>;
  durationMs: number;
  definitionHash: string;
  resultHash: string;
}

export interface ContractTestExecution {
  canonicalContract: unknown;
  sourceContractHash: string;
  status: "passed" | "failed" | "error";
  durationMs: number;
  results: readonly ContractTestExecutionResult[];
  runHash: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function diagnostic(code: string, message: string, objectId?: string): MetaEntityDiagnostic {
  return { id: `${code}:${objectId ?? "contract"}`, code, severity: "error", message, section: "tests", objectId };
}

function validateRecord(graph: MetaEntityPhase2Graph, test: MetaEntityContractTestCaseDraft): MetaEntityDiagnostic[] {
  const record = test.inputContext.record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return [diagnostic("test.input.record.required", "Validation tests require an object at inputContext.record.", test.id)];
  }
  const values = record as Record<string, unknown>;
  const diagnostics: MetaEntityDiagnostic[] = [];
  for (const field of graph.fields.filter((item) => item.status === "active")) {
    const value = values[field.fieldKey];
    const required = field.cardinality === "one" && field.valueOrigin === "stored"
      && field.writeMode !== "read_only" && field.defaultSpec === null && field.computationSpec === null;
    if (required && (value === undefined || value === null || value === "")) {
      diagnostics.push(diagnostic(`field.${field.fieldKey}.required`, `${field.fieldKey} is required.`, field.id));
      continue;
    }
    if (value == null) continue;
    const config = field.typeConfig;
    if ((config.kind === "string" || config.kind === "text") && typeof value === "string") {
      if (config.minLength != null && value.length < config.minLength) diagnostics.push(diagnostic(`field.${field.fieldKey}.min_length`, `${field.fieldKey} is shorter than ${config.minLength}.`, field.id));
      if (config.maxLength != null && value.length > config.maxLength) diagnostics.push(diagnostic(`field.${field.fieldKey}.max_length`, `${field.fieldKey} is longer than ${config.maxLength}.`, field.id));
      if (config.pattern && !new RegExp(config.pattern).test(value)) diagnostics.push(diagnostic(`field.${field.fieldKey}.pattern`, `${field.fieldKey} does not match its contract pattern.`, field.id));
    }
    if ((config.kind === "integer" || config.kind === "bigint" || config.kind === "decimal") && typeof value === "number") {
      if (config.minimum != null && value < config.minimum) diagnostics.push(diagnostic(`field.${field.fieldKey}.minimum`, `${field.fieldKey} is below its minimum.`, field.id));
      if (config.maximum != null && value > config.maximum) diagnostics.push(diagnostic(`field.${field.fieldKey}.maximum`, `${field.fieldKey} exceeds its maximum.`, field.id));
    }
  }
  return diagnostics;
}

function executeCase(graph: MetaEntityPhase2Graph, test: MetaEntityContractTestCaseDraft): { outcome: ContractTestExecutionResult["actualOutcome"]; diagnostics: MetaEntityDiagnostic[]; output: Record<string, unknown> } {
  if (test.targetPlane && graph.runtimeProfile.storagePlane && test.targetPlane !== graph.runtimeProfile.storagePlane) {
    const diagnostics = [diagnostic("test.target_plane.mismatch", `Fixture targets ${test.targetPlane}, but the runtime profile stores in ${graph.runtimeProfile.storagePlane}.`, test.id)];
    return { outcome: "error", diagnostics, output: { targetPlane: test.targetPlane, storagePlane: graph.runtimeProfile.storagePlane } };
  }
  if (test.testKind === "validation") {
    const diagnostics = validateRecord(graph, test);
    return { outcome: diagnostics.length ? "fail" : "pass", diagnostics, output: { validatedFieldCount: graph.fields.length } };
  }
  if (test.testKind === "compilation") {
    const diagnostics = validateMetaEntityGraph(graph).filter((item) => item.severity === "error");
    return { outcome: diagnostics.length ? "fail" : "pass", diagnostics, output: { contractHash: hash(canonicalizeMetaEntityGraph(graph)) } };
  }
  if (test.testKind === "compatibility") {
    const diagnostics = [diagnostic("test.compatibility.baseline_required", "Compatibility execution requires a selected immutable baseline revision.", test.id)];
    diagnostics[0] = { ...diagnostics[0]!, severity: "warning" };
    return { outcome: "warning", diagnostics, output: { baselineRevisionId: null } };
  }
  const operation = graph.operations.find((item) => item.id === test.operationId && item.status === "active");
  const diagnostics: MetaEntityDiagnostic[] = [];
  if (!operation) diagnostics.push(diagnostic("test.operation.not_found", "The active operation referenced by this fixture does not exist.", test.id));
  const flowExists = test.flowId == null || graph.flows.some((item) => item.id === test.flowId && item.status === "active");
  if (!flowExists) diagnostics.push(diagnostic("test.flow.not_found", "The active flow referenced by this fixture does not exist.", test.id));
  if (operation) {
    const rules = graph.operationRules.filter((item) => item.operationId === operation.id && item.status === "active"
      && (item.planeCode == null || item.planeCode === test.targetPlane));
    const capabilities = ((test.inputContext.actor as { capabilities?: unknown } | undefined)?.capabilities ?? []) as unknown;
    const granted = Array.isArray(capabilities) ? capabilities.filter((item): item is string => typeof item === "string") : [];
    const applicable = rules.filter((rule) => !rule.requiredCapabilityCode || granted.includes(rule.requiredCapabilityCode));
    if (rules.some((rule) => rule.requiredCapabilityCode) && !applicable.length) diagnostics.push(diagnostic("test.operation.capability_denied", "The fixture actor does not satisfy an operation capability rule.", test.id));
    if (applicable.some((rule) => rule.decision === "deny")) diagnostics.push(diagnostic("test.operation.rule_denied", "An applicable operation rule denied execution.", test.id));
  }
  return { outcome: diagnostics.length ? "fail" : "pass", diagnostics, output: { operationKey: operation?.operationKey ?? null, flowResolved: flowExists } };
}

export function runMetaEntityContractTests(graph: MetaEntityPhase2Graph): ContractTestExecution {
  const started = performance.now();
  const canonicalContract = canonicalizeMetaEntityGraph(graph);
  const sourceContractHash = hash(canonicalContract);
  const activeTests = graph.testCases.filter((test) => test.status === "active").sort((a, b) => a.testKey.localeCompare(b.testKey));
  const results = activeTests.map((test, ordinal) => {
    const caseStarted = performance.now();
    let evaluated: ReturnType<typeof executeCase>;
    try { evaluated = executeCase(graph, test); }
    catch (error) { evaluated = { outcome: "error", diagnostics: [diagnostic("test.runner.error", error instanceof Error ? error.message : "Contract test execution failed.", test.id)], output: {} }; }
    const diagnosticCodes = evaluated.diagnostics.map((item) => item.code).sort();
    const expectedCodes = [...test.expectedDiagnosticCodes].sort();
    const assertionPassed = evaluated.outcome === test.expectedOutcome && expectedCodes.every((code) => diagnosticCodes.includes(code));
    const definitionHash = hash(test);
    const durationMs = Math.max(0, Math.round(performance.now() - caseStarted));
    const resultHash = hash({ definitionHash, actualOutcome: evaluated.outcome, assertionPassed, diagnostics: evaluated.diagnostics, actualOutput: evaluated.output });
    return { testCase: test, ordinal, actualOutcome: evaluated.outcome, assertionPassed, diagnostics: evaluated.diagnostics, actualOutput: evaluated.output, durationMs, definitionHash, resultHash };
  });
  const status = results.some((item) => item.actualOutcome === "error") ? "error" : results.every((item) => item.assertionPassed) ? "passed" : "failed";
  const durationMs = Math.max(0, Math.round(performance.now() - started));
  return { canonicalContract, sourceContractHash, status, durationMs, results, runHash: hash({ sourceContractHash, runner: META_ENTITY_CONTRACT_RUNNER_VERSION, results: results.map((item) => item.resultHash) }) };
}
