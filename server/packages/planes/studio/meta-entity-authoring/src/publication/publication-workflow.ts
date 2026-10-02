import type { AuthoringPlane, MetaEntityChangeSet, MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import type { MetaEntityAuthoringService } from "../authoring-service.js";
import { compileGraph } from "../deterministic.js";
import { compileSystemEntityTarget } from "../compilation/entity-target-compiler.js";
import { compileSystemReferenceTarget } from "../compilation/target-compiler.js";

/** Operator-reviewed onboarding policy, never constructed from an HTTP graph or
 * inferred from a classifier assessment. This contract grants nothing by itself. */
export interface ReferenceOnboardingPolicy {
  readonly schema: "athyper.dev-reference-onboarding/1" | "athyper.dev-entity-onboarding/1";
  readonly policyId: string;
  readonly revision: number;
  readonly environment: "local";
  readonly instance: "dev";
  readonly preset: "devfull";
  readonly changeSetId: string;
  readonly entityId: string;
  readonly productHash: string;
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly targetPlanes: readonly AuthoringPlane[];
  readonly authorPrincipalId: string;
  readonly publisherPrincipalId: string;
}
type Service = Pick<MetaEntityAuthoringService, "readGraph" | "validate" | "test" | "submit" | "approve" | "publish">;
export interface ReferenceFirstPublicationPorts {
  /** Authenticate policy provenance and its current DEV-only enrollment. Must
   * reject unsigned/unreviewed policy inputs and wrong deployment coordinates. */
  assertPolicyAuthorized(policy: ReferenceOnboardingPolicy): Promise<void>;
  /** Serialize the source and reject an existing release. The repository also
   * rechecks first-release semantics under its transaction advisory lock. */
  withFirstPublication<T>(entityId: string, work: () => Promise<T>): Promise<T>;
  /** Establish a real workload's IAM/request context; no human impersonation. */
  asWorkload<T>(principalId: string, work: (actor: {
    principalId: string;
    service: Service;
    authorize(permission: string, changeSetId: string): Promise<void>;
  }) => Promise<T>): Promise<T>;
  /** Verify catalog, storage, handlers and all declared capabilities for every
   * target. Signing is forbidden until this succeeds; compilation is not qualification. */
  qualify(target: ReturnType<typeof compileSystemReferenceTarget>): Promise<void>;
  /** Persist authenticated machine attribution. A local log is not an approval. */
  record(event: Readonly<Record<string, unknown>>): Promise<void>;
}
function check(value: unknown, code: string): asserts value {
  if (!value) throw Error(code);
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;

/** Shared structural validation for enrollment and execution; grants no authority. */
export function assertReferenceOnboardingPolicy(p: ReferenceOnboardingPolicy): void {
  check(p && ["athyper.dev-reference-onboarding/1", "athyper.dev-entity-onboarding/1"].includes(p.schema) && p.environment === "local" && p.instance === "dev" && p.preset === "devfull", "REFERENCE_ONBOARDING_DEV_ONLY");
  check(typeof p.policyId === "string" && /^[a-z][a-z0-9_.-]{1,126}$/.test(p.policyId) && Number.isSafeInteger(p.revision) && p.revision > 0, "REFERENCE_ONBOARDING_POLICY_INVALID");
  check([p.changeSetId, p.entityId, p.authorPrincipalId, p.publisherPrincipalId].every(v => typeof v === "string" && uuid.test(v)) && p.authorPrincipalId !== p.publisherPrincipalId, "REFERENCE_ONBOARDING_IDENTITIES_INVALID");
  check([p.productHash, p.contractHash, p.descriptorHash].every(v => typeof v === "string" && hash.test(v)), "REFERENCE_ONBOARDING_PIN_INVALID");
  check(Array.isArray(p.targetPlanes) && p.targetPlanes.includes("studio") && new Set(p.targetPlanes).size === p.targetPlanes.length && p.targetPlanes.every(v => ["studio", "neon", "mesh"].includes(v)), "REFERENCE_ONBOARDING_TARGETS_INVALID");
}

/** Shared reference-publication orchestration lives in this module, not in
 * per-entity or per-release files. This implementation currently admits only
 * first publication; retain the precise class name until successor support is verified.
 * First publication uses the ordinary submit/review/sign/prepare/dispatch path.
 * It neither activates directly nor claims that queued work is active. */
export class ReferenceFirstPublicationWorkflow {
  private readonly policy: ReferenceOnboardingPolicy;
  constructor(policy: ReferenceOnboardingPolicy, private readonly ports: ReferenceFirstPublicationPorts) {
    this.policy = structuredClone(policy);
    assertReferenceOnboardingPolicy(this.policy);
  }
  private assertSource(source: { changeSet: MetaEntityChangeSet; graph: MetaEntityGraph }) {
    const p = this.policy, { changeSet: cs, graph } = source;
    check(cs.id === p.changeSetId && cs.entityId === p.entityId && cs.tenantId === null && cs.entityCode === graph.entity.entityCode, "REFERENCE_ONBOARDING_SOURCE_MISMATCH");
    check(["draft", "in_review", "approved"].includes(cs.status), "REFERENCE_ONBOARDING_STATE_INVALID");
    check(cs.createdBy !== p.publisherPrincipalId && (!cs.submittedBy || cs.submittedBy === p.authorPrincipalId) && (!cs.approvedBy || cs.approvedBy === p.publisherPrincipalId), "REFERENCE_ONBOARDING_ACTOR_MISMATCH");
    const compiled = compileGraph(graph);
    check(compiled.contractHash === p.contractHash && compiled.descriptorHash === p.descriptorHash, "REFERENCE_ONBOARDING_SOURCE_CHANGED");
    const targets = p.targetPlanes.map(plane => p.schema === "athyper.dev-entity-onboarding/1" ? compileSystemEntityTarget(graph, plane) : compileSystemReferenceTarget(graph, plane));
    const marker = graph.surfaces!.map(s => p.schema === "athyper.dev-entity-onboarding/1" ? s.layoutConfig?.tableEntityProduct : s.layoutConfig?.systemReferenceProduct).find(Boolean) as { productHash: string; targetPlanes: string[] };
    check(marker && marker.productHash === p.productHash && [...marker.targetPlanes].sort().join() === [...p.targetPlanes].sort().join(), "REFERENCE_ONBOARDING_ENROLLMENT_MISMATCH");
    return targets;
  }
  async run() {
    const p = this.policy;
    await this.ports.assertPolicyAuthorized(structuredClone(p));
    return this.ports.withFirstPublication(p.entityId, async () => {
      await this.ports.asWorkload(p.authorPrincipalId, async actor => {
        check(actor.principalId === p.authorPrincipalId, "REFERENCE_ONBOARDING_WORKLOAD_MISMATCH");
        await actor.authorize("metadata.entity.author", p.changeSetId);
        const source = await actor.service.readGraph(p.changeSetId);
        const targets = this.assertSource(source);
        for (const target of targets) await this.ports.qualify(target);
        const validation = await actor.service.validate(p.changeSetId, actor.principalId);
        const tests = await actor.service.test(p.changeSetId, actor.principalId);
        check(validation.issues.length === 0 && validation.contractHash === p.contractHash && tests.passed && tests.contractHash === p.contractHash, "REFERENCE_ONBOARDING_VALIDATION_FAILED");
        // Zero embedded tests are reported honestly; qualification is a separate gate.
        await this.ports.record({ schema: "athyper.dev-reference-publication-evidence/1", event: "qualified", policy: structuredClone(p), embeddedTestCount: tests.results.length,
          targets: targets.map(t => ({ plane: t.targetPlane, descriptorHash: t.artifact.descriptorHash })) });
        this.assertSource(await actor.service.readGraph(p.changeSetId));
        if (source.changeSet.status === "draft") {
          await actor.authorize("metadata.entity.submit", p.changeSetId);
          await actor.service.submit({ changeSetId: p.changeSetId, expectedRevision: source.changeSet.revision, actorId: actor.principalId });
        }
      });
      return this.ports.asWorkload(p.publisherPrincipalId, async actor => {
        check(actor.principalId === p.publisherPrincipalId, "REFERENCE_ONBOARDING_WORKLOAD_MISMATCH");
        await actor.authorize("metadata.entity.review", p.changeSetId);
        const source = await actor.service.readGraph(p.changeSetId);
        this.assertSource(source);
        check(source.changeSet.submittedBy === p.authorPrincipalId, "REFERENCE_ONBOARDING_SUBMISSION_REQUIRED");
        // Durable attribution precedes review, including resumed approved sources.
        await this.ports.record({ schema: "athyper.dev-reference-publication-evidence/1", event: "review_authorized", mode: "development_auto_approval", policy: structuredClone(p), reviewerId: actor.principalId });
        const approved = source.changeSet.status === "approved" ? source.changeSet : await actor.service.approve({ changeSetId: p.changeSetId, expectedRevision: source.changeSet.revision, actorId: actor.principalId });
        check(approved.status === "approved" && approved.approvedBy === actor.principalId, "REFERENCE_ONBOARDING_APPROVAL_REQUIRED");
        await actor.authorize("metadata.entity.publish", p.changeSetId);
        const result = await actor.service.publish({ changeSetId: p.changeSetId, expectedRevision: approved.revision, actorId: actor.principalId,
          expectedSourceReleaseId: null, expectedContractHash: p.contractHash, targetPlanes: [...p.targetPlanes] });
        await this.ports.record({ schema: "athyper.dev-reference-publication-evidence/1", event: "dispatched", policy: structuredClone(p), releaseId: result.release.id, releaseNo: result.release.releaseNo });
        return { status: "dispatched" as const, release: result.release, targetPlanes: [...p.targetPlanes] };
      });
    });
  }
}

export interface EntitySuccessorPublicationPorts extends Omit<ReferenceFirstPublicationPorts, "assertPolicyAuthorized" | "withFirstPublication"> {
  assertPolicyAuthorized(policy: DevEntitySuccessorPolicy): Promise<void>;
  /** Checks persisted source/predecessor and serializes workflow execution.
   * Allocation and target activation repeat the checks in their own locks. */
  withSuccessorPublication<T>(policy: DevEntitySuccessorPolicy, work: () => Promise<T>): Promise<T>;
}

/** Distinct versioned successor authority; never widens first-release enrollment.
 * Both paths use ordinary validation, signing and publication preparation. */
export class EntitySuccessorPublicationWorkflow {
  private readonly policy: DevEntitySuccessorPolicy;
  constructor(policy: DevEntitySuccessorPolicy, private readonly ports: EntitySuccessorPublicationPorts) {
    this.policy = parseDevEntitySuccessorPolicy(policy);
  }
  private source(input: { changeSet: MetaEntityChangeSet; graph: MetaEntityGraph }) {
    const p = this.policy, { changeSet: cs, graph } = input;
    check(cs.id === p.changeSetId && cs.entityId === p.entityId && cs.tenantId === null && cs.entityCode === graph.entity.entityCode, "ENTITY_SUCCESSOR_SOURCE_MISMATCH");
    check(["draft", "in_review", "approved"].includes(cs.status) && cs.createdBy !== p.publisherPrincipalId
      && (!cs.submittedBy || cs.submittedBy === p.authorPrincipalId) && (!cs.approvedBy || cs.approvedBy === p.publisherPrincipalId), "ENTITY_SUCCESSOR_ACTOR_OR_STATE_MISMATCH");
    const artifact = compileGraph(graph);
    check(artifact.contractHash === p.contractHash && artifact.descriptorHash === p.descriptorHash, "ENTITY_SUCCESSOR_SOURCE_PIN_CHANGED");
    return p.targets.map(t => compileSystemEntityTarget(graph, t.plane));
  }
  async run() {
    const p = this.policy;
    await this.ports.assertPolicyAuthorized(p);
    return this.ports.withSuccessorPublication(p, async () => {
      await this.ports.asWorkload(p.authorPrincipalId, async actor => {
        check(actor.principalId === p.authorPrincipalId, "ENTITY_SUCCESSOR_WORKLOAD_MISMATCH");
        await actor.authorize("metadata.entity.author", p.changeSetId);
        const source = await actor.service.readGraph(p.changeSetId), targets = this.source(source);
        for (const target of targets) await this.ports.qualify(target);
        const validation = await actor.service.validate(p.changeSetId, actor.principalId);
        const tests = await actor.service.test(p.changeSetId, actor.principalId);
        check(validation.issues.length === 0 && validation.contractHash === p.contractHash && tests.passed && tests.contractHash === p.contractHash, "ENTITY_SUCCESSOR_VALIDATION_FAILED");
        await this.ports.record({ schema: "athyper.dev-entity-successor-evidence/1", event: "qualified", policy: p, embeddedTestCount: tests.results.length });
        this.source(await actor.service.readGraph(p.changeSetId));
        if (source.changeSet.status === "draft") {
          await actor.authorize("metadata.entity.submit", p.changeSetId);
          await actor.service.submit({ changeSetId: p.changeSetId, expectedRevision: source.changeSet.revision, actorId: actor.principalId });
        }
      });
      return this.ports.asWorkload(p.publisherPrincipalId, async actor => {
        check(actor.principalId === p.publisherPrincipalId, "ENTITY_SUCCESSOR_WORKLOAD_MISMATCH");
        await actor.authorize("metadata.entity.review", p.changeSetId);
        const source = await actor.service.readGraph(p.changeSetId); this.source(source);
        check(source.changeSet.submittedBy === p.authorPrincipalId, "ENTITY_SUCCESSOR_SUBMISSION_REQUIRED");
        await this.ports.record({ schema: "athyper.dev-entity-successor-evidence/1", event: "review_authorized", policy: p, reviewerId: actor.principalId });
        const approved = source.changeSet.status === "approved" ? source.changeSet : await actor.service.approve({ changeSetId: p.changeSetId, expectedRevision: source.changeSet.revision, actorId: actor.principalId });
        check(approved.status === "approved" && approved.approvedBy === actor.principalId, "ENTITY_SUCCESSOR_APPROVAL_REQUIRED");
        await actor.authorize("metadata.entity.publish", p.changeSetId);
        const result = await actor.service.publish({ changeSetId: p.changeSetId, expectedRevision: approved.revision, actorId: actor.principalId,
          expectedSourceReleaseId: p.predecessor.authoringReleaseId, expectedContractHash: p.contractHash, targetPlanes: p.targets.map(t => t.plane) });
        await this.ports.record({ schema: "athyper.dev-entity-successor-evidence/1", event: "dispatched", policy: p, releaseId: result.release.id, releaseNo: result.release.releaseNo });
        return { status: "dispatched" as const, release: result.release, targetPlanes: p.targets.map(t => t.plane) };
      });
    });
  }
}

export { ReferenceFirstPublicationWorkflow as EntityFirstPublicationWorkflow };
