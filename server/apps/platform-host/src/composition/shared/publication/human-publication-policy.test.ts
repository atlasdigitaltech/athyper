import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { parseHumanReviewedExecutionPolicy, type HumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { parseEnrollablePublicationPolicy, parsePublicationPolicyProposal } from "./enrollment-contract.js";
function fixture(): HumanReviewedExecutionPolicy {
  const publisher = randomUUID();
  return { schema: "athyper.dev-human-reviewed-publication/1", environment: "local", instance: "dev",
    authorityTenantId: randomUUID(), policyId: "test.human-publication", revision: 1,
    authorPrincipalId: randomUUID(), publisherPrincipalId: publisher,
    compiler: { name: "entity-runtime", version: "1", buildHash: "a".repeat(64) }, predecessors: [],
    plan: { schema: "athyper.human-reviewed-publication-plan/1", publisherId: publisher, members: [{
      changeSetId: randomUUID(), entityId: randomUUID(), revision: 3, sourceReleaseId: null,
      contractHash: "b".repeat(64), descriptorHash: "c".repeat(64), authorId: randomUUID(), reviewerId: randomUUID(),
      targets: [{ plane: "neon", contractHash: "b".repeat(64), descriptorHash: "c".repeat(64) }],
    }] } };
}
it("accepts exact Neon-only human sources through the separate proposal parser", () => {
  const policy = fixture(); expect(parsePublicationPolicyProposal(policy)).toEqual(policy);
  expect(() => parseEnrollablePublicationPolicy(policy)).toThrow();
});
it.each(["author", "reviewer"])("rejects a %s reused as either workload", actor => {
  for (const key of ["authorPrincipalId", "publisherPrincipalId"] as const) {
    const p = fixture(), member = p.plan.members[0]!;
    const changed = { ...p, [key]: actor === "author" ? member.authorId : member.reviewerId };
    expect(() => parseHumanReviewedExecutionPolicy(changed)).toThrow();
  }
});
it("rejects unknown fields, duplicate members, widened targets and unpinned successors", () => {
  const p = fixture();
  for (const changed of [ { ...p, bypass: true }, { ...p, instance: "production" },
    { ...p, plan: { ...p.plan, members: [...p.plan.members, ...p.plan.members] } },
    { ...p, plan: { ...p.plan, members: [{ ...p.plan.members[0], sourceReleaseId: randomUUID() }] } },
    { ...p, plan: { ...p.plan, members: [{ ...p.plan.members[0], targets: [{ ...p.plan.members[0]!.targets[0], tenantId: randomUUID() }] }] } },
  ]) expect(() => parseHumanReviewedExecutionPolicy(changed)).toThrow();
});
