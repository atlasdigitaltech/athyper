import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityChangeCaseRecord } from "./entity-change-case.js";

/** Evidence port, not an authorization decision. No BP repository or storage
 * schema is implied. Command services must recheck evidence under write locks. */
export interface EntityCasePreflightEvidence {
  readonly record: EntityChangeCaseRecord;
  readonly currentSnapshot: {
    readonly id: string;
    readonly payloadHash: string;
  } | null;
  readonly submittedSnapshot: {
    readonly id: string;
    readonly payloadHash: string;
  } | null;
  /** Null means validation is absent, not that it passed. The evaluator must
   * compare rowVersion, snapshot and metadata coordinates to the current case. */
  readonly validation: {
    readonly id: string;
    readonly outcome: "passed" | "failed";
    readonly caseRowVersion: number;
    readonly snapshotId: string;
    readonly payloadHash: string;
    readonly metadataReleaseId: string;
    readonly metadataHash: string;
  } | null;
  readonly workflow: {
    readonly instanceId: string;
    readonly workflowKey: string;
    readonly workItemId: string;
    readonly ownerPrincipalId: string | null;
    readonly workItemStatus: string;
    readonly submittedSnapshotId: string;
  } | null;
  /** Approval is pinned to an immutable submitted snapshot and metadata release.
   * Presence alone is insufficient: the evaluator checks current correspondence
   * and actor separation before permitting materialization. */
  readonly approval: {
    readonly decidedBy: string;
    readonly decision: "approve" | "reject" | "return";
    readonly fingerprint: string;
    readonly submittedSnapshotId: string;
    readonly metadataReleaseId: string;
    readonly metadataHash: string;
  } | null;
}

export interface EntityCasePreflightEvidenceReader<Transaction> {
  /** Must read case, validation, workflow and approval in the caller's same
   * read-only snapshot, scoped to context.planeKey AND context.tenantId.
   * Return null for a missing case; throw for unavailable/inconsistent storage.
   * Never accept caller-supplied actor/approval/validation evidence as persisted
   * evidence. Context assurance remains input to a separate policy evaluator. */
  read(
    input: { readonly context: VerifiedRequestContext; readonly caseId: string },
    transaction: Transaction,
  ): Promise<EntityCasePreflightEvidence | null>;
}
