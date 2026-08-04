import type { MetaEntityPhase2Graph } from "@athyper/meta-entity-authoring-contracts";
import { describe, expect, it } from "vitest";
import { runMetaEntityContractTests } from "../contract-test-runner.js";

const id = (suffix: string) => `018f0000-0000-7000-8000-${suffix.padStart(12, "0")}`;

function graph(): MetaEntityPhase2Graph {
  return {
    runtimeProfile: { id: id("1"), profileKey: "default", backingKind: "table", storagePlane: "neon",
      storageSchema: "document", storageObject: "business_partner", apiExposure: "api", readMode: "generic",
      writeMode: "generic", readHandlerKey: null, writeHandlerKey: null, createMode: "direct",
      concurrencyMode: "none", recordVersionFieldKey: null, tenantFieldKey: "tenant_id",
      softDeleteFieldKey: null, draftTtlHours: null },
    fields: [{ id: id("2"), fieldKey: "name", dataType: "string", typeConfig: { kind: "string", minLength: 2 },
      cardinality: "one", valueOrigin: "stored", writeMode: "mutable", storagePath: "name", defaultSpec: null,
      computationSpec: null, validationSpec: null, status: "active", keyUsageCount: 0, searchUsageCount: 0,
      relationUsageCount: 0 }],
    keys: [], searchProfiles: [], relations: [], surfaces: [], operations: [], surfaceOperations: [],
    operationRules: [], flows: [], policyBindings: [], fieldPolicyBindings: [],
    testCases: [
      { id: id("10"), testKey: "valid", testKind: "validation", title: "Valid", description: null,
        targetPlane: "neon", operationId: null, flowId: null, inputContext: { record: { name: "Acme" } },
        expectedOutcome: "pass", expectedDiagnosticCodes: [], status: "active" },
      { id: id("11"), testKey: "missing_name", testKind: "validation", title: "Missing name", description: null,
        targetPlane: "neon", operationId: null, flowId: null, inputContext: { record: {} },
        expectedOutcome: "fail", expectedDiagnosticCodes: ["field.name.required"], status: "active" },
    ],
  };
}

describe("Meta Entity contract-test runner", () => {
  it("matches positive and expected-negative fixtures without mutating their definitions", () => {
    const source = graph();
    const before = JSON.stringify(source);
    const run = runMetaEntityContractTests(source);
    expect(run.status).toBe("passed");
    expect(run.results).toHaveLength(2);
    expect(run.results.every((result) => result.assertionPassed)).toBe(true);
    expect(run.results.find((result) => result.testCase.testKey === "missing_name")?.diagnostics)
      .toContainEqual(expect.objectContaining({ code: "field.name.required" }));
    expect(JSON.stringify(source)).toBe(before);
  });

  it("produces content-addressed evidence independent of timing", () => {
    const first = runMetaEntityContractTests(graph());
    const second = runMetaEntityContractTests(graph());
    expect(first.sourceContractHash).toBe(second.sourceContractHash);
    expect(first.runHash).toBe(second.runHash);
    expect(first.results.map((item) => item.resultHash)).toEqual(second.results.map((item) => item.resultHash));
  });
});
