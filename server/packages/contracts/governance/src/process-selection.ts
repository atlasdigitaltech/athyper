import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  ProcessDocumentBinding,
  ProcessExecutionManifest,
  ProcessMinimumControl,
  ProcessPolicyRevision,
  ProcessProfileRevision,
  ProcessRequirement,
  ProcessRevision,
  ProcessScope,
} from "@athyper/server-contract-control-admin";

export interface ProcessAttemptCoordinate {
  readonly scope: ProcessScope;
  readonly caseId: string;
  readonly cycleRunId: string;
  readonly selectionId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly submissionSnapshot: ProcessRevision;
  readonly manifest: ProcessRevision;
}
export interface ProcessTaskExecutionCoordinate extends ProcessAttemptCoordinate {
  readonly taskTemplateId: string;
  readonly cycleTaskId: string;
  readonly workflowRequestId: string;
  readonly workflowStageId: string;
  readonly workItemId: string;
}
export interface ProcessSelectionEvidence {
  readonly coordinate: ProcessAttemptCoordinate;
  readonly policy: ProcessPolicyRevision;
  /** Original policy eligibility date; current authorityAsOf still governs controls. */
  readonly policyEffectiveOn?: string;
  readonly evaluatorVersion: string;
  readonly factSchema: ProcessRevision;
  readonly factHash: string;
  readonly authorityAsOf: string;
  readonly requestedRequirement: ProcessRequirement;
  readonly candidateProfile: ProcessProfileRevision;
  readonly effectiveProfile: ProcessProfileRevision;
  readonly minimumControls: readonly ProcessMinimumControl[];
  readonly trace: readonly {
    readonly ruleId: string;
    readonly priority: number;
    readonly result: "matched" | "false" | "not_evaluated";
  }[];
  readonly winningRuleId: string;
  readonly executionManifest: ProcessExecutionManifest;
  readonly actorPrincipalId: string;
  readonly reason: string | null;
  readonly acceptedAt: string;
  readonly idempotencyKey: string;
}

/** Commit intent in the case transaction; worker renders after commit. No mutable data bag. */
export interface ProcessDocumentIntent {
  readonly activationEvidence?: ProcessRevision;
  readonly coordinate: ProcessAttemptCoordinate;
  readonly binding: ProcessDocumentBinding;
  readonly sourceSnapshot: ProcessRevision;
  readonly idempotencyKey: string;
  readonly requestedBy: string;
}
export type ProcessDocumentGateResult = {
  readonly coordinate: ProcessAttemptCoordinate;
  readonly purpose: ProcessDocumentBinding["purpose"];
  readonly jobId: string;
  readonly sourceSnapshot: ProcessRevision;
  readonly template: ProcessDocumentBinding["template"];
  readonly idempotencyKey: string;
} & (
  | {
      readonly status: "ready";
      readonly attachmentId: string;
      readonly attachmentVersionId: string;
      readonly sha256: string;
      readonly scanStatus: "clean";
      readonly scannedAt: string;
    }
  | {
      readonly status: "failed";
      readonly code: string;
      readonly retryable: boolean;
    }
);
export interface ProcessDocumentPort<Transaction> {
  enqueue(
    context: VerifiedRequestContext,
    intent: ProcessDocumentIntent,
    transaction: Transaction,
  ): Promise<{ readonly jobId: string; readonly replayed: boolean }>;
  acceptResult(
    context: VerifiedRequestContext,
    result: ProcessDocumentGateResult,
    transaction: Transaction,
  ): Promise<"accepted" | "replayed" | "stale">;
}

/** Resolved by the case/domain owner under the caller's transaction, never from preview input. */
export interface ProcessSelectionFacts {
  readonly scope: ProcessScope;
  readonly caseId: string;
  readonly snapshot: ProcessRevision;
  readonly requestedRequirement?: ProcessRequirement;
  readonly reason: string | null;
  readonly minimumControls: readonly ProcessMinimumControl[];
  readonly authorityAsOf: string;
}
export interface ProcessSelectionEvaluation {
  readonly policy: ProcessPolicyRevision;
  /** Original policy eligibility date; current authorityAsOf still governs controls. */
  readonly policyEffectiveOn?: string;
  readonly evaluatorVersion: string;
  readonly factSchema: ProcessRevision;
  readonly factHash: string;
  readonly authorityAsOf: string;
  readonly requestedRequirement: ProcessRequirement;
  readonly candidateProfile: ProcessProfileRevision;
  readonly effectiveProfile: ProcessProfileRevision;
  readonly minimumControls: readonly ProcessMinimumControl[];
  readonly trace: ProcessSelectionEvidence["trace"];
  readonly winningRuleId: string;
  readonly executionManifest: ProcessExecutionManifest;
}
export type ProcessSelectionPreview =
  | { readonly status: "ready"; readonly selection: ProcessSelectionEvaluation }
  | { readonly status: "incomplete" | "unavailable"; readonly code: string };
export interface ProcessSelectionEvidenceRepository<Transaction> {
  /** Insert-only. Replays must agree on all accepted evidence except wall-clock time. */
  append(
    evidence: ProcessSelectionEvidence,
    transaction: Transaction,
  ): Promise<ProcessSelectionEvidence>;
  get(
    scope: ProcessScope,
    selectionId: string,
    transaction: Transaction,
  ): Promise<ProcessSelectionEvidence | undefined>;
}

export interface ProcessSelectionService<Transaction> {
  preview(
    context: VerifiedRequestContext,
    caseId: string,
    transaction: Transaction,
  ): Promise<ProcessSelectionPreview>;
  select(
    context: VerifiedRequestContext,
    caseId: string,
    coordinate: ProcessAttemptCoordinate,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<ProcessSelectionEvidence>;
}
