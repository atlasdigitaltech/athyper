import { describe, expect, it } from "vitest";
import { classifyDevPublicationChange } from "../shared/policy/classify-change.js";

const target = { tenantId: "11111111-1111-4111-8111-111111111111", plane: "neon", entityCode: "reference_example" };
const policy = { schema: "athyper.dev-publication-policy/1", environment: "dev", mode: "assessment_only", policyId: "reference.presentation", revision: 1,
  targets: [target], allowedChanges: ["labels", "page_size", "default_sort", "visible_column_order"], maxLabelLength: 80 };
function graph() {
  return {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "reference_example", entityClass: "reference", ownershipModel: "system" },
    runtimeProfiles: [{ backingKind: "table", storagePlane: "neon", storageSchema: "shared", storageObject: "reference_example", readMode: "generic", writeMode: "none" }],
    fields: ["code", "name", "hidden"].map(key => ({ id: key, fieldKey: key, label: key, valueOrigin: "stored", writeMode: "read_only", dataClassification: "public" })),
    operations: [{ id: "read", operationKey: "read", operationKind: "read" }],
    operationPermissions: [{ entityOperationId: "read", permissionCode: "common.platform.reference.view", permissionKind: "capability", targetPlane: "neon" }],
    operationScopeBindings: [{ entityOperationId: "read", targetPlane: "neon", scopeKind: "tenant", coordinateSource: "tenant_context", missingValueBehavior: "deny" }],
    surfaces: [{ id: "list", surfaceKind: "list", title: "Reference", layoutConfig: {
      referenceCapability: "common.platform.reference.view", limits: { defaultPageSize: 25, allowedPageSizes: [10, 25, 50], maxSortLevels: 2 },
      defaultState: { sort: [{ field: "name", direction: "asc" }] },
      authorization: { fieldPolicies: [{ fields: ["code", "name"], queryUses: ["sort"] }] },
    } }],
    surfaceFieldBindings: ["code", "name", "hidden"].map((key, position) => ({ bindingKey: key, entitySurfaceId: "list", entityFieldId: key, labelOverride: key, position, displayConfig: { defaultVisible: key !== "hidden" } })),
    capabilities: [{ capabilityKey: "comments", binding: { maxTextLength: 5000, defaultAudience: "private", scanRequired: true } }],
  };
}
function assess(candidate: unknown, overrides: Record<string, unknown> = {}) {
  return classifyDevPublicationChange({ policy, baseline: graph(), candidate, target,
    initiatingPrincipalId: "22222222-2222-4222-8222-222222222222", assessorId: "33333333-3333-4333-8333-333333333333",
    assessedAt: "2026-09-26T10:00:00.000Z", ...overrides });
}
describe("structural DEV assessment without authority", () => {
  it("is deterministic, immutable and binds complete inputs", () => {
    const candidate = graph(); candidate.fields[0]!.label = "Code";
    const input = JSON.stringify(candidate), result = assess(candidate);
    expect(result.outcome).toBe("eligible"); expect(result.authority).toBe("none");
    expect(result.changedPaths).toEqual(["/fields/0/label"]);
    expect(result.candidateHash).not.toBe(result.baselineHash);
    expect(assess(candidate)).toEqual(result);
    expect(JSON.stringify(candidate)).toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    const reversed = Object.fromEntries(Object.entries(candidate).reverse());
    expect(assess(reversed)).toEqual(result);
    expect(assess(candidate, { policy: { ...policy, revision: 2 } }).policyHash).not.toBe(result.policyHash);
  });
  it.each([
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.title = "Reference data"; },
    (g: ReturnType<typeof graph>) => { g.surfaceFieldBindings[0]!.labelOverride = "Code"; },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.limits.defaultPageSize = 50; },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.defaultState.sort = [{ field: "code", direction: "desc" }]; },
    (g: ReturnType<typeof graph>) => { g.surfaceFieldBindings[0]!.position = 1; g.surfaceFieldBindings[1]!.position = 0; },
  ])("allows only supported presentation changes %#", mutate => {
    const candidate = graph(); mutate(candidate); expect(assess(candidate).outcome).toBe("eligible");
    expect(assess(candidate, { policy: { ...policy, allowedChanges: ["labels"] } }).authority).toBe("none");
  });
  it.each([
    (g: ReturnType<typeof graph>) => { g.contractSchema = "athyper.meta-entity-contract/3.0"; },
    (g: ReturnType<typeof graph>) => { g.runtimeProfiles[0]!.storageObject = "another_table"; },
    (g: ReturnType<typeof graph>) => { g.runtimeProfiles[0]!.writeMode = "generic"; },
    (g: ReturnType<typeof graph>) => { g.fields[0]!.writeMode = "write"; },
    (g: ReturnType<typeof graph>) => { g.fields[0]!.dataClassification = "restricted"; },
    (g: ReturnType<typeof graph>) => { g.operationPermissions[0]!.permissionCode = "common.arbitrary.read"; },
    (g: ReturnType<typeof graph>) => { g.operationScopeBindings[0]!.missingValueBehavior = "allow"; },
    (g: ReturnType<typeof graph>) => { g.capabilities[0]!.binding.defaultAudience = "public"; },
    (g: ReturnType<typeof graph>) => { g.capabilities[0]!.binding.scanRequired = false; },
    (g: ReturnType<typeof graph>) => { g.capabilities = []; },
    (g: ReturnType<typeof graph>) => { g.surfaceFieldBindings[2]!.displayConfig.defaultVisible = true; },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.limits.allowedPageSizes.push(100); },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.defaultState.sort = [{ field: "hidden", direction: "asc" }]; },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.defaultState.sort = [{ field: "code", direction: "invalid" }]; },
    (g: ReturnType<typeof graph>) => { g.surfaces[0]!.layoutConfig.limits.defaultPageSize = 10000; },
    (g: ReturnType<typeof graph>) => { g.surfaceFieldBindings[1]!.position = 0; },
    (g: ReturnType<typeof graph>) => { g.surfaceFieldBindings[2]!.position = 0; },
    (g: ReturnType<typeof graph>) => { g.fields.reverse(); },
    (g: ReturnType<typeof graph>) => { g.fields[0]!.label = "<script>bad</script>"; },
  ])("requires review for security, disclosure, invalid or unsupported changes %#", mutate => {
    const candidate = graph(); candidate.surfaces[0]!.title = "Allowed title"; mutate(candidate);
    const result = assess(candidate); expect(result.outcome).toBe("review_required"); expect(result.reasons.length).toBeGreaterThan(0);
  });
  it("requires review for unknown paths, absent baseline and disabled change classes", () => {
    expect(assess({ ...graph(), futureBinding: { enabled: true } }).reasons).toContain("UNSUPPORTED_CHANGE");
    expect(assess(graph(), { baseline: null }).reasons).toContain("BASELINE_REQUIRED");
    const candidate = graph(); candidate.surfaces[0]!.layoutConfig.limits.defaultPageSize = 50;
    expect(assess(candidate, { policy: { ...policy, allowedChanges: ["labels"] } }).outcome).toBe("review_required");
  });
  it("rejects mismatched target coordinates without entity-name fallbacks", () => {
    expect(assess(graph(), { target: { ...target, tenantId: "44444444-4444-4444-8444-444444444444" } }).reasons).toContain("TARGET_NOT_ENROLLED");
    expect(assess(graph(), { target: { ...target, plane: "mesh" } }).reasons).toContain("REFERENCE_SHAPE_INVALID");
    expect(assess(graph(), { target: { ...target, entityCode: "another_reference" } }).reasons).toContain("TARGET_MISMATCH");
  });
  it("fails closed on malformed policies and non-JSON graphs", () => {
    expect(() => assess(graph(), { policy: { ...policy, mode: "activate" } })).toThrow();
    expect(() => assess(graph(), { policy: { ...policy, environment: "prod" } })).toThrow();
    expect(() => assess({ ...graph(), callback() {} })).toThrow();
    expect(() => assess({ ...graph(), unknown: undefined })).toThrow();
    expect(() => assess(graph(), { assessedAt: "invalid" })).toThrow();
  });
});
