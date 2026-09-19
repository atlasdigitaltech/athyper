export type Rule = { priority: number; condition: unknown; action: string; actionConfig: { schema: string; paths: string[]; effect: string }; metadata: object };
export type Draft = { definition: { name: string; priority: number; evaluationMode: string; effectiveFrom: string; versionNo: number; rules: Rule[] }; tests: { code: string; name: string; input: object; expected: object }[]; predecessorId?: string; processBinding?: unknown };
export type Revision = { definition: Draft["definition"] & { id: string }; tests: Draft["tests"]; status: string; hash: string; proposal?: unknown; release?: { id: string; activated_at: string }; createdBy: string; results: { passed: boolean; definition_hash: string }[] };
export const exampleTaskEditPolicy: Draft = {
  definition: { name: "Supplier returned website correction", priority: 10, evaluationMode: "all", effectiveFrom: "2026-09-15", versionNo: 1, rules: [
    { priority: 10, condition: { "===": [{ var: "request.state" }, "returned"] }, action: "require_workflow", actionConfig: { schema: "athyper.task-edit-result/1", paths: ["/proposedPayload/websiteUrl"], effect: "full_reapproval" }, metadata: {} },
    { priority: 20, condition: { "===": [{ var: "request.before.proposedPayload.requestedComplianceLevel" }, "enhanced"] }, action: "deny", actionConfig: { schema: "athyper.task-edit-result/1", paths: ["/proposedPayload/websiteUrl"], effect: "deny" }, metadata: {} },
  ] },
  tests: [
    { code: "positive", name: "Returned correction", input: { request: { state: "returned" } }, expected: { action: "require_workflow" } },
    { code: "negative", name: "Protected proposal", input: { request: { before: { proposedPayload: { requestedComplianceLevel: "enhanced" } } } }, expected: { action: "deny" } },
    { code: "overlap", name: "Protection wins over correction", input: { request: { state: "returned", before: { proposedPayload: { requestedComplianceLevel: "enhanced" } } } }, expected: { action: "deny" } },
    { code: "missing", name: "Missing facts yield no result", input: {}, expected: { action: "none", outcomes: [] } },
  ],
};
