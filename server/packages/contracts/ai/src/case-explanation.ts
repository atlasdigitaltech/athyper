import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
export interface AtlasCaseExplanation {
  readonly caseId: string;
  readonly rowVersion: number;
  readonly snapshotId: string;
  readonly descriptorHash: string;
  readonly status: string;
  readonly validation: "passed" | "failed" | "not_evaluated";
  readonly findings: readonly { readonly code: string; readonly message: string }[];
  readonly coverage: "partial";
  readonly diff: {
    readonly state: "partial" | "unavailable";
    readonly baseline: "previous_saved_snapshot";
    readonly baselineSnapshotId?: string;
    readonly baselineRevision?: number;
    readonly changes: readonly { readonly field: string; readonly before: string | null; readonly after: string | null }[];
  };
}

export interface AtlasCaseExplanationOwner { read(input: { readonly context: VerifiedRequestContext; readonly requestId: string; readonly expectedVersion?: number; readonly businessPartnerId?: string }): Promise<AtlasCaseExplanation> }
