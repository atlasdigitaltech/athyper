import { parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import {
  assertHumanReviewedPublicationPlan, type HumanReviewedPublicationPlan,
} from "@athyper/server-plane-studio-meta-entity-authoring";

/** An execution policy consumes human approvals; its workload identities do not
 * replace the author/reviewer recorded in the approved source. */
export interface HumanReviewedExecutionPolicy {
  readonly schema: "athyper.dev-human-reviewed-publication/1";
  readonly environment: "local";
  readonly instance: "dev";
  readonly authorityTenantId: string;
  readonly policyId: string;
  readonly revision: number;
  readonly authorPrincipalId: string;
  readonly publisherPrincipalId: string;
  readonly compiler: DevEntitySuccessorPolicy["compiler"];
  readonly plan: HumanReviewedPublicationPlan;
  readonly predecessors: readonly DevEntitySuccessorPolicy[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function requirePolicy(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`HUMAN_PUBLICATION_POLICY_${code}`);
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  requirePolicy(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === [...keys].sort().join(), "SCHEMA_INVALID");
}
export function parseHumanReviewedExecutionPolicy(value: unknown): HumanReviewedExecutionPolicy {
  exact(value, ["schema", "environment", "instance", "authorityTenantId", "policyId", "revision", "authorPrincipalId",
    "publisherPrincipalId", "compiler", "plan", "predecessors"]);
  const p = structuredClone(value) as unknown as HumanReviewedExecutionPolicy;
  requirePolicy(p.schema === "athyper.dev-human-reviewed-publication/1" && p.environment === "local" && p.instance === "dev", "DEV_ONLY");
  requirePolicy([p.authorityTenantId, p.authorPrincipalId, p.publisherPrincipalId].every(v => typeof v === "string" && uuid.test(v))
    && p.authorPrincipalId !== p.publisherPrincipalId && /^[a-z][a-z0-9_.-]{1,126}$/.test(p.policyId)
    && Number.isSafeInteger(p.revision) && p.revision > 0, "COORDINATES_INVALID");
  exact(p.plan, ["schema", "publisherId", "members"]);
  assertHumanReviewedPublicationPlan(p.plan);
  requirePolicy(p.plan.publisherId === p.publisherPrincipalId, "PUBLISHER_MISMATCH");
  for (const m of p.plan.members) {
    exact(m, ["changeSetId", "entityId", "revision", "contractHash", "descriptorHash", "sourceReleaseId", "authorId", "reviewerId", "targets"]);
    for (const t of m.targets) exact(t, ["plane", "contractHash", "descriptorHash"]);
    requirePolicy(![m.authorId, m.reviewerId].includes(p.authorPrincipalId), "WORKLOAD_HUMAN_SEPARATION_REQUIRED");
  }
  exact(p.compiler, ["name", "version", "buildHash"]);
  requirePolicy(typeof p.compiler.name === "string" && typeof p.compiler.version === "string"
    && /^[a-f0-9]{64}$/.test(p.compiler.buildHash), "COMPILER_INVALID");
  requirePolicy(Array.isArray(p.predecessors), "PREDECESSORS_REQUIRED");
  const predecessors = p.predecessors.map(parseDevEntitySuccessorPolicy);
  requirePolicy(new Set(predecessors.map(s => s.changeSetId)).size === predecessors.length
    && predecessors.length === p.plan.members.filter(m => m.sourceReleaseId !== null).length, "PREDECESSORS_AMBIGUOUS");
  for (const s of predecessors) {
    const m = p.plan.members.find(member => member.changeSetId === s.changeSetId);
    requirePolicy(m && m.entityId === s.entityId && m.sourceReleaseId === s.predecessor.authoringReleaseId
      && m.contractHash === s.contractHash && m.descriptorHash === s.descriptorHash
      && s.authorityTenantId === p.authorityTenantId && s.authorPrincipalId === p.authorPrincipalId
      && s.publisherPrincipalId === p.publisherPrincipalId
      && s.compiler.name === p.compiler.name && s.compiler.version === p.compiler.version && s.compiler.buildHash === p.compiler.buildHash
      && m.targets.map(t => t.plane).sort().join() === s.targets.map(t => t.plane).sort().join(), "PREDECESSOR_MISMATCH");
  }
  return { ...p, predecessors };
}

