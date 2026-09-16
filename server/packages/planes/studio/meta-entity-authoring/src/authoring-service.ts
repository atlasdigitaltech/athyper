import type {
  ArtifactSigner,
  BreakGlassEvidence,
  MetaEntityAuthoringRepository,
  MetaEntityGraph,
  MetaEntityPublicationPort,
  SignedMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "./deterministic.js";
import type { MetaEntityGraphPreview } from "./graph-preview.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface AuthoringServiceOptions {
  preview?: MetaEntityGraphPreview;
  learning?: {
    assertPublishable(
      changeSetId: string,
      graph: MetaEntityGraph,
    ): Promise<void>;
  };
  repository: MetaEntityAuthoringRepository;
  signer: ArtifactSigner;
  publication: MetaEntityPublicationPort;
}

export class MetaEntityAuthoringService {
  constructor(private readonly options: AuthoringServiceOptions) {}
  async assertTenant(
    changeSetId: string,
    tenantId: string,
    allowPlatform = false,
  ) {
    const current = await this.required(changeSetId);
    if (
      current.tenantId !== tenantId &&
      !(allowPlatform && current.tenantId === null)
    )
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "The tenant change set is unavailable",
      );
  }
  createDraft(
    input: Parameters<MetaEntityAuthoringRepository["createDraft"]>[0],
  ) {
    return this.options.repository.createDraft(input);
  }
  async listDraftSaves(id: string) {
    if (!this.options.repository.listDraftSaves) throw new AuthoringPolicyError("HISTORY_UNAVAILABLE", "Saved history is unavailable");
    return this.options.repository.listDraftSaves(id);
  }
  async readDraftSave(id: string, revision: number) {
    if (!this.options.repository.readDraftSave) throw new AuthoringPolicyError("HISTORY_UNAVAILABLE", "Saved history is unavailable");
    return this.options.repository.readDraftSave(id, revision);
  }
  async listInspectionReleases(tenantId: string) {
    if (!this.options.repository.listInspectionReleases) throw new Error("RELEASE_INSPECTION_UNAVAILABLE");
    return this.options.repository.listInspectionReleases(tenantId);
  }
  async readInspectionRelease(tenantId: string, releaseId: string) {
    if (!this.options.repository.readInspectionRelease) throw new Error("RELEASE_INSPECTION_UNAVAILABLE");
    return this.options.repository.readInspectionRelease(tenantId, releaseId);
  }
  async list(tenantId: string) {
    if (!this.options.repository.list)
      throw new Error("AUTHORING_LIST_UNAVAILABLE");
    return this.options.repository.list(tenantId);
  }
  async readGraph(changeSetId: string) {
    const changeSet = await this.required(changeSetId);
    const graph = await this.options.repository.loadGraph(changeSetId);
    const current = await this.required(changeSetId);
    if (current.revision !== changeSet.revision)
      throw new AuthoringConflictError(
        "The graph changed while loading; reload the draft",
      );
    const preview = await this.options.preview?.status?.(changeSet);
    return { changeSet, graph, ...(preview ? { preview } : {}) };
  }
  async forkDraft(sourceChangeSetId: string, actorId: string) {
    if (!this.options.repository.forkDraft)
      throw new Error("AUTHORING_FORK_UNAVAILABLE");
    return this.options.repository.forkDraft({ sourceChangeSetId, actorId });
  }
  async replaceGraph(input: {
    changeSetId: string;
    expectedRevision: number;
    graph: MetaEntityGraph;
    actorId: string;
    context?: VerifiedRequestContext;
  }) {
    const saved = await this.options.repository.replaceGraph(input);
    if (!this.options.preview) return saved;
    // Read normalized native storage, rather than compiling the submitted body.
    // The revision check prevents associating a concurrent save with this receipt.
    try {
      const graph = await this.options.repository.loadGraph(input.changeSetId);
      const current = await this.required(input.changeSetId);
      if (current.revision !== saved.revision)
        return {
          ...saved,
          preview: {
            developmentEvidence: true,
            state: "superseded",
            savedRevision: saved.revision,
          },
        };
      const preview = await this.options.preview.saved({
        changeSet: saved,
        graph,
        actorId: input.actorId,
        ...(input.context ? { context: input.context } : {}),
      });
      return { ...saved, preview };
    } catch (error) {
      // Saving succeeded. An unavailable preview must not turn that into a
      // misleading failed-save response or invite a duplicate authoring write.
      return {
        ...saved,
        preview: {
          developmentEvidence: true,
          state: "failed",
          savedRevision: saved.revision,
          error:
            error instanceof Error ? error.message : "GRAPH_PREVIEW_FAILED",
        },
      };
    }
  }

  async validate(changeSetId: string, actorId: string) {
    const current = await this.required(changeSetId);
    const graph = await this.options.repository.loadGraph(changeSetId);
    const report = validateGraph(graph);
    await this.options.repository.recordValidation(
      changeSetId,
      current.revision,
      report,
      actorId,
    );
    return { ...report, changeSetId, checkedRevision: current.revision };
  }
  async test(changeSetId: string, actorId: string) {
    const current = await this.required(changeSetId);
    const graph = await this.options.repository.loadGraph(changeSetId);
    const validation = validateGraph(graph);
    if (validation.issues.length)
      throw new AuthoringPolicyError(
        "VALIDATION_REQUIRED",
        "The graph must validate before tests run",
      );
    const report = runContractTests(graph);
    await this.options.repository.recordTestRun(
      changeSetId,
      current.revision,
      report,
      actorId,
    );
    return { ...report, changeSetId, checkedRevision: current.revision };
  }
  async submit(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
  }) {
    const graph = await this.options.repository.loadGraph(input.changeSetId);
    const validation = validateGraph(graph);
    const tests = runContractTests(graph);
    if (validation.issues.length)
      throw new AuthoringPolicyError(
        "VALIDATION_FAILED",
        "Graph validation failed",
      );
    if (!tests.passed)
      throw new AuthoringPolicyError(
        "CONTRACT_TESTS_FAILED",
        "Contract tests failed",
      );
    return this.options.repository.transition({
      ...input,
      from: "draft",
      to: "in_review",
    });
  }
  approve(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    breakGlass?: BreakGlassEvidence;
  }) {
    return this.reviewTransition(input, "approved");
  }
  reject(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    breakGlass?: BreakGlassEvidence;
  }) {
    return this.reviewTransition(input, "rejected");
  }

  async publish(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }) {
    const changeSet = await this.required(input.changeSetId);
    if (changeSet.status !== "approved")
      throw new AuthoringPolicyError(
        "APPROVAL_REQUIRED",
        "Only approved change sets may publish",
      );
    const graph = await this.options.repository.loadGraph(input.changeSetId);
    const hasLearning = graph.surfaces?.some(
      (surface) =>
        (surface.layoutConfig?.ai as { vocabulary?: unknown } | undefined)
          ?.vocabulary,
    );
    if (hasLearning && !this.options.learning)
      throw new AuthoringPolicyError(
        "LEARNING_REVIEW_UNAVAILABLE",
        "Learning publication review is unavailable",
      );
    await this.options.learning?.assertPublishable(input.changeSetId, graph);
    await this.options.repository.recordValidation(
      input.changeSetId,
      changeSet.revision,
      validateGraph(graph),
      input.actorId,
    );
    const compiled = compileGraph(graph);
    const signature = await this.options.signer.sign(compiled);
    const artifact: SignedMetaEntityArtifact = { ...compiled, ...signature };
    const release = await this.options.repository.createRelease({
      changeSetId: input.changeSetId,
      expectedRevision: input.expectedRevision,
      actorId: input.actorId,
      artifact,
      targetPlanes: input.targetPlanes,
      releaseKind: "publish",
    });
    await this.options.publication.publish({
      releaseId: release.id,
      artifact,
      targetPlanes: input.targetPlanes,
    });
    return { release, artifact };
  }
  async redispatch(input: {
    releaseId: string;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }) {
    const artifact = await this.options.repository.getSignedRelease(
      input.releaseId,
    );
    if (!artifact?.signature)
      throw new AuthoringPolicyError(
        "SIGNED_RELEASE_REQUIRED",
        "Retry requires a signed release",
      );
    await this.options.publication.publish({ ...input, artifact });
    return { releaseId: input.releaseId, queued: true };
  }
  async activate(input: {
    releaseId: string;
    plane: "studio" | "neon" | "mesh";
    actorId: string;
  }) {
    const artifact = await this.options.repository.getSignedRelease(
      input.releaseId,
    );
    if (!artifact?.signature)
      throw new AuthoringPolicyError(
        "SIGNED_RELEASE_REQUIRED",
        "Runtime activation requires a signed compiled release",
      );
    const event = await this.options.publication.activate(input);
    await this.options.publication.appendGenerationEvent(event);
    return event;
  }
  async rollback(input: {
    priorReleaseId: string;
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }) {
    const artifact = await this.options.repository.getSignedRelease(
      input.priorReleaseId,
    );
    if (!artifact)
      throw new AuthoringPolicyError(
        "ROLLBACK_RELEASE_NOT_FOUND",
        "Rollback requires a prior signed release",
      );
    const release = await this.options.repository.createRelease({
      changeSetId: input.changeSetId,
      expectedRevision: input.expectedRevision,
      actorId: input.actorId,
      artifact,
      targetPlanes: input.targetPlanes,
      releaseKind: "rollback",
      rollbackOfReleaseId: input.priorReleaseId,
    });
    await this.options.publication.publish({
      releaseId: release.id,
      artifact,
      targetPlanes: input.targetPlanes,
    });
    return release;
  }
  private async reviewTransition(
    input: {
      changeSetId: string;
      expectedRevision: number;
      actorId: string;
      breakGlass?: BreakGlassEvidence;
    },
    to: "approved" | "rejected",
  ) {
    const current = await this.required(input.changeSetId);
    if (
      current.createdBy === input.actorId ||
      current.submittedBy === input.actorId
    ) {
      if (!input.breakGlass || input.breakGlass.authorizedBy === input.actorId)
        throw new AuthoringPolicyError(
          "REVIEWER_SEPARATION_REQUIRED",
          "Authors and submitters cannot review their own change set",
        );
    }
    return this.options.repository.transition({
      ...input,
      from: "in_review",
      to,
    });
  }
  private async required(id: string) {
    const value = await this.options.repository.get(id);
    if (!value)
      throw new AuthoringPolicyError(
        "CHANGE_SET_NOT_FOUND",
        "Change set not found",
      );
    return value;
  }
}
