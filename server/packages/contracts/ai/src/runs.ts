import type { AtlasReplayInput, AtlasReplayCompletion } from "./replay.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasContentBlock, AtlasFinishReason, AtlasProviderErrorClass, AtlasProviderId, AtlasProviderUsage, AtlasPublicModelId } from "./model.js";

export type AtlasRunStatus = "started" | "completed" | "failed" | "cancelled";
export interface AtlasRun {
  readonly runId: string;
  readonly threadId: string;
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly principalId: string;
  readonly clientRequestId: string;
  readonly inputMessageId: string;
  readonly outputMessageId: string;
  readonly status: AtlasRunStatus;
  readonly publicModelId: AtlasPublicModelId;
  readonly bindingId: string;
  readonly bindingRevision: string;
  readonly policyRevision: string;
  readonly promptRevision: string;
  readonly startedAt: string;
  readonly terminalAt: string | null;
  readonly finishReason?: AtlasFinishReason;
  readonly terminalErrorClass: AtlasProviderErrorClass | null;
}

export interface AtlasBeginRunInput {
  readonly replayInput?: AtlasReplayInput;
  readonly context: VerifiedRequestContext;
  readonly runId: string;
  readonly threadId: string;
  readonly clientRequestId: string;
  readonly inputMessageId: string;
  readonly outputMessageId: string;
  readonly userContent: readonly AtlasContentBlock[];
  readonly publicModelId: AtlasPublicModelId;
  readonly bindingId: string;
  readonly bindingRevision: string;
  readonly policyRevision: string;
  readonly promptRevision: string;
  readonly startedAt: string;
  readonly expectedLastMessageSequence?: number;
  readonly requestFingerprint?: string;
}
export interface AtlasBeginRunResult { readonly replayed: boolean; readonly run: AtlasRun; readonly replayedOutput?: readonly AtlasContentBlock[] }

export interface AtlasRunRepository {
  begin(input: AtlasBeginRunInput): Promise<AtlasBeginRunResult>;
  get(input: { readonly context: VerifiedRequestContext; readonly runId: string }): Promise<AtlasRun | null>;
  complete(input: { readonly context: VerifiedRequestContext; readonly runId: string; readonly assistantContent: readonly AtlasContentBlock[]; readonly replayCompletion?: AtlasReplayCompletion; readonly completedAt: string }): Promise<AtlasRun | null>;
  fail(input: { readonly context: VerifiedRequestContext; readonly runId: string; readonly errorClass: AtlasProviderErrorClass; readonly failedAt: string }): Promise<AtlasRun | null>;
  cancel(input: { readonly context: VerifiedRequestContext; readonly runId: string; readonly cancelledAt: string }): Promise<AtlasRun | null>;
}

/** Content-free operational and cost record. Prompt, response, arguments, and results have no fields here. */
export interface AtlasUsageLedgerEntry {
  readonly ledgerId: string;
  readonly runId: string;
  readonly providerCallId: string;
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly principalHash: string;
  readonly providerId: AtlasProviderId;
  readonly providerRequestId: string | null;
  readonly credentialId: string | null;
  readonly credentialRevision: string | null;
  readonly credentialOwnerId: string;
  readonly providerRegion: string;
  readonly publicModelId: AtlasPublicModelId;
  readonly bindingId: string;
  readonly bindingRevision: string;
  readonly actualModelId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly policyRevision: string;
  readonly promptRevision: string;
  readonly priceVersion: string;
  readonly usage: AtlasProviderUsage;
  readonly inputCostUsd: number | null;
  readonly outputCostUsd: number | null;
  readonly totalCostUsd: number | null;
  readonly finishReason: AtlasFinishReason;
  readonly errorClass: AtlasProviderErrorClass | null;
  readonly errorCode?: string;
  readonly readinessDiagnostics?: {readonly modelDigest:string;readonly queueWaitMs:number;readonly loadDurationMs:number;readonly readinessChecks:number};
  readonly durationMs: number;
  readonly recordedAt: string;
}
export interface AtlasUsageLedger { append(entry: AtlasUsageLedgerEntry, context?: VerifiedRequestContext): Promise<void> }
