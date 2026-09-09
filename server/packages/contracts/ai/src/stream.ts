import type { AtlasInsightResult } from "./insights.js";
import type { AtlasFinishReason, AtlasProviderErrorClass, AtlasProviderUsage, AtlasPublicModelId } from "./model.js";
import type { AtlasRecordSourceCoordinate } from "./records.js";
import type { AtlasToolAccess, AtlasToolRisk } from "./tools.js";

export const ATLAS_SSE_PROTOCOL = "atlas.sse/1" as const;
export type AtlasPublicStreamEvent =
  | { readonly type: "run.started"; readonly publicModelId: AtlasPublicModelId; readonly bindingRevision: string; readonly policyRevision: string; readonly promptRevision: string }
  | { readonly type: "message.delta"; readonly messageId: string; readonly text: string }
  | { readonly type: "tool.previewed"; readonly callId: string; readonly toolCode: string; readonly proposalId: string; readonly summary: string; readonly access: AtlasToolAccess; readonly risk: AtlasToolRisk; readonly confirmationRequired: boolean; readonly confirmationToken?: string; readonly arguments?: Readonly<Record<string, unknown>>; readonly affectedEntityType?: string; readonly affectedEntityId?: string; readonly expectedRowVersion?: number; readonly expiresAt?: string }
  | { readonly type: "tool.completed"; readonly callId: string; readonly toolCode: string; readonly outcome: "completed" | "denied" | "failed" | "cancelled" }
  | { readonly type: "insight.cited"; readonly callId: string; readonly insight: AtlasInsightResult }
  | { readonly type: "source.cited"; readonly callId: string; readonly toolCode: string; readonly coordinate: AtlasRecordSourceCoordinate }
  | { readonly type: "attachment.cited"; readonly attachmentId: string; readonly fileName: string; readonly contentType: string; readonly sha256: string }
  | { readonly type: "usage.updated"; readonly usage: AtlasProviderUsage }
  | { readonly type: "run.completed"; readonly messageId: string; readonly reason: AtlasFinishReason }
  | { readonly type: "run.failed"; readonly errorClass: AtlasProviderErrorClass; readonly code: string; readonly retryable: boolean }
  | { readonly type: "run.cancelled" };

export interface AtlasSseEnvelope {
  readonly contextGenerationId?: string;
  readonly protocol: typeof ATLAS_SSE_PROTOCOL;
  readonly sequence: number;
  readonly runId: string;
  readonly threadId: string;
  readonly emittedAt: string;
  readonly event: AtlasPublicStreamEvent;
}
