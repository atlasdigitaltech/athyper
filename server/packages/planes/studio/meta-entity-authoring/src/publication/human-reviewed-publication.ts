import type { AuthoringPlane, MetaEntityChangeSet, MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { MetaEntityAuthoringService } from "../authoring-service.js";
import type { ProductReviewReceipt } from "../product-review.js";
import { compileGraph, sha256 } from "../deterministic.js";
import { compileSystemEntityTarget } from "../compilation/entity-target-compiler.js";

export interface HumanReviewedPublicationMember {
  readonly changeSetId: string;
  readonly entityId: string;
  readonly revision: number;
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly sourceReleaseId: string | null;
  readonly authorId: string;
  readonly reviewerId: string;
  readonly targets: readonly { plane: AuthoringPlane; contractHash: string; descriptorHash: string }[];
}
export interface HumanReviewedPublicationPlan {
  readonly schema: "athyper.human-reviewed-publication-plan/1";
  readonly publisherId: string;
  readonly members: readonly HumanReviewedPublicationMember[];
}
type Source = { changeSet: MetaEntityChangeSet; graph: MetaEntityGraph };
type Target = ReturnType<typeof compileSystemEntityTarget>;
export interface HumanReviewedPublicationPorts {
  /** Authenticates the publishing workload and checks a currently active,
   * independently enrolled policy for the complete plan. Parsing is not authority. */
  authorize(plan: HumanReviewedPublicationPlan): Promise<void>;
  /** Serializes all sources in entity-ID order. The scoped service must still
   * enforce pins under its own release-allocation transaction. */
  locked<T>(entityIds: readonly string[], work: () => Promise<T>): Promise<T>;
  service: Pick<MetaEntityAuthoringService, "readGraph" | "publish">;
  /** Reads durable receipts and verifies current human identity/authority.
   * Must never accept receipt JSON supplied by the execution request. */
  reviews(member: HumanReviewedPublicationMember): Promise<{ receipts: readonly ProductReviewReceipt[]; sourceReleaseId: string | null }>;
  /** Optional durable recovery adapter. Must bind the existing release to this
   * exact enrolled plan, source, signer and target set before returning it. */
  completed?(member: HumanReviewedPublicationMember): Promise<{ id: string; releaseNo: number } | null>;
  redispatch?(member: HumanReviewedPublicationMember, release: { id: string; releaseNo: number }): Promise<void>;
  /** Checks every target as a pinned set. Must retain FK, unique key, reverse
   * dependency, tenant, authorization and runtime capability checks. */
  qualify(targets: readonly Target[]): Promise<void>;
  record(event: { planHash: string; event: "qualified" | "dispatched"; releaseIds?: readonly string[] }): Promise<void>;
}
function requirePublication(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`HUMAN_PUBLICATION_${code}`);
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;

/** Structural admission only. No caller-supplied identity or plan grants access. */
export function assertHumanReviewedPublicationPlan(plan: HumanReviewedPublicationPlan): void {
  requirePublication(plan?.schema === "athyper.human-reviewed-publication-plan/1" && uuid.test(plan.publisherId)
    && Array.isArray(plan.members) && plan.members.length > 0, "PLAN_INVALID");
  requirePublication(new Set(plan.members.map(m => m.entityId)).size === plan.members.length
    && new Set(plan.members.map(m => m.changeSetId)).size === plan.members.length, "DUPLICATE_SOURCE");
  for (const member of plan.members) {
    requirePublication([member.changeSetId, member.entityId, member.authorId, member.reviewerId].every(v => typeof v === "string" && uuid.test(v))
      && (member.sourceReleaseId === null || uuid.test(member.sourceReleaseId))
      && Number.isSafeInteger(member.revision) && member.revision >= 2
      && hash.test(member.contractHash) && hash.test(member.descriptorHash), "SOURCE_PIN_INVALID");
    requirePublication(member.authorId !== member.reviewerId && member.authorId !== plan.publisherId
      && member.reviewerId !== plan.publisherId, "ACTOR_SEPARATION_REQUIRED");
    requirePublication(Array.isArray(member.targets) && member.targets.length > 0
      && new Set(member.targets.map((t: HumanReviewedPublicationMember["targets"][number]) => t.plane)).size === member.targets.length
      && member.targets.every((t: HumanReviewedPublicationMember["targets"][number]) => ["studio", "neon", "mesh"].includes(t.plane)
        && hash.test(t.contractHash) && hash.test(t.descriptorHash)), "TARGET_PIN_INVALID");
  }
}

export function inspectHumanReviewedProduct(member: HumanReviewedPublicationMember, source: Source, review: Awaited<ReturnType<HumanReviewedPublicationPorts["reviews"]>>, published = false): Target[] {
  const { receipts } = review;
  const cs = source.changeSet;
  requirePublication(cs.id === member.changeSetId && cs.entityId === member.entityId && cs.tenantId === null
    && source.graph.entity.ownershipModel === "system" && cs.entityCode === source.graph.entity.entityCode,
  "SOURCE_SCOPE_CHANGED");
  requirePublication(cs.status === (published ? "published" : "approved") && cs.revision === member.revision + (published ? 1 : 0)
    && review.sourceReleaseId === member.sourceReleaseId && cs.submittedBy === member.authorId && cs.approvedBy === member.reviewerId
    && cs.createdBy !== member.reviewerId, "REVIEW_CHANGED");
  const compiled = compileGraph(source.graph);
  requirePublication(compiled.contractHash === member.contractHash && compiled.descriptorHash === member.descriptorHash, "SOURCE_HASH_CHANGED");
  const matches = (action: ProductReviewReceipt["action"], actorId: string, revision: number, status: string) => receipts.some(r =>
    r.action === action && r.actorId === actorId && r.changeSetId === member.changeSetId && uuid.test(r.requestId)
    && r.expectedContractHash === member.contractHash && r.expectedRevision === revision
    && r.revision === revision + (action === "adopt" ? 0 : 1) && r.status === status);
  requirePublication(matches("adopt", member.authorId, member.revision - 2, "draft")
    && matches("submit", member.authorId, member.revision - 2, "in_review")
    && matches("approve", member.reviewerId, member.revision - 1, "approved")
    && !receipts.some(r => r.action === "adopt" && r.actorId === member.reviewerId && r.changeSetId === member.changeSetId
      && r.expectedContractHash === member.contractHash && r.expectedRevision === member.revision - 2), "HUMAN_RECEIPTS_REQUIRED");
  const markers = (source.graph.surfaces ?? []).flatMap(s => {
    const marker = s.layoutConfig?.systemReferenceProduct ?? s.layoutConfig?.tableEntityProduct;
    return marker ? [marker as { targetPlanes: AuthoringPlane[] }] : [];
  });
  requirePublication(markers.length === 1 && Array.isArray(markers[0]!.targetPlanes)
    && [...markers[0]!.targetPlanes].sort().join() === member.targets.map(t => t.plane).sort().join(), "DECLARED_TARGETS_CHANGED");
  return member.targets.map(pin => {
    const target = compileSystemEntityTarget(source.graph, pin.plane);
    requirePublication(target.artifact.contractHash === pin.contractHash && target.artifact.descriptorHash === pin.descriptorHash, "TARGET_HASH_CHANGED");
    return target;
  });
}

/** Publication consumes human review without re-authoring, re-submitting or
 * re-approving a draft as a machine. Dispatch is not target activation. A partial
 * dispatch is reported as failure; recovery must use persisted release IDs. */
export async function publishHumanReviewedProducts(input: HumanReviewedPublicationPlan, ports: HumanReviewedPublicationPorts) {
  const plan = structuredClone(input);
  assertHumanReviewedPublicationPlan(plan);
  const planHash = sha256(plan);
  await ports.authorize(structuredClone(plan));
  return ports.locked(plan.members.map(m => m.entityId).sort(), async () => {
    const completed = new Map<string, { id: string; releaseNo: number }>();
    if (ports.completed) for (const member of plan.members) {
      const release = await ports.completed(structuredClone(member));
      if (release) {
        requirePublication(uuid.test(release.id) && Number.isSafeInteger(release.releaseNo) && release.releaseNo > 0 && ports.redispatch,
          "RECOVERY_RECEIPT_INVALID");
        completed.set(member.changeSetId, release);
      }
    }
    const inspectMember = async (member: HumanReviewedPublicationMember) => inspectHumanReviewedProduct(member,
      await ports.service.readGraph(member.changeSetId), await ports.reviews(structuredClone(member)), completed.has(member.changeSetId));
    const targets: Target[] = [];
    for (const member of plan.members) targets.push(...await inspectMember(member));
    await ports.qualify(targets);
    // Recheck every member before signing any release: qualification may await
    // remote target services and concurrent revocation must stop this operation.
    await ports.authorize(structuredClone(plan));
    for (const member of plan.members) await inspectMember(member);
    await ports.record({ planHash, event: "qualified" });
    const releases: { id: string; releaseNo: number }[] = [];
    for (const member of plan.members) {
      await ports.authorize(structuredClone(plan));
      await inspectMember(member);
      const previous = completed.get(member.changeSetId);
      if (previous) {
        await ports.redispatch!(structuredClone(member), previous);
        releases.push(previous);
        continue;
      }
      const result = await ports.service.publish({ changeSetId: member.changeSetId, expectedRevision: member.revision,
        expectedContractHash: member.contractHash, expectedSourceReleaseId: member.sourceReleaseId,
        actorId: plan.publisherId, targetPlanes: member.targets.map(t => t.plane) });
      releases.push(result.release);
    }
    await ports.record({ planHash, event: "dispatched", releaseIds: releases.map(r => r.id) });
    return { status: "dispatched" as const, planHash, releases };
  });
}
