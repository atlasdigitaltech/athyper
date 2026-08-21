import type { AtlasFinishReason, AtlasProviderErrorClass, AtlasProviderUsage, AtlasPublicModelId } from "./model.js";

export const ATLAS_SSE_PROTOCOL = "atlas.sse/1" as const;
export type AtlasPublicStreamEvent =
  | { readonly type: "run.started"; readonly publicModelId: AtlasPublicModelId; readonly bindingRevision: string; readonly policyRevision: string; readonly promptRevision: string }
  | { readonly type: "message.delta"; readonly messageId: string; readonly text: string }
  | { readonly type: "tool.previewed"; readonly callId: string; readonly toolCode: string; readonly proposalId: string; readonly confirmationRequired: boolean }
  | { readonly type: "tool.completed"; readonly callId: string; readonly toolCode: string; readonly outcome: "completed" | "denied" | "failed" | "cancelled" }
  | { readonly type: "usage.updated"; readonly usage: AtlasProviderUsage }
  | { readonly type: "run.completed"; readonly messageId: string; readonly reason: AtlasFinishReason }
  | { readonly type: "run.failed"; readonly errorClass: AtlasProviderErrorClass; readonly code: string; readonly retryable: boolean }
  | { readonly type: "run.cancelled" };

export interface AtlasSseEnvelope {
  readonly protocol: typeof ATLAS_SSE_PROTOCOL;
  readonly sequence: number;
  readonly runId: string;
  readonly threadId: string;
  readonly emittedAt: string;
  readonly event: AtlasPublicStreamEvent;
}
