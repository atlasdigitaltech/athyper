import type { MetaEntityAuthoringRepository } from "@athyper/server-contract-meta-entity-authoring";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "./authoring-service.js";
import { compileGraph, runContractTests } from "./deterministic.js";
import { compileSystemEntityTarget } from "./compilation/entity-target-compiler.js";

export type ProductReviewAction = "adopt" | "submit" | "approve";
export interface ProductReviewCommand {
  requestId: string;
  expectedRevision: number;
  expectedContractHash: string;
}
export interface ProductReviewReceipt extends ProductReviewCommand {
  changeSetId: string;
  actorId: string;
  action: ProductReviewAction;
  revision: number;
  status: string;
}
/** All ports must share the caller's locked, authorized transaction. */
export interface ProductReviewPorts {
  repository: MetaEntityAuthoringRepository;
  receipt(requestId: string): Promise<ProductReviewReceipt | null>;
  adopted(
    id: string,
    revision: number,
    hash: string,
    actorId: string,
  ): Promise<boolean>;
  submitted(
    id: string,
    revision: number,
    hash: string,
    actorId: string,
  ): Promise<boolean>;
  record(receipt: ProductReviewReceipt): Promise<void>;
}

/** Human adoption of an exact native product draft. Never relabels its creator,
 * signs a release, or uses the machine-publication approval workflow. */
export function createProductReviewService(ports: ProductReviewPorts) {
  const unavailable = async (): Promise<never> => {
    throw new Error("PRODUCT_REVIEW_PUBLICATION_UNAVAILABLE");
  };
  const service = new MetaEntityAuthoringService({
    repository: ports.repository,
    signer: { sign: unavailable },
    publication: {
      publish: unavailable,
      activate: unavailable,
      appendGenerationEvent: unavailable,
    },
  });
  async function inspect(id: string) {
    const source = await service.readGraph(id);
    if (
      source.changeSet.tenantId !== null ||
      source.graph.entity.ownershipModel !== "system"
    )
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "Only platform-owned products are available",
      );
    const artifact = compileGraph(source.graph);
    const tests = runContractTests(source.graph);
    const markers = (source.graph.surfaces ?? []).flatMap((s) => {
      const marker =
        s.layoutConfig?.systemReferenceProduct ??
        s.layoutConfig?.tableEntityProduct;
      return marker
        ? [marker as { targetPlanes: ("studio" | "neon" | "mesh")[] }]
        : [];
    });
    if (
      markers.length !== 1 ||
      !Array.isArray(markers[0]!.targetPlanes) ||
      !markers[0]!.targetPlanes.length
    )
      throw new AuthoringPolicyError(
        "SOURCE_INVALID",
        "A declared product target set is required",
      );
    const targets = markers[0]!.targetPlanes.map((plane) => {
      const target = compileSystemEntityTarget(source.graph, plane);
      return {
        plane,
        contractHash: target.artifact.contractHash,
        descriptorHash: target.artifact.descriptorHash,
      };
    });
    return {
      ...source,
      contractHash: artifact.contractHash,
      descriptorHash: artifact.descriptorHash,
      tests,
      targets,
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
      if (
        action === "submit" &&
        !(await ports.adopted(id, cs.revision, source.contractHash, actorId))
      )
        throw new AuthoringPolicyError(
          "ADOPTION_REQUIRED",
          "Adopt this exact revision before submitting",
        );
      if (
        action === "approve" &&
        (!cs.submittedBy ||
          cs.createdBy === actorId ||
          cs.submittedBy === actorId ||
          (await ports.adopted(
            id,
            cs.revision - 1,
            source.contractHash,
            actorId,
          )) ||
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
        revision: cs.revision + (action === "adopt" ? 0 : 1),
        status:
          action === "adopt"
            ? "draft"
            : action === "submit"
              ? "in_review"
              : "approved",
      };
      // The receipt, lifecycle transition and host audit either all commit or all roll back.
      await ports.record(receipt);
      if (action !== "adopt") {
        const next = await service[action]({
          changeSetId: id,
          actorId,
          expectedRevision: cs.revision,
        });
        if (
          next.revision !== receipt.revision ||
          next.status !== receipt.status
        )
          throw new AuthoringConflictError("Unexpected change-set transition");
      }
      return receipt;
    },
  };
}
