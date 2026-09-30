import type {
  MetaEntityChangeSet,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { MetaEntityAuthoringService } from "./authoring-service.js";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "./deterministic.js";
import { cloneGraphIds } from "./graph-identity.js";
import { normalizeGraphStorageOrder } from "./graph-storage-order.js";

export interface DevelopmentPublicationPolicy {
  readonly environment: string;
  readonly instance: string;
  readonly preset: string;
  readonly enabled: boolean;
  readonly authorPrincipalId: string;
  readonly publisherPrincipalId: string;
}
export interface DevelopmentPublicationRequest {
  readonly entityCode: string;
  readonly scope:
    | { readonly kind: "product" }
    | { readonly kind: "tenant"; readonly tenantId: string };
  readonly targets: readonly ("studio" | "neon" | "mesh")[];
  readonly overlay: string;
}
type Service = Pick<
  MetaEntityAuthoringService,
  | "readGraph"
  | "createDraft"
  | "replaceGraph"
  | "validate"
  | "test"
  | "submit"
  | "approve"
  | "publish"
>;
export interface DevelopmentPublicationPorts {
  /** Must resolve the published head for the requested scope, never a working draft. */
  current(
    request: DevelopmentPublicationRequest,
  ): Promise<{
    releaseId: string;
    changeSet: MetaEntityChangeSet;
    graph: MetaEntityGraph;
    supportedTargets: readonly ("studio" | "neon" | "mesh")[];
  }>;
  /** Registry of code-owned overlays. No executable or arbitrary graph from clients. */
  overlays: Readonly<
    Record<string, (graph: MetaEntityGraph) => MetaEntityGraph>
  >;
  /** Serialize this entity/scope and reject a moved source release. */
  withCurrent<T>(
    request: DevelopmentPublicationRequest,
    releaseId: string,
    work: () => Promise<T>,
  ): Promise<T>;
  /** Authenticates a configured WORKLOAD identity and establishes its real request
   * context. Check each permission against IAM; never manufacture elevated MFA. */
  asWorkload<T>(
    principalId: string,
    work: (actor: {
      authorize(permission: string, changeSetId: string): Promise<void>;
      service: Service;
    }) => Promise<T>,
  ): Promise<T>;
  record(event: Readonly<Record<string, unknown>>): Promise<void>;
}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(code);
}

/** Uses the existing authoring service's validation, reviewer separation, signer
 * and dispatcher. Missing IAM/global-publication adapters fail closed. */
