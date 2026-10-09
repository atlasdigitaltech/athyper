import { compileNativePublication } from "./native-publication-compilation.js";
import { nativePublicationTargets } from "./publication/native-publication-targets.js";
import type {
  ExpandedNativeMetaEntityGraph,
  MetaEntityAuthoringRepository,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import { type NativeReleaseCompilationContext } from "./native-release-compilation.js";
import type { NativeCompiledOperation } from "./native-operation-compilation.js";

export type ProductReviewAction = "submit" | "approve";
export interface ProductReviewCommand {
  requestId: string;
  expectedRevision: number;
  expectedContractHash: string;
}
export interface ProductReviewReceipt extends ProductReviewCommand {
  changeSetId: string;
  actorId: string;
  /** Historical adoption receipts remain readable, never newly writable. */
  action: ProductReviewAction | "adopt";
  revision: number;
  status: string;
}
/** All ports must share the caller's locked, authorized transaction. */
export interface ProductReviewPorts {
  repository: MetaEntityAuthoringRepository;
  receipt(requestId: string): Promise<ProductReviewReceipt | null>;
  /** Resolve the exact canonical native source and current compiler resources in
   * the same authorized transaction as lifecycle writes. Not an HTTP DTO. */
  nativeSource(id: string): Promise<{
    graph: ExpandedNativeMetaEntityGraph;
    compiler: NativeReleaseCompilationContext;
    targetCompilers?: readonly NativeReleaseCompilationContext[];
    controls: readonly NativeCompiledOperation[];
  }>;
  submitted(
    id: string,
    revision: number,
    hash: string,
    actorId: string,
  ): Promise<boolean>;
  record(receipt: ProductReviewReceipt): Promise<void>;
}

/** Native product review only. Legacy adoption and presentation-marker target
 * inference are retired; historical receipts are retained by the repository. */
export function createProductReviewService(ports: ProductReviewPorts) {
  async function inspect(id: string) {
    const changeSet = await ports.repository.get(id);
    if (!changeSet || changeSet.tenantId !== null)
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "A platform native draft is required",
      );
    const source = await ports.nativeSource(id);
    const { graph } = source;
    if (
      graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
      graph.authoringSource.sourceKind !== "product" ||
      graph.authoringSource.tenantId !== null ||
      graph.authoringSource.entityId !== changeSet.entityId ||
      graph.ownedLabels?.changeSetId !== id ||
      graph.entity.entityCode !== changeSet.entityCode
    )
      throw new AuthoringPolicyError(
        "NATIVE_REVIEW_SOURCE_INVALID",
        "Exact native product source required",
      );
    const artifact = compileNativePublication(source);
    const targets = nativePublicationTargets(graph, artifact);
    const current = await ports.repository.get(id);
    if (
      !current ||
      current.revision !== changeSet.revision ||
      current.status !== changeSet.status
    )
      throw new AuthoringConflictError(
        "Native source changed during inspection",
      );
    return {
      changeSet,
      graph,
      contractHash: artifact.contractHash,
      descriptorHash: artifact.descriptorHash,
      tests: {
        passed: true,
        contractHash: artifact.contractHash,
        results: [{ key: "native-whole-graph-compilation", passed: true }],
      },
      targets: targets.map((target) => ({
        plane: target.targetPlane,
        contractHash: target.artifact.contractHash,
        descriptorHash: target.artifact.descriptorHash,
      })),
    };
  }
  return {
    inspect,
    async execute(
      id: string,
      actorId: string,
      action: ProductReviewAction,
      command: ProductReviewCommand,
    ) {
      if (action !== "submit" && action !== "approve")
        throw new AuthoringPolicyError(
          "LEGACY_PRODUCT_ADOPTION_RETIRED",
          "Native review accepts submit and approve only",
        );
      const previous = await ports.receipt(command.requestId);
      if (previous) {
        if (
          previous.changeSetId !== id ||
          previous.actorId !== actorId ||
          previous.action !== action ||
          previous.expectedRevision !== command.expectedRevision ||
          previous.expectedContractHash !== command.expectedContractHash
        )
          throw new AuthoringConflictError(
            "Idempotency key already binds another command",
          );
        return previous;
      }
      const source = await inspect(id),
        cs = source.changeSet;
      if (
        cs.revision !== command.expectedRevision ||
        source.contractHash !== command.expectedContractHash
      )
        throw new AuthoringConflictError(
          "Reload the current revision and contract hash",
        );
      if (!source.tests.passed)
        throw new AuthoringPolicyError(
          "CONTRACT_TESTS_FAILED",
          "Contract tests failed",
        );
      if ((action === "approve" ? "in_review" : "draft") !== cs.status)
        throw new AuthoringConflictError("Change-set state changed");
      if (action === "submit" && cs.createdBy !== actorId)
        throw new AuthoringPolicyError(
          "NATIVE_PRODUCT_AUTHOR_REQUIRED",
          "The native draft author must submit this candidate",
        );
      if (
        action === "approve" &&
        (!cs.submittedBy ||
          cs.createdBy === actorId ||
          cs.submittedBy === actorId ||
          !(await ports.submitted(
            id,
            cs.revision - 1,
            source.contractHash,
            cs.submittedBy,
          )))
      )
        throw new AuthoringPolicyError(
          "REVIEWER_SEPARATION_REQUIRED",
          "An independently submitted human proposal is required",
        );
      const receipt: ProductReviewReceipt = {
        ...command,
        changeSetId: id,
        actorId,
        action,
        revision: cs.revision + 1,
        status: action === "submit" ? "in_review" : "approved",
      };
      // The receipt, lifecycle transition and host audit either all commit or all roll back.
      await ports.record(receipt);
      const next = await ports.repository.transition({
        changeSetId: id,
        actorId,
        expectedRevision: cs.revision,
        from: action === "submit" ? "draft" : "in_review",
        to: action === "submit" ? "in_review" : "approved",
      });
      if (next.revision !== receipt.revision || next.status !== receipt.status)
        throw new AuthoringConflictError("Unexpected change-set transition");
      return receipt;
    },
  };
}
