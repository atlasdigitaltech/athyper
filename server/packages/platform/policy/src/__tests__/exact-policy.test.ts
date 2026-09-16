import { describe, it, expect, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PolicyDefinition } from "@athyper/server-contract-policy";
import {
  createPolicyService,
  createCachedPolicyRepository,
  calculateDefinitionHash,
} from "../index.js";
const context = {
  planeKey: "neon",
  tenantId: "00000000-0000-4000-8000-000000000001",
  principalId: "00000000-0000-4000-8000-000000000002",
} as VerifiedRequestContext;
function setup() {
  const d: PolicyDefinition = {
    id: "00000000-0000-4000-8000-000000000003",
    tenantId: context.tenantId,
    entityType: "supplier_onboarding",
    name: "Requirement",
    priority: 10,
    evaluationMode: "first_match",
    effectiveFrom: "2026-01-01",
    versionNo: 2,
    rules: [
      {
        id: "00000000-0000-4000-8000-000000000004",
        priority: 10,
        condition: {
          "===": [{ var: "request.requestedComplianceLevel" }, "basic"],
        },
        action: "require_workflow",
        actionConfig: { profile: "simple" },
        metadata: {},
      },
    ],
  };
  const definition = { ...d, definitionHash: calculateDefinitionHash(d) };
  const findExact = vi.fn(async () => definition),
    findActive = vi.fn(async () => []);
  const repository = createCachedPolicyRepository({
    repository: { findExact, findActive },
  });
  const policy = createPolicyService({
    repository,
    transactions: { run: async (_plane, _actor, work) => work({}) },
    audit: { record: vi.fn() },
  });
  const request = {
    context,
    entityType: d.entityType,
    facts: { request: { requestedComplianceLevel: "basic" } },
    effectiveOn: "2026-09-14",
    revision: { id: d.id, version: 2, hash: definition.definitionHash },
  };
  return { definition, policy, request, findExact, findActive };
}
describe("exact policy owner evaluation", () => {
  it("uses the pinned version and the existing evaluator, bypassing the active cache on every read", async () => {
    const s = setup();
    for (let i = 0; i < 2; i++)
      expect((await s.policy.evaluateExact(s.request)).decision.action).toBe(
        "require_workflow",
      );
    expect(s.findExact).toHaveBeenCalledTimes(2);
    expect(s.findActive).not.toHaveBeenCalled();
  });
  for (const mutation of [
    "version",
    "hash",
    "content",
    "tenant",
    "entity",
    "date",
  ] as const)
    it(`rejects ${mutation} drift without falling back`, async () => {
      const s = setup();
      if (mutation === "version") s.definition.versionNo++;
      if (mutation === "hash") s.definition.definitionHash = "b".repeat(64);
      if (mutation === "content")
        s.definition.rules = [{ ...s.definition.rules[0]!, action: "allow" }];
      if (mutation === "tenant")
        s.definition.tenantId = "00000000-0000-4000-8000-000000000009";
      if (mutation === "entity") s.definition.entityType = "other";
      if (mutation === "date") s.definition.effectiveFrom = "2099-01-01";
      await expect(s.policy.evaluateExact(s.request)).rejects.toThrow(
        "POLICY_EXACT_REVISION_UNAVAILABLE",
      );
      expect(s.findActive).not.toHaveBeenCalled();
    });
  it("preserves generic no-result semantics for the scoped caller to reject", async () => {
    const s = setup();
    const result = await s.policy.evaluateExact({ ...s.request, facts: {} });
    expect(result.decision).toMatchObject({ action: "none", permitted: true });
    expect(result.trace[0]?.matched).toBe(false);
  });
});

it("refuses to attribute an unversioned injected evaluator to the built-in evaluator", async () => {
  const s = setup();
  const service = createPolicyService({
    repository: {
      findActive: async () => [],
      findExact: async () => s.definition,
    },
    transactions: { run: async (_p, _a, work) => work({}) },
    audit: { record: vi.fn() },
    evaluator: { evaluate: () => true },
  });
  await expect(service.evaluateExact(s.request)).rejects.toThrow(
    "POLICY_EXACT_EVALUATOR_UNVERSIONED",
  );
});
