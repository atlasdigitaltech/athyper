export type AtlasProviderId = "anthropic" | "openai" | "gemini";
export type AtlasPublicModelId = "atlas-fast" | "atlas-balanced" | "atlas-best" | (string & {});
export type AtlasDataClass = "public" | "internal" | "confidential" | "restricted" | "synthetic";

export interface AtlasModelCapabilities {
  readonly streaming: boolean;
  readonly tools: boolean;
  readonly vision: boolean;
  readonly structuredOutput: boolean;
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
}

/** One immutable, server-owned public-mode to upstream-model decision. */
export interface AtlasModelBinding {
  readonly bindingId: string;
  readonly bindingRevision: string;
  readonly publicModelId: AtlasPublicModelId;
  readonly providerId: AtlasProviderId;
  readonly upstreamModelId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly displayTier: "fast" | "balanced" | "best";
  readonly exposure: "product" | "internal_evaluation";
  readonly status: "available" | "restricted" | "disabled";
  readonly capabilities: AtlasModelCapabilities;
  readonly credentialPolicy: "platform" | "tenant_required";
  readonly credentialOwnerId: string;
  readonly providerRegion: string;
  readonly dataHandlingProfileId: string;
  readonly routingPolicyId: "no-fallback-v1";
  readonly allowedDataClasses: readonly AtlasDataClass[];
  readonly priceVersion: string;
  readonly inputPricePerMtokUsd: number | null;
  readonly outputPricePerMtokUsd: number | null;
  readonly cacheReadPricePerMtokUsd?: number | null;
  readonly cacheWritePricePerMtokUsd?: number | null;
  readonly reasoningPricePerMtokUsd?: number | null;
}

export interface AtlasTextBlock { readonly type: "text"; readonly text: string }
export interface AtlasToolUseBlock { readonly type: "tool_use"; readonly callId: string; readonly toolName: string; readonly input: Readonly<Record<string, unknown>> }
export interface AtlasToolResultBlock { readonly type: "tool_result"; readonly callId: string; readonly toolName: string; readonly result: unknown; readonly isError?: boolean }
export type AtlasContentBlock = AtlasTextBlock | AtlasToolUseBlock | AtlasToolResultBlock;
export type AtlasMessageRole = "system" | "user" | "assistant" | "tool";
export interface AtlasModelMessage { readonly role: AtlasMessageRole; readonly content: readonly AtlasContentBlock[] }
export interface AtlasProviderToolDefinition { readonly name: string; readonly description: string; readonly inputSchema: Readonly<Record<string, unknown>> }

export interface AtlasModelPrompt {
  readonly messages: readonly AtlasModelMessage[];
  readonly maxOutputTokens: number;
  readonly tools?: readonly AtlasProviderToolDefinition[];
}

/** Secret leases are resolved server-side after exact binding resolution. */
export interface AtlasProviderCredentialLease {
  readonly secret: string;
  readonly credentialId: string;
  readonly credentialRevision: string;
  readonly ownerId: string;
  readonly expiresAt?: string;
}

export interface AtlasProviderInvocation {
  readonly binding: AtlasModelBinding;
  readonly credential: AtlasProviderCredentialLease;
  readonly prompt: AtlasModelPrompt;
  readonly signal?: AbortSignal;
  readonly trace: {
    readonly runId: string;
    readonly providerCallId: string;
    readonly tenantId: string;
    readonly principalHash: string;
    readonly safetyIdentifier: string;
    readonly promptRevision: string;
    readonly policyRevision: string;
  };
}

export type AtlasFinishReason = "stop" | "length" | "tool_call" | "content_filter" | "refusal" | "cancelled" | "incomplete" | "error";
export type AtlasProviderErrorClass = "authentication" | "permission" | "invalid_request" | "model_unavailable" | "rate_limited" | "quota_exhausted" | "overloaded" | "timeout" | "safety_block" | "stream_incomplete" | "protocol_error" | "upstream_error" | "cancelled";
export interface AtlasProviderError { readonly errorClass: AtlasProviderErrorClass; readonly code: string; readonly safeMessage: string; readonly retryable: boolean; readonly retryAfterMs?: number }
export interface AtlasProviderUsage { readonly inputTokens?: number; readonly outputTokens?: number; readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number; readonly reasoningTokens?: number }

export type AtlasProviderEvent =
  | { readonly kind: "response_started"; readonly providerRequestId: string | null; readonly actualModelId: string }
  | { readonly kind: "text_delta"; readonly text: string }
  | { readonly kind: "refusal"; readonly reasonCode: string }
  | { readonly kind: "tool_call_start"; readonly callId: string; readonly toolName: string }
  | { readonly kind: "tool_call_input_delta"; readonly callId: string; readonly jsonFragment: string }
  | { readonly kind: "tool_call_complete"; readonly callId: string; readonly toolName: string; readonly input: Readonly<Record<string, unknown>> }
  | { readonly kind: "usage"; readonly mode: "snapshot" | "delta"; readonly final: boolean; readonly usage: AtlasProviderUsage }
  | { readonly kind: "completed"; readonly reason: AtlasFinishReason }
  | { readonly kind: "failed"; readonly error: AtlasProviderError }
  | { readonly kind: "cancelled" };

export interface AtlasModelProvider {
  readonly providerId: AtlasProviderId;
  readonly adapterId: string;
  readonly adapterVersion: string;
  invoke(invocation: AtlasProviderInvocation): AsyncIterable<AtlasProviderEvent>;
}

export interface AtlasProviderCredentialResolver {
  resolve(input: { readonly tenantId: string; readonly binding: AtlasModelBinding }): Promise<AtlasProviderCredentialLease | null>;
}