export class DevelopmentPublicationWorkflow {
  private readonly policy: DevelopmentPublicationPolicy;
  constructor(
    policy: DevelopmentPublicationPolicy,
    private readonly ports: DevelopmentPublicationPorts,
  ) {
    this.policy = structuredClone(policy);
  }
  async run(input: DevelopmentPublicationRequest, dryRun = false) {
    const p = this.policy,
      request = structuredClone(input);
    check(
      p.enabled &&
        p.environment === "dev" &&
        p.instance === "dev" &&
        p.preset === "devfull",
      "DEVELOPMENT_PUBLICATION_DEVFULL_ONLY",
    );
    check(
      p.authorPrincipalId.trim() &&
        p.publisherPrincipalId.trim() &&
        p.authorPrincipalId !== p.publisherPrincipalId,
      "DEVELOPMENT_PUBLICATION_DISTINCT_IDENTITIES_REQUIRED",
    );
    check(
      request.targets.length &&
        new Set(request.targets).size === request.targets.length &&
        request.targets.every((t) => ["studio", "neon", "mesh"].includes(t)),
      "DEVELOPMENT_PUBLICATION_TARGETS_INVALID",
    );
    check(
      Object.hasOwn(this.ports.overlays, request.overlay),
      "DEVELOPMENT_PUBLICATION_OVERLAY_UNKNOWN",
    );
    const overlay = this.ports.overlays[request.overlay]!;
    const source = await this.ports.current(request);
    check(
      request.targets.every((t) => source.supportedTargets.includes(t)),
      "DEVELOPMENT_PUBLICATION_TARGET_UNSUPPORTED",
    );
    check(
      source.changeSet.status === "published" &&
        source.changeSet.entityCode === request.entityCode &&
        source.graph.entity.entityCode === request.entityCode,
      "DEVELOPMENT_PUBLICATION_PUBLISHED_SOURCE_REQUIRED",
    );
    check(
      request.scope.kind === "product"
        ? source.changeSet.tenantId === null
        : source.changeSet.tenantId === request.scope.tenantId,
      "DEVELOPMENT_PUBLICATION_SCOPE_MISMATCH",
    );
    const proposed = overlay(structuredClone(source.graph));
    const validation = validateGraph(proposed);
    check(
      validation.issues.length === 0 && runContractTests(proposed).passed,
      "DEVELOPMENT_PUBLICATION_VALIDATION_FAILED",
    );
    const before = compileGraph(source.graph),
      after = compileGraph(proposed);
    const plan = {
      request,
      sourceReleaseId: source.releaseId,
      previousHash: before.contractHash,
      proposedHash: after.contractHash,
    };
    if (before.contractHash === after.contractHash)
      return { ...plan, status: "unchanged" as const };
    if (dryRun) return { ...plan, status: "planned" as const };
    return this.ports.withCurrent(request, source.releaseId, async () => {
      // Persist this before any mutation. It is automation attribution, not human approval.
      await this.ports.record({
        event: "metadata.development_publication.started",
        mode: "development_auto_approval",
        ...plan,
        authorId: p.authorPrincipalId,
        publisherId: p.publisherPrincipalId,
      });
      const submitted = await this.ports.asWorkload(
        p.authorPrincipalId,
        async ({ service, authorize }) => {
          await authorize("metadata.entity.author", source.changeSet.id);
          const forked = normalizeGraphStorageOrder(cloneGraphIds(proposed));
          const expectedHash = compileGraph(forked).contractHash;
          const draft = await service.createDraft({
            tenantId: source.changeSet.tenantId,
            entityId: source.changeSet.entityId,
            entityCode: request.entityCode,
            branchCode: `dev-publication-${after.contractHash.slice(0, 24)}`,
            title: `${request.entityCode}: ${request.overlay}`,
            actorId: p.authorPrincipalId,
          });
          check(
            draft.createdBy === p.authorPrincipalId &&
              draft.status === "draft" &&
              draft.entityId === source.changeSet.entityId &&
              draft.tenantId === source.changeSet.tenantId,
            "DEVELOPMENT_PUBLICATION_DRAFT_CONFLICT",
          );
          const saved = await service.replaceGraph({
            changeSetId: draft.id,
            expectedRevision: draft.revision,
            graph: forked,
            actorId: p.authorPrincipalId,
          });
          const persisted = await service.readGraph(saved.id);
          check(
            compileGraph(persisted.graph).contractHash === expectedHash,
            "DEVELOPMENT_PUBLICATION_SAVED_GRAPH_CHANGED",
          );
          const checked = await service.validate(saved.id, p.authorPrincipalId);
          check(
            !checked.issues.length,
            "DEVELOPMENT_PUBLICATION_VALIDATION_FAILED",
          );
          const tested = await service.test(saved.id, p.authorPrincipalId);
          check(tested.passed, "DEVELOPMENT_PUBLICATION_TESTS_FAILED");
          await authorize("metadata.entity.submit", saved.id);
          const changeSet = await service.submit({
            changeSetId: saved.id,
            expectedRevision: saved.revision,
            actorId: p.authorPrincipalId,
          });
          return { changeSet, expectedHash };
        },
      );
      await this.ports.record({
        event: "metadata.development_publication.submitted",
        ...plan,
        changeSetId: submitted.changeSet.id,
        revision: submitted.changeSet.revision,
        savedHash: submitted.expectedHash,
        authorId: p.authorPrincipalId,
      });
      return this.ports.asWorkload(
        p.publisherPrincipalId,
        async ({ service, authorize }) => {
          const reviewed = await service.readGraph(submitted.changeSet.id);
          check(
            reviewed.changeSet.revision === submitted.changeSet.revision &&
              compileGraph(reviewed.graph).contractHash ===
                submitted.expectedHash,
            "DEVELOPMENT_PUBLICATION_REVIEW_CHANGED",
          );
          await authorize("metadata.entity.review", submitted.changeSet.id);
          const approved = await service.approve({
            changeSetId: submitted.changeSet.id,
            expectedRevision: submitted.changeSet.revision,
            actorId: p.publisherPrincipalId,
          });
          await authorize("metadata.entity.publish", approved.id);
          await this.ports.record({
            event: "metadata.development_publication.approved",
            ...plan,
            changeSetId: approved.id,
            savedHash: submitted.expectedHash,
            mode: "development_auto_approval",
            authorId: p.authorPrincipalId,
            publisherId: p.publisherPrincipalId,
          });
          const result = await service.publish({
            expectedSourceReleaseId: source.releaseId,
            changeSetId: approved.id,
            expectedRevision: approved.revision,
            actorId: p.publisherPrincipalId,
            targetPlanes: request.targets,
          });
          const receipt = {
            ...plan,
            changeSetId: approved.id,
            release: result.release,
            status: "dispatched" as const,
            descriptorHash: result.artifact.descriptorHash,
            mode: "development_auto_approval" as const,
          };
          await this.ports.record({
            event: "metadata.development_publication.dispatched",
            ...receipt,
          });
          return receipt;
        },
      );
    });
  }
}
