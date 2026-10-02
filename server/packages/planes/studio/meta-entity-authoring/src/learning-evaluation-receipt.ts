import { parseInstant } from "@athyper/platform-temporal";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";

export interface ControlledLearningFixtureSet {
  readonly id: string;
  readonly contentHash: string;
  readonly authorId: string;
  readonly approvedBy: string;
  readonly lockedAt: string;
}
interface EvaluationEvidence {
  readonly passed: boolean;
  readonly fixtureHash: string;
  readonly resolverVersion: string;
  readonly scoringVersion?: string;
  readonly fixtures?: readonly unknown[];
  readonly results: readonly unknown[];
}
export interface LearningEvaluationReceipt {
  readonly schema: "atlas-learning-evaluation-receipt/1";
  readonly proposalHash: string;
  readonly candidateId: string;
  readonly sourceReleaseId: string;
  readonly sourceDescriptorHash: string;
  readonly sourceContractHash: string;
  readonly entityCode: string;
  readonly tenantId: string;
  readonly originPlane: string;
  readonly evaluatedDescriptorHash: string;
  readonly evaluatedAiHash: string;
  readonly fixtureContentHash: string;
  readonly evaluatorFixtureHash: string;
  readonly resultHash: string;
  readonly resolverVersion: string;
  readonly scoringVersion: string;
  readonly fixtureGovernance: "reviewer-submitted" | "independently-controlled";
  readonly controlledFixtureSet?: ControlledLearningFixtureSet;
  readonly fixtureAuthorId: string;
  readonly evaluatedBy: string;
  readonly evaluatedAt: string;
}
interface ReceiptInput {
  readonly proposal: AtlasLearningHandoff;
  readonly descriptorHash: string;
  readonly ai: unknown;
  readonly evaluation: EvaluationEvidence;
  readonly reviewerId: string;
  readonly evaluatedAt: string;
  readonly controlledFixtureSet?: ControlledLearningFixtureSet;
}
/** Provenance of a reviewed narrow evaluation, not an independent benchmark attestation. */
export function createLearningEvaluationReceipt(
  input: ReceiptInput,
): LearningEvaluationReceipt {
  const { proposal, evaluation } = input;
  if (
    !evaluation.passed ||
    !evaluation.fixtures?.length ||
    !evaluation.results.length ||
    evaluation.results.length !== evaluation.fixtures.length ||
    evaluation.results.some(
      (result) =>
        !result ||
        typeof result !== "object" ||
        !("passed" in result) ||
        result.passed !== true,
    ) ||
    !evaluation.scoringVersion ||
    !evaluation.resolverVersion ||
    input.reviewerId === proposal.submittedBy ||
    !input.reviewerId ||
    !Number.isFinite(parseInstant(input.evaluatedAt))
  )
    throw new AuthoringPolicyError(
      "LEARNING_EVALUATION_RECEIPT_INVALID",
      "A successful versioned independent-reviewer evaluation is required",
    );
  const controlled = input.controlledFixtureSet;
  if (
    controlled &&
    (!controlled.id ||
      !Number.isFinite(parseInstant(controlled.lockedAt)) ||
      parseInstant(controlled.lockedAt) > parseInstant(input.evaluatedAt) ||
      controlled.contentHash !== sha256(evaluation.fixtures) ||
      !controlled.authorId ||
      !controlled.approvedBy ||
      controlled.authorId === controlled.approvedBy ||
      [proposal.submittedBy, input.reviewerId].includes(controlled.authorId) ||
      [proposal.submittedBy, input.reviewerId].includes(controlled.approvedBy))
  )
    throw new AuthoringPolicyError(
      "LEARNING_FIXTURE_PROVENANCE_INVALID",
      "Controlled fixtures require verified content and independent authorship and approval",
    );
  return {
    schema: "atlas-learning-evaluation-receipt/1",
    proposalHash: proposal.proposalHash,
    candidateId: proposal.candidateId,
    sourceReleaseId: proposal.sourceReleaseId,
    sourceDescriptorHash: proposal.sourceDescriptorHash,
    sourceContractHash: proposal.sourceContractHash,
    entityCode: proposal.entityCode,
    tenantId: proposal.tenantId,
    originPlane: proposal.originPlane,
    evaluatedDescriptorHash: input.descriptorHash,
    evaluatedAiHash: sha256(input.ai),
    fixtureContentHash: sha256(evaluation.fixtures),
    evaluatorFixtureHash: evaluation.fixtureHash,
    resultHash: sha256(evaluation.results),
    resolverVersion: evaluation.resolverVersion,
    scoringVersion: evaluation.scoringVersion,
    fixtureGovernance: controlled
      ? "independently-controlled"
      : "reviewer-submitted",
    ...(controlled ? { controlledFixtureSet: controlled } : {}),
    fixtureAuthorId: controlled?.authorId ?? input.reviewerId,
    evaluatedBy: input.reviewerId,
    evaluatedAt: input.evaluatedAt,
  };
}
export function assertLearningEvaluationReceipt(
  input: Omit<ReceiptInput, "evaluatedAt"> & {
    readonly receipt?: LearningEvaluationReceipt;
  },
): asserts input is typeof input & {
  readonly receipt: LearningEvaluationReceipt;
} {
  const receipt = input.receipt;
  if (
    !receipt ||
    sha256(receipt) !==
      sha256(
        createLearningEvaluationReceipt({
          ...input,
          evaluatedAt: receipt.evaluatedAt,
          controlledFixtureSet: receipt.controlledFixtureSet,
        }),
      )
  )
    throw new AuthoringPolicyError(
      "LEARNING_EVALUATION_RECEIPT_INVALID",
      "Evaluation evidence no longer matches the reviewed artifact",
    );
}
